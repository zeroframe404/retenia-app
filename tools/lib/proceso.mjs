import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stopwatch } from './reloj.mjs';

export const ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * @typedef {{ cwd?: string, env?: NodeJS.ProcessEnv, input?: string, timeoutMs?: number }} RunOptions
 * @typedef {{ code: number, stdout: string, stderr: string, durationMs: number, timedOut: boolean }} RunResult
 */

/** @param {import('node:child_process').ChildProcess} child */
function killTree(child) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}

// Corre un programa sin pasar por una consola intermedia y junta todo lo que escribe.
// Con timeoutMs, si tarda más lo corta (con sus procesos hijos) y lo informa.
/**
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions} [options]
 * @returns {Promise<RunResult>}
 */
export function run(command, args, { cwd = ROOT, env = process.env, input, timeoutMs } = {}) {
  return new Promise((done) => {
    const elapsed = stopwatch();
    const child = spawn(command, args, { cwd, env, windowsHide: true });
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, timeoutMs)
      : null;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      done({
        code: -1,
        stdout,
        stderr: `${stderr}${error.message}`,
        durationMs: elapsed(),
        timedOut,
      });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      done({ code: code ?? -1, stdout, stderr, durationMs: elapsed(), timedOut });
    });
    child.stdin.end(input);
  });
}

// Ruta al script de línea de comandos de un paquete instalado, para correrlo con Node.
/**
 * @param {string} name
 * @param {string} [bin]
 * @param {string} [root]
 * @returns {string}
 */
export function packageBin(name, bin = name, root = ROOT) {
  const folder = join(root, 'node_modules', name);
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
  return join(folder, typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[bin]);
}

/**
 * @param {string} name
 * @param {string} bin
 * @param {string[]} args
 * @param {RunOptions} [options]
 * @returns {Promise<RunResult>}
 */
export function runPackage(name, bin, args, options = {}) {
  return run(process.execPath, [packageBin(name, bin, options.cwd), ...args], options);
}

// npm, sin depender de que «npm.cmd» esté en el PATH de Windows.
export function npmCliPath() {
  return process.env.npm_execpath?.endsWith('.js')
    ? process.env.npm_execpath
    : join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

/** @param {string} text */
export function stripColors(text) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: quita los códigos de color de la consola.
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

// El primer JSON que aparece en la salida de una herramienta (algunas escriben algo antes).
/** @param {string} text @returns {any} */
export function firstJson(text) {
  const clean = stripColors(text);
  const start = clean.search(/[[{]/);
  return start === -1 ? null : JSON.parse(clean.slice(start));
}
