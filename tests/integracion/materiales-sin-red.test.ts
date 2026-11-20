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
  it('el proceso de materiales no puede conectarse a nada: fetch, http, net, WebSocket ni otros programas', async () => {
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
