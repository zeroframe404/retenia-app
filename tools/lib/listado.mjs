import { firstJson, runPackage } from './proceso.mjs';
import { titlesFromPlaywrightList, titlesFromVitestList } from './resultados.mjs';

// Todas las pruebas de la red, sin correrlas: las de Vitest y las de punta a punta.
/** @param {{ env?: NodeJS.ProcessEnv }} [options] */
export async function listTitles({ env = process.env } = {}) {
  const [vitest, e2e, installed] = await Promise.all([
    runPackage('vitest', 'vitest', ['list', '--json'], { env }),
    runPackage('@playwright/test', 'playwright', ['test', '--list', '--reporter=json'], { env }),
    // El humo del instalador solo corre en el CI, pero sus pruebas cuentan para la trazabilidad.
    runPackage(
      '@playwright/test',
      'playwright',
      ['test', '--list', '--reporter=json', '--config', 'playwright.instalado.config.ts'],
      { env },
    ),
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
  try {
    titles.push(...titlesFromPlaywrightList(firstJson(installed.stdout)));
  } catch {
    errors.push({ name: 'listado-instalado', result: installed });
  }
  return { titles, errors, raw: { vitest, e2e, installed } };
}
