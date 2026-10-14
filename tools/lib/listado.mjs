import { firstJson, runPackage } from './proceso.mjs';
import { titlesFromPlaywrightList, titlesFromVitestList } from './resultados.mjs';

// Todas las pruebas de la red, sin correrlas: las de Vitest y las de punta a punta.
/** @param {{ env?: NodeJS.ProcessEnv }} [options] */
export async function listTitles({ env = process.env } = {}) {
  const [vitest, e2e] = await Promise.all([
    runPackage('vitest', 'vitest', ['list', '--json'], { env }),
    runPackage('@playwright/test', 'playwright', ['test', '--list', '--reporter=json'], { env }),
  ]);
  /** @type {import('./resultados.mjs').ListedTest[]} */
  const titles = [];
  /** @type {{ name: string, result: import('./proceso.mjs').RunResult }[]} */
  const errors = [];
  try {
    titles.push(...titlesFromVitestList(firstJson(vitest.stdout)));
  } catch {
    errors.push({ name: 'listado-vitest', result: vitest });
  }
  try {
    titles.push(...titlesFromPlaywrightList(firstJson(e2e.stdout)));
  } catch {
    errors.push({ name: 'listado-punta-a-punta', result: e2e });
  }
  return { titles, errors, raw: { vitest, e2e } };
}
