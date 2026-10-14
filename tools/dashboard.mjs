// «npm run tablero»: arma una página local en castellano con el estado del proyecto y la abre
// en el navegador. Por historia: sus criterios y el estado de sus pruebas; las tablas de casos
// con lo esperado y lo obtenido; y los lugares de cobertura, mutación, seguridad, accesibilidad
// y rendimiento. Nunca muestra nombres de archivos.
//   --salida <carpeta>   dónde dejarla (por defecto .cache/tablero)
//   --sin-abrir          no abre el navegador (la usan las pruebas)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readProjectSpec } from './lib/especificacion.mjs';
import { closedPhaseTags, currentPhase } from './lib/fases.mjs';
import { expandTemplates, latestResults, STATUS_LABELS } from './lib/historial.mjs';
import { listTitles } from './lib/listado.mjs';
import { ROOT } from './lib/proceso.mjs';
import { formatDateTime, formatDuration, now } from './lib/reloj.mjs';
import { crossCheck } from './lib/trazabilidad.mjs';

/** @typedef {import('./lib/trazabilidad.mjs').TracedCriterion} TracedCriterion */

const outputDir = process.argv.includes('--salida')
  ? resolve(process.argv[process.argv.indexOf('--salida') + 1] ?? '.')
  : join(ROOT, '.cache', 'tablero');
const open = !process.argv.includes('--sin-abrir');

