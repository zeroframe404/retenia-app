import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { newCardMemory, reviewCard } from '../../src/core/memory';
import { studyDayOf } from '../../src/core/study-day';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { appendEvaluation } from '../../src/data/ledger';
import { recomputeCardSchedule, repairData, verifyData } from '../../src/data/projections';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { tempDataFolder } from '../apoyo/base';
import { eventsById, readRows, runRaw } from '../apoyo/base-cruda';
import { inBuenosAires } from '../apoyo/fechas';

// «Verificar datos» recalcula la agenda de cada tarjeta desde su historial y la compara con la
// guardada (CA-016); «Reparar desde el historial» reescribe solo la agenda, nunca un evento.

const folders: ReturnType<typeof tempDataFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function fresh() {
  const folder = tempDataFolder();
  folders.push(folder);
  return folder;
}

// Tres tarjetas, repasos en dos fechas y una edición.
function sampleData(file: string) {
  const db = openDatabase(file);
  const monday = createCardsStore(db, demoClock());
  const a = monday.create({ question: '¿Qué mide el desvío estándar?', answer: 'La dispersión' });
  const b = monday.create({ question: '¿Qué es la varianza?', answer: 'El cuadrado del desvío' });
  const c = monday.create({ question: '¿Qué es la media?', answer: 'El promedio' });
  monday.review({ cardId: a.id, grade: 'good', attemptId: randomUUID() });
  monday.review({ cardId: b.id, grade: 'again', attemptId: randomUUID() });
  const later = createCardsStore(db, demoClock(7));
  later.review({ cardId: a.id, grade: 'hard', attemptId: randomUUID() });
  later.edit({ cardId: c.id, question: '¿Qué es la media muestral?', answer: 'El promedio' });
  return { db, ids: { a: a.id, b: b.id, c: c.id } };
}

describe('verificar datos', () => {
  it('[CA-016] con repasos y ediciones, «Verificar datos» recalcula todo desde el historial y da 0 diferencias', () => {
    const { file } = fresh();
    const { db } = sampleData(file);
    expect(verifyData(db)).toEqual([]);
    db.close();
  });

  it('[CA-016] una agenda tocada a mano aparece como diferencia de fecha y «Reparar desde el historial» la deja en 0 sin tocar ningún evento', () => {
    const { file } = fresh();
    const { db, ids } = sampleData(file);
    db.close();
    const events = eventsById(file);
    runRaw(
      file,
      "UPDATE card_schedule SET due_at = '2027-04-30T13:00:00.000Z' WHERE card_id = ?",
      ids.b,
    );

    const reopened = openDatabase(file);
    expect(verifyData(reopened)).toEqual([
      {
        cardId: ids.b,
        question: '¿Qué es la varianza?',
        kind: 'due',
        storedDay: '2027-04-30',
        expectedDay: '2027-03-16',
      },
    ]);
    expect(repairData(reopened)).toEqual([]);
    expect(verifyData(reopened)).toEqual([]);
    reopened.close();
    expect(eventsById(file)).toEqual(events);
  });

  it('[CA-016] otro dato de memoria distinto, una agenda que falta y una que sobra también se ven y se reparan', () => {
    const { file } = fresh();
    const { db, ids } = sampleData(file);
    db.close();
    const raw = new Database(file);
    raw.pragma('foreign_keys = OFF');
    raw.prepare('UPDATE card_schedule SET reps = 9 WHERE card_id = ?').run(ids.a);
    raw.prepare('DELETE FROM card_schedule WHERE card_id = ?').run(ids.c);
    raw
      .prepare(
        "INSERT INTO card_schedule (card_id, state, stability, difficulty, due_at) VALUES ('01969f1e-0000-7000-8000-000000000000', 0, 0, 0, '2027-03-15T13:00:00.000Z')",
      )
      .run();
    raw.close();

    const reopened = openDatabase(file);
    const found = verifyData(reopened);
    expect(found.map(({ cardId, kind }) => ({ cardId, kind }))).toEqual(
      expect.arrayContaining([
        { cardId: ids.a, kind: 'memory' },
        { cardId: ids.c, kind: 'missing' },
        { cardId: '01969f1e-0000-7000-8000-000000000000', kind: 'extra' },
      ]),
    );
    expect(found).toHaveLength(3);
    expect(found.find((difference) => difference.kind === 'extra')?.question).toBeNull();
    expect(repairData(reopened)).toEqual([]);
    reopened.close();
  });

  it('[CA-016] enmendar la evaluación de un repaso agrega la versión 2, cambia la agenda recalculada y deja intacta la versión 1', () => {
    const { file } = fresh();
    const db = openDatabase(file);
    const store = createCardsStore(db, demoClock());
    const card = store.create({ question: 'P', answer: 'R' });
    expect(
      store.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() }).nextReviewDay,
    ).toBe('2027-03-17');
    const [v1] = readRows(file, 'SELECT * FROM evaluations');
    db.orm.transaction((tx) => {
      appendEvaluation(tx, demoClock(), {
        attemptId: String(v1?.attempt_id),
        verdict: 'incorrect',
        source: 'user',
      });
      recomputeCardSchedule(tx, card.id);
    });
    expect(store.list()[0]?.nextReviewDay).toBe('2027-03-16');
    expect(verifyData(db)).toEqual([]);
    db.close();
    const versions = readRows(file, 'SELECT * FROM evaluations ORDER BY version');
    expect(versions[0]).toEqual(v1);
    expect(versions[1]).toMatchObject({ version: 2, supersedes_id: v1?.id, verdict: 'incorrect' });
    expect(readRows(file, 'SELECT count(*) AS n FROM observations')).toEqual([{ n: 1 }]);
  });
});

