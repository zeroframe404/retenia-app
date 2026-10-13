import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { cronometro } from './reloj.mjs';

export const RAIZ = resolve(import.meta.dirname, '..', '..');

function cortar(hijo) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { windowsHide: true });
  } else {
    hijo.kill('SIGKILL');
  }
}

/**
 * @typedef {{ cwd?: string, env?: NodeJS.ProcessEnv, entrada?: string, limiteMs?: number }} Opciones
 * @typedef {{ codigo: number, salida: string, errores: string, duracionMs: number, vencido: boolean }} Resultado
 */

// Corre un programa sin pasar por una consola intermedia y junta todo lo que escribe.
// Con limiteMs, si tarda más lo corta (con sus procesos hijos) y lo informa.
/**
 * @param {string} comando
 * @param {string[]} args
 * @param {Opciones} [opciones]
 * @returns {Promise<Resultado>}
 */
export function correr(comando, args, { cwd = RAIZ, env = process.env, entrada, limiteMs } = {}) {
  return new Promise((listo) => {
    const medir = cronometro();
    const hijo = spawn(comando, args, { cwd, env, windowsHide: true });
    let vencido = false;
    const reloj = limiteMs
      ? setTimeout(() => {
          vencido = true;
          cortar(hijo);
        }, limiteMs)
      : null;
    let salida = '';
    let errores = '';
    hijo.stdout.on('data', (d) => {
      salida += d;
    });
    hijo.stderr.on('data', (d) => {
      errores += d;
    });
    hijo.on('error', (error) => {
      if (reloj) clearTimeout(reloj);
      listo({
        codigo: -1,
        salida,
        errores: `${errores}${error.message}`,
        duracionMs: medir(),
        vencido,
      });
    });
    hijo.on('close', (codigo) => {
      if (reloj) clearTimeout(reloj);
      listo({ codigo: codigo ?? -1, salida, errores, duracionMs: medir(), vencido });
    });
    if (entrada !== undefined) {
      hijo.stdin.end(entrada);
    } else {
      hijo.stdin.end();
    }
  });
}

// Ruta al script de línea de comandos de un paquete instalado, para correrlo con Node.
/**
 * @param {string} paquete
 * @param {string} [nombre]
 * @param {string} [raiz]
 * @returns {string}
 */
export function binario(paquete, nombre = paquete, raiz = RAIZ) {
  const carpeta = join(raiz, 'node_modules', paquete);
  const { bin } = JSON.parse(readFileSync(join(carpeta, 'package.json'), 'utf8'));
  const relativo = typeof bin === 'string' ? bin : bin[nombre];
  return join(carpeta, relativo);
}

/**
 * @param {string} paquete
 * @param {string} nombre
 * @param {string[]} args
 * @param {Opciones} [opciones]
 * @returns {Promise<Resultado>}
 */
export function correrPaquete(paquete, nombre, args, opciones = {}) {
  return correr(process.execPath, [binario(paquete, nombre, opciones.cwd), ...args], opciones);
}

// npm, sin depender de que «npm.cmd» esté en el PATH de Windows.
export function rutaDeNpm() {
  return process.env.npm_execpath?.endsWith('.js')
    ? process.env.npm_execpath
    : join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

export function sinColores(texto) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: quita los códigos de color de la consola.
  return texto.replace(/\u001b\[[0-9;]*m/g, '');
}

// El primer JSON que aparece en la salida de una herramienta (algunas escriben algo antes).
/** @param {string} texto @returns {any} */
export function jsonDe(texto) {
  const limpio = sinColores(texto);
  const desde = limpio.search(/[[{]/);
  return desde === -1 ? null : JSON.parse(limpio.slice(desde));
}
