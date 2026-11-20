import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { cleanEnv } from '../apoyo/red';

// El proceso de trabajo de materiales no tiene red (Fase 13): lo primero que carga es un guardián
// que rechaza los módulos de red y anula fetch, WebSocket y las conexiones. Se prueba en un
// proceso de Node aparte que carga el guardián e intenta conectarse a un servidor local de la
// prueba: nada tiene que llegar al servidor.

const GUARD = join(ROOT, 'src', 'main', 'workers', 'net-guard.ts');

function runGuarded(port: number): Promise<{ results: Record<string, string>; stderr: string }> {
  const script = `
    await import(${JSON.stringify(new URL(`file:///${GUARD.replaceAll('\\', '/')}`).href)});
    const results = {};
    const attempt = async (name, work) => {
      try { await work(); results[name] = 'conectó'; } catch { results[name] = 'bloqueado'; }
    };
    const url = 'http://127.0.0.1:${port}/robo';
    await attempt('fetch', () => fetch(url));
    await attempt('http', async () => { const http = await import('node:http'); await new Promise((ok, ko) => http.get(url, ok).on('error', ko)); });
    await attempt('net', async () => { const net = await import('node:net'); await new Promise((ok, ko) => net.connect(${port}, '127.0.0.1', ok).on('error', ko)); });
    await attempt('child_process', async () => { const cp = await import('node:child_process'); cp.execSync('echo hola'); });
    await attempt('WebSocket', () => new Promise((ok, ko) => { const ws = new WebSocket('ws://127.0.0.1:${port}'); ws.onopen = ok; ws.onerror = ko; }));
    await attempt('getBuiltinModule child_process', async () => { process.getBuiltinModule('node:child_process').execSync('echo hola'); });
    await attempt('getBuiltinModule dgram', async () => { const dgram = process.getBuiltinModule('dgram'); const socket = dgram.createSocket('udp4'); await new Promise((ok, ko) => socket.send('robo', ${port}, '127.0.0.1', (error) => { socket.close(); error ? ko(error) : ok(); })); });
    await attempt('electron', async () => { await import('electron'); });
    await attempt('worker_threads eval', async () => { const { Worker } = await import('node:worker_threads'); await new Promise((ok, ko) => { const worker = new Worker('fetch(' + JSON.stringify(url) + ').then(() => process.exit(0), () => process.exit(1))', { eval: true }); worker.once('exit', (code) => (code === 0 ? ok() : ko(new Error('falló')))); worker.once('error', ko); }); });
    await attempt('worker_threads', async () => {
      const { Worker } = await import('node:worker_threads');
      const fs = await import('node:fs'); const path = await import('node:path'); const os = await import('node:os');
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retenia-hilo-')), 'hilo.cjs');
      fs.writeFileSync(file, 'const { parentPort } = require("node:worker_threads"); fetch(' + JSON.stringify(url) + ').then(() => parentPort.postMessage("conectó"), () => parentPort.postMessage("bloqueado"));');
      const answer = await new Promise((ok, ko) => { const worker = new Worker(file); worker.once('message', (value) => { ok(value); worker.terminate(); }); worker.once('error', ko); });
      if (answer !== 'conectó') throw new Error(String(answer));
    });
    process.stdout.write(JSON.stringify(results));
  `;
  return new Promise((resolve) => {
    const running = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: cleanEnv(),
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    running.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    running.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    running.on('close', () =>
      resolve({ results: stdout ? (JSON.parse(stdout) as Record<string, string>) : {}, stderr }),
    );
  });
}

describe('sin red', () => {
  it('el proceso de materiales no puede conectarse a nada: fetch, http, net, WebSocket, otros programas, módulos pedidos por otro camino ni hilos nuevos', async () => {
    const calls: string[] = [];
    const server = createServer((request, response) => {
      calls.push(request.url ?? '');
      response.end();
    });
    server.on('connection', () => calls.push('conexión'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { results, stderr } = await runGuarded(port);
      expect(results, stderr).toEqual({
        fetch: 'bloqueado',
        http: 'bloqueado',
        net: 'bloqueado',
        child_process: 'bloqueado',
        WebSocket: 'bloqueado',
        'getBuiltinModule child_process': 'bloqueado',
        'getBuiltinModule dgram': 'bloqueado',
        electron: 'bloqueado',
        'worker_threads eval': 'bloqueado',
        worker_threads: 'bloqueado',
      });
      expect(calls).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('el guardián es lo primero que carga el proceso de materiales', () => {
    const entry = readFileSync(join(ROOT, 'src', 'main', 'workers', 'materials.ts'), 'utf8');
    const firstImport = entry.split('\n').find((line) => line.startsWith('import'));
    expect(firstImport).toBe("import './net-guard';");
  });
});
