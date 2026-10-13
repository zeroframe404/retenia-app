import { correrPaquete, jsonDe } from './proceso.mjs';
import { titulosDeListadoDePlaywright, titulosDeListadoDeVitest } from './resultados.mjs';

// Todas las pruebas de la red, sin correrlas: las de Vitest y las de punta a punta.
/** @param {{ env?: NodeJS.ProcessEnv }} [opciones] */
export async function listarTitulos({ env = process.env } = {}) {
  const [v, p] = await Promise.all([
    correrPaquete('vitest', 'vitest', ['list', '--json'], { env }),
    correrPaquete('@playwright/test', 'playwright', ['test', '--list', '--reporter=json'], { env }),
  ]);
  const titulos = [];
  const errores = [];
  try {
    titulos.push(...titulosDeListadoDeVitest(jsonDe(v.salida)));
  } catch {
    errores.push({ nombre: 'listado-vitest', r: v });
  }
  try {
    titulos.push(...titulosDeListadoDePlaywright(jsonDe(p.salida)));
  } catch {
    errores.push({ nombre: 'listado-punta-a-punta', r: p });
  }
  return { titulos, errores, crudos: { vitest: v, puntaAPunta: p } };
}