/** @param {unknown} text */
function h(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** @param {string | null} text */
function withCode(text) {
  return h(text ?? '').replace(/`([^`]+)`/g, '<code>$1</code>');
}

const spec = readProjectSpec(ROOT);
const [phase, tags, { titles }] = await Promise.all([
  currentPhase(ROOT),
  closedPhaseTags(ROOT),
  listTitles(),
]);
const closed = tags.map((t) => t.number);
const trace = crossCheck({ spec, titles, closed, current: phase, requireCurrent: false });
const { runs, tests, coverage } = latestResults(ROOT);
/** @type {Map<string, TracedCriterion>} */
const criteriaById = new Map(
  trace.criteria.map((c) => [c.id, { ...c, tests: expandTemplates(c.tests, tests) }]),
);

/** @param {TracedCriterion} criterion */
function criterionState(criterion) {
  if (criterion.tests.length === 0) {
    return { css: 'sin', label: 'Sin prueba' };
  }
  const states = criterion.tests.map((t) => tests.get(t.title)?.status ?? 'not-run');
  if (states.includes('failed')) {
    return { css: 'falla', label: 'Con fallas' };
  }
  if (states.includes('skipped')) {
    return { css: 'falla', label: 'Con salteadas' };
  }
  if (states.includes('not-run')) {
    return { css: 'pendiente', label: 'Faltan corridas' };
  }
  return { css: 'bien', label: 'Comprobado' };
}

/** @param {TracedCriterion} criterion */
function criterionSection(criterion) {
  const state = criterionState(criterion);
  const rows = criterion.tests
    .map(({ title, layer }) => {
      const last = tests.get(title);
      const status = last?.status ?? 'not-run';
      const when = last ? formatDateTime(new Date(last.date)) : '—';
      return `<tr><td>${h(title)}</td><td>${h(layer)}</td><td><span class="chip ${status}">${h(STATUS_LABELS[status])}</span></td><td>${h(when)}</td></tr>`;
    })
    .join('');
  const table =
    criterion.tests.length === 0
      ? '<p class="nota">Todavía no tiene ninguna prueba.</p>'
      : `<table><thead><tr><th>Prueba</th><th>Capa</th><th>Resultado</th><th>Última vez</th></tr></thead><tbody>${rows}</tbody></table>`;
  const ending = /[.!?]$/.test(criterion.outcome ?? '') ? '' : '.';
  return `<article class="criterio" aria-labelledby="t-${criterion.id}">
  <h4 id="t-${criterion.id}">${criterion.id} <span class="chip ${state.css}">${state.label}</span></h4>
  <p class="dado">Dado ${withCode(criterion.given)}, cuando ${withCode(criterion.when)}, entonces ${withCode(criterion.outcome)}${ending}</p>
  ${table}
</article>`;
}

/** @param {import('./lib/especificacion.mjs').Phase} p */
function phaseSection(p) {
  const isClosed = closed.includes(p.number);
  const isCurrent = p.number === phase;
  const criteria = p.criteria.map((id) => criteriaById.get(id)).filter((c) => c !== undefined);
  const verified = criteria.filter((c) => criterionState(c).css === 'bien').length;
  const label = isClosed ? 'cerrada' : isCurrent ? 'en curso' : 'todavía no empezó';
  const summary = `Fase ${p.number} · ${h(p.name)} · ${label} · ${verified} de ${criteria.length} criterios comprobados`;
  if (!isClosed && !isCurrent) {
    return `<details class="fase"><summary>${summary}</summary><p class="nota">Historias ${h(p.stories.join(', '))}: ${criteria.map((c) => c.id).join(', ')}.</p></details>`;
  }
  const stories = spec.stories
    .filter((s) => p.stories.includes(s.id))
    .map(
      (s) => `<section class="historia" aria-labelledby="h-${s.id}">
  <h3 id="h-${s.id}">${s.id} · ${h(s.priority)}</h3>
  <p>${h(s.description)}</p>
  ${criteria
    .filter((c) => c.story === s.id)
    .map(criterionSection)
    .join('\n')}
</section>`,
    )
    .join('\n');
  return `<section class="fase abierta" aria-label="Fase ${p.number}"><h2>${summary}</h2>${stories}</section>`;
}

function runsSection() {
  /** @type {Record<string, string>} */
  const LIMITS = { verificar: '2 min', 'verificar:todo': '15 min' };
  if (runs.length === 0) {
    return '<p class="nota">Todavía no corrió la red. Corré «npm run verificar».</p>';
  }
  const rows = runs
    .map((r) => {
      const line = r.verdict[0] ?? '';
      const shown = line.startsWith('ROJO')
        ? `${line.split(' · ').slice(0, 2).join(' · ')} (el detalle está en la terminal)`
        : line;
      return `<tr><td>npm run ${h(r.mode)}</td><td>${h(formatDateTime(new Date(r.date)))}</td><td>${h(shown)}</td><td>${h(formatDuration(r.durationMs))} (tope ${LIMITS[r.mode]})</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Orden</th><th>Última corrida</th><th>Resultado</th><th>Tiempo</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** @param {string} id */
function latestLayer(id) {
  for (const r of [...runs].reverse()) {
    const found = r.layers.find((/** @type {any} */ l) => l.id === id);
    if (found) {
      return { ...found, date: r.date };
    }
  }
  return null;
}

/** @param {string} id @param {string} name @param {string} noData */
function layerLine(id, name, noData) {
  const found = latestLayer(id);
  if (!found) {
    return `<li>${h(name)}: ${h(noData)}</li>`;
  }
  const state =
    found.failures === 0
      ? 'sin faltas'
      : `${found.failures} ${found.failures === 1 ? 'falta' : 'faltas'}`;
  return `<li>${h(name)}: ${state} (${h(formatDateTime(new Date(found.date)))})</li>`;
}

function casesSection() {
  /** @type {Map<string, import('./lib/historial.mjs').KnownResult[]>} */
  const tables = new Map();
  for (const test of tests.values()) {
    if (test.tableCase) {
      tables.set(test.tableCase.table, [...(tables.get(test.tableCase.table) ?? []), test]);
    }
  }
  if (tables.size === 0) {
    return '<p class="nota">Todavía no hay tablas de casos con resultados.</p>';
  }
  return [...tables]
    .map(
      ([table, rows]) => `<h3>${h(table)}</h3>
<table><thead><tr><th>Entrada</th><th>Esperado</th><th>Obtenido</th><th>Resultado</th></tr></thead><tbody>
${rows
  .map(
    (t) =>
      `<tr><td>${h(t.tableCase?.input)}</td><td>${h(t.tableCase?.expected)}</td><td>${h(t.tableCase?.actual)}</td><td><span class="chip ${t.status}">${h(STATUS_LABELS[t.status])}</span></td></tr>`,
  )
  .join('\n')}
</tbody></table>`,
    )
    .join('\n');
}

const a11yTests = [...tests.values()].filter((t) => t.title.startsWith('accesibilidad:'));
/** @param {number} n */
const decimal = (n) => String(n).replace('.', ',');

const html = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tablero de Retenia</title>
<style>
:root { color-scheme: light dark; --fondo:#f7f6f2; --tinta:#1d1d1b; --suave:#5d5a52; --borde:#d9d4c4; --tarjeta:#ffffff;
  --bien:#1f6b45; --bien-fondo:#dcefe3; --falla:#7a4a00; --falla-fondo:#f6e3bf; --pend:#2f4f7a; --pend-fondo:#dfe7f3; --sin:#4a4a4a; --sin-fondo:#e6e4de; }
@media (prefers-color-scheme: dark) { :root { --fondo:#16171a; --tinta:#ecebe6; --suave:#b5b1a6; --borde:#3a3a3d; --tarjeta:#1f2024;
  --bien:#9fdcb9; --bien-fondo:#1f3a2c; --falla:#f3cf8f; --falla-fondo:#4a3712; --pend:#b9cdf0; --pend-fondo:#24334b; --sin:#d0cec8; --sin-fondo:#33332f; } }
body { margin:0; background:var(--fondo); color:var(--tinta); font-family:"Segoe UI",system-ui,sans-serif; line-height:1.45; }
main { max-width:1100px; margin:0 auto; padding:1.5rem 1rem 4rem; }
h1 { margin:0 0 .25rem; } h2 { margin-top:2rem; font-size:1.2rem; } h3 { margin-bottom:.25rem; }
.nota { color:var(--suave); }
table { width:100%; border-collapse:collapse; margin:.5rem 0 1rem; background:var(--tarjeta); }
th, td { text-align:left; padding:.35rem .5rem; border-bottom:1px solid var(--borde); vertical-align:top; }
.criterio { border:1px solid var(--borde); border-radius:8px; padding:.25rem 1rem; margin:.75rem 0; background:var(--tarjeta); }
.chip { display:inline-block; padding:.05rem .5rem; border-radius:999px; font-size:.85rem; font-weight:600; }
.bien, .passed { color:var(--bien); background:var(--bien-fondo); }
.falla, .failed, .skipped { color:var(--falla); background:var(--falla-fondo); }
.pendiente, .not-run { color:var(--pend); background:var(--pend-fondo); }
.sin { color:var(--sin); background:var(--sin-fondo); }
details.fase { margin:.5rem 0; } summary { cursor:pointer; }
code { font-family:Consolas,monospace; }
</style>
</head>
<body>
<main>
<h1>Tablero de Retenia</h1>
<p class="nota">Armado el ${h(formatDateTime(now()))}, hora de Buenos Aires. ${phase ? `Fase en curso: ${phase}.` : ''} Fases cerradas: ${closed.length === 0 ? 'ninguna todavía' : closed.join(', ')}.</p>

<section aria-labelledby="s-red"><h2 id="s-red">Estado de la red</h2>${runsSection()}</section>

<section aria-labelledby="s-historias"><h2 id="s-historias">Historias, criterios y pruebas</h2>
<p class="nota">${trace.covered} de ${trace.total} criterios de las fases cerradas y en curso tienen al menos una prueba.</p>
${spec.phases.map(phaseSection).join('\n')}
</section>

<section aria-labelledby="s-casos"><h2 id="s-casos">Tablas de casos: lo esperado y lo obtenido</h2>${casesSection()}</section>

<section aria-labelledby="s-cobertura"><h2 id="s-cobertura">Cobertura de reglas</h2>
${coverage ? `<p>Las pruebas recorren el ${decimal(coverage.branches)} % de las ramas y el ${decimal(coverage.lines)} % de las líneas del núcleo (las reglas puras). Mínimo de ramas: ${coverage.threshold} %.</p>` : '<p class="nota">Todavía sin medir: corré «npm run verificar».</p>'}
</section>

<section aria-labelledby="s-mutacion"><h2 id="s-mutacion">Mutación</h2>
<p class="nota">Todavía sin medir. Acá va a aparecer, por módulo del núcleo, qué parte de las roturas a propósito detecta la red.</p>
</section>

<section aria-labelledby="s-seguridad"><h2 id="s-seguridad">Seguridad</h2><ul>
${layerLine('secretos', 'Escáner de secretos', 'todavía no corrió')}
${layerLine('auditoria', 'Auditoría de dependencias (vulnerabilidades altas o críticas)', 'corre con «npm run verificar:todo»')}
${layerLine('seguridad', 'Análisis estático de seguridad', 'corre con «npm run verificar:todo»')}
${layerLine('capas', 'Regla de capas', 'todavía no corrió')}
${layerLine('reloj', 'Regla del reloj del sistema', 'todavía no corrió')}
</ul></section>

<section aria-labelledby="s-accesibilidad"><h2 id="s-accesibilidad">Accesibilidad</h2><ul>
${layerLine('accesibilidad', 'Revisión automática de la ventana', 'corre con «npm run verificar:todo»')}
<li>Pantallas revisadas: ${a11yTests.length}.</li>
</ul></section>

<section aria-labelledby="s-rendimiento"><h2 id="s-rendimiento">Rendimiento</h2>
<p class="nota">Todavía sin medir. Acá van a aparecer el arranque, la siguiente tarjeta, abrir Estudiar y buscar, con sus topes.</p>
</section>
</main>
</body>
</html>
`;

mkdirSync(outputDir, { recursive: true });
const page = join(outputDir, 'index.html');
writeFileSync(page, html);
console.log(`Tablero listo: ${page}`);
if (open) {
  spawn('explorer.exe', [page], { detached: true, stdio: 'ignore' }).unref();
  console.log('Se abre en tu navegador.');
}
