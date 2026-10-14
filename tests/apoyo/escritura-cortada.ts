import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';

// Programa hijo de la prueba del corte (CA-017): abre la carpeta de datos como Retenia, hace una
// sola escritura real y se mata a sí mismo, sin cerrar nada, en el punto pedido. Cuenta
// sentencias de la base (`unit: 'sentencia'`) o pasos con archivos de una copia o una
// restauración (`unit: 'paso'`), desde el primero de la escritura. Con `cortar` = 0 no se corta
// y dice cuántos hubo; con -1 se corta apenas termina la escritura.
// Uso: node escritura-cortada.js <carpeta de datos> <escritura> <cortar> <datos en JSON>

const [dataDir = '', operation = '', cutText = '0', dataText = '{}'] = process.argv.slice(2);
const cutAt = Number(cutText);
const data = JSON.parse(dataText) as Record<string, string>;
const unit = data.unit === 'paso' ? 'paso' : 'sentencia';

function die(): never {
  process.kill(process.pid, 'SIGKILL');
  throw new Error('El proceso tendría que haber muerto');
}

let armed = false;
let count = 0;
function tick(kind: 'sentencia' | 'paso') {
  if (!armed || kind !== unit) {
    return;
  }
  count += 1;
  if (count === cutAt) {
    die();
  }
}

const field = (name: string) => data[name] ?? '';
const workspace = openWorkspace({
  dataDir,
  clock: demoClock(Number(field('days') || '0')),
  appVersion: '0.0.0-prueba',
  onStatement: () => tick('sentencia'),
  onStep: () => tick('paso'),
});

const operations: Record<string, () => unknown> = {
  review: () =>
    workspace.cards.review({
      cardId: field('cardId'),
      grade: 'good',
      attemptId: field('attemptId'),
    }),
  create: () => workspace.cards.create({ question: field('question'), answer: field('answer') }),
  edit: () =>
    workspace.cards.edit({
      cardId: field('cardId'),
      question: field('question'),
      answer: field('answer'),
    }),
  remove: () => workspace.cards.remove({ cardId: field('cardId') }),
  restoreFromTrash: () => workspace.trash.restore({ entryId: field('entryId') }),
  emptyTrash: () => workspace.trash.empty(),
  undo: () => workspace.activity.undo({ operationId: field('operationId') }),
  backup: () => workspace.createBackup('manual'),
  restore: () => workspace.restoreBackup(field('backupId')),
};

const run = operations[operation];
if (!run) {
  throw new Error(`No conozco la escritura «${operation}»`);
}
armed = true;
await run();
armed = false;
if (cutAt === -1) {
  die();
}
workspace.close();
process.stdout.write(JSON.stringify({ statements: count, done: true }));
