import { eq, inArray } from 'drizzle-orm';
import {
  compareSchedules,
  type Difference,
  type ScheduleRow,
  scheduleRowOf,
} from '../core/data-check';
import { currentEvaluation } from '../core/ledger';
import {
  type CardMemory,
  DEFAULT_RETENTION,
  gradeOfVerdict,
  MEMORY_ENGINE_VERSION,
  type MemoryEvent,
  projectCardMemory,
  type Verdict,
} from '../core/memory';
import { studyDayOf } from '../core/study-day';
import type { ReteniaDatabase } from './database';
import { readPayload } from './ledger';
import type { Writer } from './orm';
import { cardSchedule, cards, cardVersions, evaluations, observations } from './schema';

// La agenda de cada tarjeta es una proyección (docs/modelo-de-datos.md, sección 1.3): se
// recalcula entera desde sus eventos con la misma función pura de core, al guardar un repaso y
// al verificar los datos. Así lo guardado y lo recalculado no pueden diferir salvo por un error.

// La configuración de esta fase: la retención fija de 0,90 (las materias con su propia
// retención llegan en la Fase 09).
const MEMORY_CONFIG = { retention: DEFAULT_RETENTION };

const MEMORY_KINDS = ['review.graded', 'schedule.adopted'];

type ObservationRow = typeof observations.$inferSelect;

export interface HistoryEvent {
  readonly id: string;
  readonly seq: number;
  readonly occurredAt: Date;
  // La calificación que vale (la de la evaluación vigente) o «adopted» para la agenda heredada.
  readonly result: 'again' | 'hard' | 'good' | 'adopted';
}

// Los eventos que mueven la agenda, con la calificación de la evaluación vigente de cada repaso.
function memoryEventsOf(
  rows: readonly ObservationRow[],
  verdicts: ReadonlyMap<string, Verdict>,
): { cardId: string; event: MemoryEvent; history: HistoryEvent }[] {
  return rows.map((row) => {
    if (row.kind === 'schedule.adopted') {
      const { cardId, memory } = readPayload('schedule.adopted', row.schemaVersion, row.payload);
      const adopted: CardMemory = {
        ...memory,
        dueAt: new Date(memory.dueAt),
        lastReviewAt: memory.lastReviewAt === null ? null : new Date(memory.lastReviewAt),
      };
      return {
        cardId,
        event: { kind: 'adopted', id: row.id, seq: row.seq, memory: adopted },
        history: {
          id: row.id,
          seq: row.seq,
          occurredAt: new Date(row.occurredAt),
          result: 'adopted',
        },
      };
    }
    const { cardId, grade } = readPayload('review.graded', row.schemaVersion, row.payload);
    const verdict = verdicts.get(row.id);
    const current = verdict === undefined ? grade : gradeOfVerdict(verdict);
    const occurredAt = new Date(row.occurredAt);
    return {
      cardId,
      event: { kind: 'review', id: row.id, seq: row.seq, occurredAt, grade: current },
      history: { id: row.id, seq: row.seq, occurredAt, result: current },
    };
  });
}

// La evaluación vigente de cada intento.
function currentVerdicts(
  rows: readonly { attemptId: string; id: string; version: number; verdict: string }[],
): Map<string, Verdict> {
  const byAttempt = new Map<string, typeof rows>();
  for (const row of rows) {
    byAttempt.set(row.attemptId, [...(byAttempt.get(row.attemptId) ?? []), row]);
  }
  const verdicts = new Map<string, Verdict>();
  for (const [attemptId, versions] of byAttempt) {
    const current = currentEvaluation(versions);
    if (current) {
      verdicts.set(attemptId, current.verdict as Verdict);
    }
  }
  return verdicts;
}

function cardEvents(db: Writer, cardId: string) {
  const rows = db
    .select()
    .from(observations)
    .where(eq(observations.cardId, cardId))
    .all()
    .filter((row) => MEMORY_KINDS.includes(row.kind));
  const verdicts = currentVerdicts(
    db
      .select({
        attemptId: evaluations.attemptId,
        id: evaluations.id,
        version: evaluations.version,
        verdict: evaluations.verdict,
      })
      .from(evaluations)
      .innerJoin(observations, eq(observations.id, evaluations.attemptId))
      .where(eq(observations.cardId, cardId))
      .all(),
  );
  return memoryEventsOf(rows, verdicts);
}

// El historial de una tarjeta en el orden en que se registró.
export function cardHistory(db: Writer, cardId: string): HistoryEvent[] {
  return cardEvents(db, cardId)
    .map(({ history }) => history)
    .sort((a, b) => a.seq - b.seq);
}

