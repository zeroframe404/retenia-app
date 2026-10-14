// Este archivo no importa nada: si el resto de la red no pudiera cargarse, verify.mjs igual
// puede escribir la línea ROJO con lo que tiene acá.

/**
 * @typedef {{ layer: string, text: string, weight?: number }} Problem
 * @typedef {{ run: number, failed: number, skipped: number, covered: number, criteria: number }} Counts
 */

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** @param {{ tests: number, covered: number, total: number }} counts */
export function greenLine({ tests, covered, total }) {
  return `VERDE · ${plural(tests, 'prueba', 'pruebas')} · 0 fallas · 0 salteadas · ${covered} de ${plural(total, 'criterio cubierto', 'criterios cubiertos')}`;
}

/** @param {number} failures */
export function redLine(failures) {
  return `ROJO · ${plural(failures, 'falla', 'fallas')} · copiá desde acá hasta el final y pegáselo a Claude Code`;
}

// Arma el final de la corrida. Cada problema trae su capa, su texto y cuántas fallas suma
// (weight; por defecto 1). Sin problemas es VERDE; con uno solo ya es ROJO.
/** @param {{ problems: Problem[], counts: Counts, logs: string }} options */
export function buildVerdict({ problems, counts, logs }) {
  const failures = problems.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  if (failures === 0) {
    return {
      green: true,
      failures,
      lines: [greenLine({ tests: counts.run, covered: counts.covered, total: counts.criteria })],
    };
  }
  return {
    green: false,
    failures,
    lines: [
      redLine(failures),
      'Resumen de fallas:',
      ...problems.map((p, i) => `${i + 1}. ${p.layer}: ${p.text}`),
      `Cuentas: ${plural(counts.run, 'prueba corrida', 'pruebas corridas')} · ${plural(counts.failed, 'falló', 'fallaron')} · ${plural(counts.skipped, 'salteada', 'salteadas')} · ${counts.covered} de ${plural(counts.criteria, 'criterio cubierto', 'criterios cubiertos')}.`,
      `Registros completos de cada herramienta: ${logs}`,
    ],
  };
}

// La línea ROJO de una red que ni siquiera pudo arrancar.
/** @param {unknown} error */
export function startupFailure(error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return [
    redLine(1),
    'Resumen de fallas:',
    `1. La red misma: no pudo arrancar o se cortó con un error inesperado. ${detail}`,
  ];
}

// Pruebas marcadas para no correr o para correr solas, encontradas leyendo el código.
const MARKERS =
  /\b(?:it|test|describe|suite|bench)\s*\.\s*(skip|only|todo|fixme|skipIf|runIf)\b|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(/g;

/** @param {string} text @returns {{ line: number, marker: string, kind: 'skip' | 'only' }[]} */
export function findMarkers(text) {
  /** @type {{ line: number, marker: string, kind: 'skip' | 'only' }[]} */
  const markers = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const m of (lines[i] ?? '').matchAll(MARKERS)) {
      const marker = m[1] ?? m[2] ?? '';
      markers.push({
        line: i + 1,
        marker,
        kind: marker === 'only' || marker === 'fit' || marker === 'fdescribe' ? 'only' : 'skip',
      });
    }
  }
  return markers;
}

// La cantidad de pruebas no puede bajar respecto del último tag fase-NN-ok.
/** @param {{ current: number, atTag: number, tag: string }} options */
export function compareWithTag({ current, atTag, tag }) {
  if (current >= atTag) {
    return null;
  }
  return `bajó la cantidad de pruebas: el tag ${tag} tenía ${atTag} y ahora hay ${current}. No se borran ni se saltean pruebas para que pase la red.`;
}

// El aviso de pruebas salteadas: las que el corredor salteó y las marcadas en archivos que no
// corrieron. Cada salteada suma una falla.
/**
 * @param {{ title: string }[]} skipped
 * @param {{ file: string, line: number, marker: string }[]} unrunMarkers
 * @returns {Problem | null}
 */
export function skippedProblem(skipped, unrunMarkers) {
  const total = skipped.length + unrunMarkers.length;
  if (total === 0) {
    return null;
  }
  const names = [
    ...skipped.map((t) => `«${t.title}»`),
    ...unrunMarkers.map((m) => `${m.file}:${m.line} (${m.marker})`),
  ];
  return {
    layer: 'Salteadas',
    weight: total,
    text: `hay ${total === 1 ? '1 salteada' : `${total} salteadas`}: ${names.join(', ')}. Una prueba salteada no comprueba nada: sacale la marca.`,
  };
}

const ASSERTION =
  /^(?:([\s\S]*): )?expected (.+?) (not )?to (?:be|equal|deeply equal|strictly equal|contain|match|have a length of|include) (.+?)(?: \/\/ .*)?$/;

// Traduce el mensaje de una aserción fallida. Si la prueba agregó su propio mensaje (lo que
// va antes de «: expected …»), lo conserva: suele traer la causa.
/** @param {string} message */
export function explainFailure(message) {
  const lines = message.split(/\r?\n/);
  const at = lines.findIndex((l) => /expected .+ to /.test(l));
  if (at === -1) {
    return (lines.find((l) => l.trim() !== '') ?? '').trim().slice(0, 300);
  }
  const block = lines
    .slice(0, at + 1)
    .join('\n')
    .replace(/^(?:AssertionError|Error): /, '');
  const m = ASSERTION.exec(block);
  if (!m) {
    return block.slice(0, 1500);
  }
  const [, own, actual, negated, expected] = m;
  const detail = negated
    ? `Esperaba que ${actual} no fuera ${expected}.`
    : `Esperaba ${expected} y dio ${actual}.`;
  return own ? `${detail}\n   ${own.split('\n').slice(0, 15).join('\n   ')}` : detail;
}
