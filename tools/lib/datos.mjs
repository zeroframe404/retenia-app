import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RAIZ } from './proceso.mjs';

// La carpeta de datos que usa «npm run iniciar». RETENIA_DATOS la cambia (la usan las pruebas).
export const CARPETA_DE_DEMOSTRACION = process.env.RETENIA_DATOS
  ? resolve(process.env.RETENIA_DATOS)
  : join(RAIZ, 'datos-locales', 'demostracion');

const LEEME =
  'Carpeta de datos de demostración de Retenia.\n' +
  'La usa «npm run iniciar» y la deja como nueva «npm run datos:reiniciar».\n';

// Estado conocido de la Fase 02: la carpeta vacía con este aviso. Desde la Fase 03 también
// lleva el elenco.
export function reiniciarDatosDeDemostracion(carpeta = CARPETA_DE_DEMOSTRACION) {
  rmSync(carpeta, { recursive: true, force: true });
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'LEEME.txt'), LEEME);
}