function project(createdAt: string, events: readonly MemoryEvent[]): CardMemory {
  return projectCardMemory(
    { createdAt: new Date(createdAt), events },
    MEMORY_CONFIG,
    MEMORY_ENGINE_VERSION,
  );
}

function writeSchedule(db: Writer, row: ScheduleRow): void {
  const values = { ...row };
  db.insert(cardSchedule)
    .values(values)
    .onConflictDoUpdate({ target: cardSchedule.cardId, set: values })
    .run();
}

// Recalcula y guarda la agenda de una tarjeta desde todos sus eventos (en la misma transacción
// que el evento que la cambió).
export function recomputeCardSchedule(db: Writer, cardId: string): CardMemory {
  const card = db
    .select({ createdAt: cards.createdAt })
    .from(cards)
    .where(eq(cards.id, cardId))
    .get();
  if (!card) {
    throw new Error('No encontré la tarjeta para recalcular su agenda');
  }
  const memory = project(
    card.createdAt,
    cardEvents(db, cardId).map(({ event }) => event),
  );
  writeSchedule(db, scheduleRowOf(cardId, memory, MEMORY_CONFIG.retention));
  return memory;
}

// Lo que debería estar guardado para cada tarjeta existente (también las de la Papelera),
// recalculado desde el historial completo.
function expectedSchedules(db: Writer): ScheduleRow[] {
  const allCards = db.select({ id: cards.id, createdAt: cards.createdAt }).from(cards).all();
  const rows = db.select().from(observations).where(inArray(observations.kind, MEMORY_KINDS)).all();
  const verdicts = currentVerdicts(
    db
      .select({
        attemptId: evaluations.attemptId,
        id: evaluations.id,
        version: evaluations.version,
        verdict: evaluations.verdict,
      })
      .from(evaluations)
      .all(),
  );
  const eventsByCard = new Map<string, MemoryEvent[]>();
  for (const { cardId, event } of memoryEventsOf(rows, verdicts)) {
    eventsByCard.set(cardId, [...(eventsByCard.get(cardId) ?? []), event]);
  }
  return allCards.map((card) =>
    scheduleRowOf(
      card.id,
      project(card.createdAt, eventsByCard.get(card.id) ?? []),
      MEMORY_CONFIG.retention,
    ),
  );
}

function storedSchedules(db: Writer): ScheduleRow[] {
  return db.select().from(cardSchedule).all();
}

function compare(db: Writer): { differences: Difference[]; expected: ScheduleRow[] } {
  const expected = expectedSchedules(db);
  return { differences: compareSchedules(storedSchedules(db), expected), expected };
}

export interface DataDifference {
  readonly cardId: string;
  // La pregunta de la tarjeta, o nada si la agenda es de una tarjeta que no existe.
  readonly question: string | null;
  readonly kind: Difference['kind'];
  readonly storedDay: string | null;
  readonly expectedDay: string | null;
}

const dayOf = (instant: string | null) => (instant === null ? null : studyDayOf(new Date(instant)));

// «Verificar datos»: recalcula todo desde el historial y lo compara con lo guardado.
export function verifyData(db: ReteniaDatabase): DataDifference[] {
  const { differences } = compare(db.orm);
  if (differences.length === 0) {
    return [];
  }
  const questions = new Map(
    db.orm
      .select({ id: cards.id, question: cardVersions.question })
      .from(cards)
      .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
      .all()
      .map((row) => [row.id, row.question]),
  );
  return differences.map((difference) => ({
    cardId: difference.cardId,
    question: questions.get(difference.cardId) ?? null,
    kind: difference.kind,
    storedDay: dayOf(difference.storedDueAt),
    expectedDay: dayOf(difference.expectedDueAt),
  }));
}

// «Reparar desde el historial»: reescribe, agrega o saca filas de la agenda (una proyección).
// Nunca toca un evento. Devuelve lo que queda distinto después (nada, salvo un error).
export function repairData(db: ReteniaDatabase): DataDifference[] {
  db.orm.transaction((tx) => {
    const { differences, expected } = compare(tx);
    const byCard = new Map(expected.map((row) => [row.cardId, row]));
    for (const difference of differences) {
      const row = byCard.get(difference.cardId);
      if (row === undefined) {
        tx.delete(cardSchedule).where(eq(cardSchedule.cardId, difference.cardId)).run();
      } else {
        writeSchedule(tx, row);
      }
    }
  });
  return verifyData(db);
}
