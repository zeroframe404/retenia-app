import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT } from './proceso.mjs';

// La carpeta de datos que usa «npm run iniciar». RETENIA_DATOS la cambia (la usan las pruebas).
export const DEMO_DATA_DIR = process.env.RETENIA_DATOS
  ? resolve(process.env.RETENIA_DATOS)
  : join(ROOT, 'datos-locales', 'demostracion');

const MARKER = 'LEEME.txt';
const MARKER_TEXT =
  'Carpeta de datos de demostración de Retenia.\n' +
  'La usa «npm run iniciar» y la deja como nueva «npm run datos:reiniciar».\n';

// Solo se borra una carpeta que es de demostración: la del proyecto, una vacía o una que
// tiene la marca que deja este mismo reinicio.
/** @param {string} folder */
function isDemoFolder(folder) {
  const inside = relative(join(ROOT, 'datos-locales'), folder);
  if (inside !== '' && !inside.startsWith('..') && !/^[a-zA-Z]:/.test(inside)) {
    return true;
  }
  if (!existsSync(folder) || readdirSync(folder).length === 0) {
    return true;
  }
  const marker = join(folder, MARKER);
  return existsSync(marker) && readFileSync(marker, 'utf8') === MARKER_TEXT;
}

// Estado conocido: la carpeta vacía con su marca. Retenia (prueba) siembra sus tarjetas de
// ejemplo la primera vez que abre una base vacía (src/main/demo/seed.ts), así que después de
// reiniciar y abrir aparecen las tres de la Fase 03; el elenco completo llega en las fases siguientes.
/** @param {string} [folder] */
export function resetDemoData(folder = DEMO_DATA_DIR) {
  if (!isDemoFolder(folder)) {
    throw new Error(
      `No reinicio ${folder}: no parece una carpeta de datos de demostración (no tiene su ${MARKER}).`,
    );
  }
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, MARKER), MARKER_TEXT);
}
