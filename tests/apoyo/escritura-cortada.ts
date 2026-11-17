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
  // La sesión de estudio (Fase 10). La actividad actual se lee antes de armar el corte.
  studyStart: () => workspace.study.start({ sessionId: field('sessionId') }),
  studyGrade: () =>
    workspace.study.grade({
      sessionId: field('sessionId'),
      activityId: field('activityId'),
      attemptId: field('attemptId'),
      grade: field('grade') === 'again' ? 'again' : 'good',
      answer: field('answer') || null,
      activeMs: 1000,
    }),
  studyUndo: () =>
    workspace.study.undo({ sessionId: field('sessionId'), activityId: field('undoActivity') }),
  studyFlag: () =>
    workspace.study.flag({
      sessionId: field('sessionId'),
      activityId: field('activityId'),
      attemptId: field('attemptId'),
    }),
  studySkip: () =>
    workspace.study.skip({ sessionId: field('sessionId'), activityId: field('activityId') }),
  studyPause: () => workspace.study.pause({ sessionId: field('sessionId'), activeMs: 1000 }),
  studyDraft: () =>
    workspace.study.saveDraft({
      sessionId: field('sessionId'),
      activityId: field('activityId'),
      text: field('text'),
      answerShown: true,
    }),
  studyRate: () =>
    workspace.study.rate({
      sessionId: field('sessionId'),
      rating: 'fair',
      ratingId: field('ratingId'),
    }),
  doubt: () =>
    workspace.doubts.create({
      doubtId: field('doubtId'),
      text: field('text'),
      cardId: field('cardId'),
      sessionId: field('sessionId'),
    }),
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
