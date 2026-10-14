import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { CardNotFoundError, createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';

const folders: ReturnType<typeof tempDataFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function fresh() {
  const folder = tempDataFolder();
  folders.push(folder);
  return { file: folder.file, db: openDatabase(folder.file) };
}

describe('historial de una tarjeta', () => {
  it('[CA-015] dos repasos, el 15/03/2027 y el 22/03/2027, dejan dos renglones con fecha y resultado, y el primero no cambia', () => {
    const { file, db } = fresh();
    const monday = createCardsStore(db, demoClock());
    const card = monday.create({
      question: '¿Qué mide el desvío estándar?',
      answer: 'Cuánto se alejan, en promedio, los datos de la media.',
    });
    monday.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
    const firstRow = readRows(file, 'SELECT * FROM observations');
    const firstHistory = monday.history({ cardId: card.id });

    // Una semana después («+7 días»).
    const nextMonday = createCardsStore(db, demoClock(7));
    nextMonday.review({ cardId: card.id, grade: 'hard', attemptId: randomUUID() });
    const history = nextMonday.history({ cardId: card.id });
    db.close();

    expect(history.question).toBe('¿Qué mide el desvío estándar?');
    expect(history.entries.map(({ day, result }) => ({ day, result }))).toEqual([
      { day: '2027-03-15', result: 'good' },
      { day: '2027-03-22', result: 'hard' },
    ]);
    expect(history.entries[0]).toEqual(firstHistory.entries[0]);
    // La observación del primer repaso quedó idéntica, campo por campo.
    const [first] = firstRow;
    expect(readRows(file, 'SELECT * FROM observations WHERE id = ?', first?.id)).toEqual(firstRow);
  });

  it('una tarjeta sin repasos tiene el historial vacío', () => {
    const { db } = fresh();
    const store = createCardsStore(db, demoClock());
    const card = store.create({ question: 'P', answer: 'R' });
    expect(store.history({ cardId: card.id })).toEqual({ question: 'P', entries: [] });
    db.close();
  });

  it('el historial muestra la pregunta vigente después de editarla', () => {
    const { db } = fresh();
    const store = createCardsStore(db, demoClock());
    const card = store.create({ question: 'Antes', answer: 'R' });
    store.review({ cardId: card.id, grade: 'again', attemptId: randomUUID() });
    store.edit({ cardId: card.id, question: 'Después', answer: 'R' });
    const history = store.history({ cardId: card.id });
    db.close();
    expect(history.question).toBe('Después');
    expect(history.entries.map((entry) => entry.result)).toEqual(['again']);
  });

  it('pedir el historial de una tarjeta que no existe falla con un error propio', () => {
    const { db } = fresh();
    const store = createCardsStore(db, demoClock());
    expect(() => store.history({ cardId: '01969f1e-0000-7000-8000-000000000000' })).toThrow(
      CardNotFoundError,
    );
    db.close();
  });
});
