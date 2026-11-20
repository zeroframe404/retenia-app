import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import { createTransfersService } from '../../src/main/imports/service';
import { createMaterialsService } from '../../src/main/materials/service';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import { runTransferTask } from '../../src/main/workers/transfers-tasks';

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
  // La carga en minutos (Fase 11): empezar con 5 minutos (lo que no entra queda para mañana),
  // «Posponer» para mañana y «Sumar a mis repasos».
  studyStartShort: () => workspace.study.start({ sessionId: field('sessionId'), minutes: 5 }),
  studyPostpone: () =>
    workspace.study.postpone({ requestId: field('requestId'), minutes: 5, when: 'tomorrow' }),
  cardsActivate: () =>
    workspace.cards.activate({ batchId: field('batchId'), cardIds: [field('cardId')] }),
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
  // Los materiales (Fase 13): agregar un archivo (sin procesarlo) y terminar la indexación de uno
  // que ya pasó por todas las etapas anteriores.
  materialAdd: async () => {
    const service = materials({ autoStart: false });
    await service.addFiles({ paths: [field('file')], subjectId: field('subjectId') });
  },
  materialIndex: async () => {
    const service = materials({ autoStart: true });
    await service.whenIdle();
  },
  // La importación (Fase 15): la vista previa (no escribe nada) y «Importar».
  importAnki: () => importFile('anki'),
  importRemnote: () => importFile('remnote'),
};

async function importFile(kind: 'anki' | 'remnote') {
  const transfers = createTransfersService({
    workspace,
    clock: demoClock(Number(field('days') || '0')),
    execute: (task) => runTransferTask(task),
  });
  const outcome = await transfers.preview({ kind, path: field('file') });
  if (outcome.outcome !== 'preview') {
    throw new Error(`No hubo vista previa: ${outcome.problem}`);
  }
  await transfers.run({
    previewId: outcome.preview.previewId,
    destination: { kind: 'subject', subjectId: field('subjectId') },
  });
}

function materials({ autoStart }: { autoStart: boolean }) {
  return createMaterialsService({
    workspace,
    clock: demoClock(Number(field('days') || '0')),
    execute: (task) => runMaterialsTask(task),
    autoStart,
    runnerId: 'corte',
  });
}

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
