import { demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';

// Programa hijo de la prueba del corte (CA-017): abre una base, hace una sola escritura real de
// Retenia y se mata a sí mismo, sin cerrar nada, justo antes de la sentencia número `cortar`
// (contando desde la primera de la escritura). Con `cortar` = 0 no se corta y cuenta cuántas
// sentencias hubo; con -1 se corta apenas termina la escritura, ya confirmada.
// Uso: node escritura-cortada.js <base> <escritura> <cortar> <datos en JSON>

const [file = '', operation = '', cutText = '0', dataText = '{}'] = process.argv.slice(2);
const cutAt = Number(cutText);
const data = JSON.parse(dataText) as Record<string, string>;

function die(): never {
  process.kill(process.pid, 'SIGKILL');
  throw new Error('El proceso tendría que haber muerto');
}

let armed = false;
let statements = 0;
const clock = demoClock(Number(data.days ?? '0'));
const db = openDatabase(file, {
  clock,
  onStatement: () => {
    if (!armed) {
      return;
    }
    statements += 1;
    if (statements === cutAt) {
      die();
    }
  },
});
const store = createCardsStore(db, clock);
const field = (name: string) => data[name] ?? '';

const operations: Record<string, () => unknown> = {
  review: () =>
    store.review({ cardId: field('cardId'), grade: 'good', attemptId: field('attemptId') }),
  create: () => store.create({ question: field('question'), answer: field('answer') }),
  edit: () =>
    store.edit({ cardId: field('cardId'), question: field('question'), answer: field('answer') }),
};

const run = operations[operation];
if (!run) {
  throw new Error(`No conozco la escritura «${operation}»`);
}
armed = true;
run();
armed = false;
if (cutAt === -1) {
  die();
}
db.close();
process.stdout.write(JSON.stringify({ statements, done: true }));
