// «npm run trazabilidad [-- --fase NN]»: por cada criterio de la fase (la en curso si no se
// dice), sus pruebas y el último resultado de cada una. Al final, los problemas de
// trazabilidad (criterio de fase cerrada sin prueba, identificador inexistente o mal puesto):
// si hay alguno, termina con error.
import { readProjectSpec } from './lib/especificacion.mjs';
import { closedPhaseTags, currentPhase } from './lib/fases.mjs';
import { expandTemplates, latestResults, STATUS_LABELS } from './lib/historial.mjs';
import { listTitles } from './lib/listado.mjs';
import { ROOT } from './lib/proceso.mjs';
import { formatDateTime } from './lib/reloj.mjs';
import { crossCheck } from './lib/trazabilidad.mjs';

const asked = process.argv[process.argv.indexOf('--fase') + 1];
const current = await currentPhase(ROOT);
const number = process.argv.includes('--fase') ? asked?.padStart(2, '0') : current;
const spec = readProjectSpec(ROOT);
const phase = spec.phases.find((p) => p.number === number);
if (!phase) {
  console.log('Decime qué fase: npm run trazabilidad -- --fase 02');
  process.exit(1);
}

const [{ titles, errors }, tags] = await Promise.all([listTitles(), closedPhaseTags(ROOT)]);
const trace = crossCheck({
  spec,
  titles,
  closed: tags.map((t) => t.number),
  current,
  requireCurrent: false,
});
const { tests } = latestResults(ROOT);

console.log(`Trazabilidad · Fase ${phase.number} · ${phase.name} (${phase.stories.join(', ')})`);
let covered = 0;
for (const criterion of trace.criteria.filter((c) => c.phase === phase.number)) {
  console.log('');
  console.log(`${criterion.id} · ${criterion.outcome}`);
  if (criterion.tests.length === 0) {
    console.log('   Sin prueba todavía.');
    continue;
  }
  covered++;
  for (const { title, layer } of expandTemplates(criterion.tests, tests)) {
    const last = tests.get(title);
    const state = last
      ? `${STATUS_LABELS[last.status]} (${formatDateTime(new Date(last.date))})`
      : STATUS_LABELS['not-run'];
    console.log(`   ${(state ?? '').padEnd(28)} ${layer} · ${title}`);
  }
}
console.log('');
console.log(`${covered} de ${phase.criteria.length} criterios de la fase con al menos una prueba.`);

const problems = [
  ...errors.map((e) => `no pude listar las pruebas (${e.name}).`),
  ...trace.problems,
];
if (problems.length > 0) {
  console.log('');
  console.log('Problemas de trazabilidad:');
  for (const [i, p] of problems.entries()) {
    console.log(`${i + 1}. ${p}`);
  }
  process.exitCode = 1;
}