describe('bases de la Fase 03', () => {
  // Una base como la que dejaba la Fase 03: la agenda se pisaba en cada repaso, sin historial.
  function phase03Database(file: string) {
    const raw = new Database(file);
    raw.pragma('journal_mode = WAL');
    raw.exec(readFileSync(join(ROOT, 'src', 'data', 'migrations', '0000_tarjetas.sql'), 'utf8'));
    raw.exec(
      'CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)',
    );
    raw
      .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
      .run('0000_tarjetas', '2027-03-10T13:00:00.000Z');
    const created = inBuenosAires('10/03/2027 10:00');
    const memory = reviewCard(newCardMemory(created), 'good', inBuenosAires('12/03/2027 10:00'));
    raw
      .prepare('INSERT INTO cards (id, current_version_id, created_at) VALUES (?, ?, ?)')
      .run(
        '01969f1e-0000-7000-8000-00000000000a',
        '01969f1e-0000-7000-8000-00000000000b',
        created.toISOString(),
      );
    raw
      .prepare(
        'INSERT INTO card_versions (id, card_id, question, answer, created_at, cause) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        '01969f1e-0000-7000-8000-00000000000b',
        '01969f1e-0000-7000-8000-00000000000a',
        '¿Capital de Francia?',
        'París',
        created.toISOString(),
        'edit',
      );
    raw
      .prepare(
        'INSERT INTO card_schedule (card_id, state, stability, difficulty, due_at, last_review_at, reps, lapses, scheduled_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        '01969f1e-0000-7000-8000-00000000000a',
        memory.state,
        memory.stability,
        memory.difficulty,
        memory.dueAt.toISOString(),
        memory.lastReviewAt?.toISOString() ?? null,
        memory.reps,
        memory.lapses,
        memory.scheduledDays,
      );
    raw.close();
    return memory;
  }

  it('[CA-016] al abrir, una tarjeta repasada sin historial conserva su agenda y «Verificar datos» da 0', () => {
    const { file } = fresh();
    const memory = phase03Database(file);
    const before = readRows(file, 'SELECT * FROM card_schedule');

    const db = openDatabase(file);
    expect(verifyData(db)).toEqual([]);
    const store = createCardsStore(db, demoClock());
    expect(store.list()[0]?.nextReviewDay).toBe('2027-03-14');
    expect(store.history({ cardId: '01969f1e-0000-7000-8000-00000000000a' }).entries).toEqual([
      expect.objectContaining({ day: '2027-03-12', result: 'adopted' }),
    ]);
    // Repasarla ahora sigue desde la agenda que traía.
    const reviewed = store.review({
      cardId: '01969f1e-0000-7000-8000-00000000000a',
      grade: 'good',
      attemptId: randomUUID(),
    });
    expect(reviewed.nextReviewDay).toBe(
      studyDayOf(reviewCard(memory, 'good', demoClock().now()).dueAt),
    );
    expect(verifyData(db)).toEqual([]);
    db.close();
    expect(
      readRows(file, "SELECT kind, source FROM observations WHERE kind = 'schedule.adopted'"),
    ).toEqual([{ kind: 'schedule.adopted', source: 'system' }]);
    expect(before).toHaveLength(1);
  });

  it('abrir dos veces una base de la Fase 03 adopta su agenda una sola vez', () => {
    const { file } = fresh();
    phase03Database(file);
    openDatabase(file).close();
    openDatabase(file).close();
    expect(
      readRows(file, "SELECT count(*) AS n FROM observations WHERE kind = 'schedule.adopted'"),
    ).toEqual([{ n: 1 }]);
  });
});
