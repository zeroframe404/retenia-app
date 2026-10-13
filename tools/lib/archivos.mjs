import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { correr } from './proceso.mjs';

const CARPETAS_IGNORADAS = new Set([
  '.git',
  'node_modules',
  'out',
  '.cache',
  'datos-locales',
  'coverage',
  'playwright-report',
  'test-results',
]);

function recorrer(raiz, carpeta, lista) {
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    if (CARPETAS_IGNORADAS.has(entrada.name)) {
      continue;
    }
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      recorrer(raiz, ruta, lista);
    } else if (entrada.isFile()) {
      lista.push(relative(raiz, ruta).split(sep).join('/'));
    }
  }
}

// Archivos del proyecto: los que sigue git más los nuevos que no están ignorados.
/** @param {string} raiz @returns {Promise<string[]>} */
export async function archivosDelProyecto(raiz) {
  const git = await correr(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: raiz },
  );
  if (git.codigo === 0) {
    const vistos = new Set(git.salida.split('\0').filter(Boolean));
    return [...vistos].filter((ruta) => existsSync(join(raiz, ruta))).sort();
  }
  const lista = [];
  recorrer(raiz, raiz, lista);
  return lista.sort();
}

// Huella del estado del proyecto: cambia si cambia cualquier archivo, salvo los excluidos.
export async function huellaDelProyecto(raiz, excluir = []) {
  const hash = createHash('sha256');
  for (const ruta of await archivosDelProyecto(raiz)) {
    if (excluir.includes(ruta)) {
      continue;
    }
    hash.update(ruta);
    hash.update('\0');
    hash.update(readFileSync(join(raiz, ruta)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
