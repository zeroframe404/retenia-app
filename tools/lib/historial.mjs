import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {import('./resultados.mjs').TestResult & { date: string, mode: string }} KnownResult
 */

// Lo último que se sabe de cada prueba, juntando la última corrida rápida y la última completa.
// Si una prueba corrió en las dos, vale la más reciente.
/** @param {string} root */
export function latestResults(root) {
  /** @type {any[]} */
  const runs = [];
  for (const name of ['rapida.json', 'todo.json']) {
    const path = join(root, '.cache', 'red', 'ultimo', name);
    if (!existsSync(path)) {
      continue;
    }
    try {
      const run = JSON.parse(readFileSync(path, 'utf8'));
      // Un resultado guardado con otro formato (de una versión anterior de la red) se ignora.
      if (typeof run.date === 'string' && Array.isArray(run.tests) && Array.isArray(run.layers)) {
        runs.push(run);
      }
    } catch {
      // Un archivo a medio escribir o dañado también se ignora.
    }
  }
  runs.sort((a, b) => a.date.localeCompare(b.date));
  /** @type {Map<string, KnownResult>} */
  const tests = new Map();
  let coverage = null;
  for (const run of runs) {
    for (const test of run.tests) {
      tests.set(test.title, { ...test, date: run.date, mode: run.mode });
    }
    coverage = run.coverage ?? coverage;
  }
  return { runs, tests, coverage };
}

/** @type {Record<string, string>} */
export const STATUS_LABELS = {
  passed: 'Pasó',
  failed: 'Falló',
  skipped: 'Salteada',
  'not-run': 'Todavía no corrió',
};

const PLACEHOLDER = /\$[A-Za-z_][\w.]*|%[sdifjoc#%]/;

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Las pruebas con tabla de casos se listan con su plantilla («… $input … $expected»):
// se reemplazan por los casos que corrieron de verdad. Si no corrió ninguno, queda la plantilla.
/**
 * @param {{ title: string, layer: string }[]} listed
 * @param {Map<string, { title: string }>} tests
 * @returns {{ title: string, layer: string }[]}
 */
export function expandTemplates(listed, tests) {
  return listed.flatMap((item) => {
    if (!PLACEHOLDER.test(item.title)) {
      return [item];
    }
    const parts = item.title.split(new RegExp(PLACEHOLDER.source, 'g')).map(escapeRegExp);
    const pattern = new RegExp(`^${parts.join('.+?')}$`);
    const cases = [...tests.values()]
      .filter((t) => pattern.test(t.title))
      .map((t) => ({ title: t.title, layer: item.layer }));
    return cases.length > 0 ? cases : [item];
  });
}
