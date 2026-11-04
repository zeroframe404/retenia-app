import { eq, inArray } from 'drizzle-orm';
import {
  compareSchedules,
  type Difference,
  type ScheduleRow,
  scheduleRowOf,
} from '../core/data-check';
import { currentEvaluation } from '../core/ledger';
import {
  type AppearanceRule,
  appearanceRule,
  type CardMemory,
  type DueExplanation,
  daysBetween,
  explainDue,
  gradeOfVerdict,
  type HelpLevel,
  MEMORY_ENGINE_VERSION,
  MEMORY_PARAMETERS_VERSION,
  type MemoryEvent,
  type MemoryTrace,
  recallProbability,
  retentionForSubject,
  traceCardMemory,
  type Verdict,
} from '../core/memory';
import { SUBJECT_STATUSES } from '../core/organization';
import { studyDayOf } from '../core/study-day';
import { readPayload } from './ledger';
import type { Writer } from './orm';
import { cardSchedule, cards, cardVersions, evaluations, observations, subjects } from './schema';

// La agenda de cada tarjeta es una proyección (docs/modelo-de-datos.md, sección 1.3): se
// recalcula entera desde sus eventos con la misma función pura de core, al guardar un repaso y
// al verificar los datos. Así lo guardado y lo recalculado no pueden diferir salvo por un error.
// Desde la Fase 09 la calcula el motor 2 con la retención de la materia de la tarjeta, tomada de su
// estado en el momento de calcular (0,90 la activa, 0,85 las demás).

const MEMORY_KINDS = [
  'review.graded',
  'review.annulled',
  'schedule.adopted',
  'card.meaning_changed',
];

type ObservationRow = typeof observations.$inferSelect;

export interface HistoryEvent {
  readonly id: string;
  readonly seq: number;
  readonly occurredAt: Date;
  // La calificación que vale (la de la evaluación vigente) o «adopted» para la agenda heredada.
  // «reset»: cambió lo que hay que recordar y la tarjeta volvió a programarse como nueva.
  readonly result: 'again' | 'hard' | 'good' | 'adopted' | 'reset';
  // El repaso se deshizo (CA-063): figura como «Anulado».
  readonly annulled: boolean;
  // Hubo otro repaso antes ese mismo día de estudio: quedó anotado y no cambió la fecha.
  readonly sameDay: boolean;
}

// Los eventos que mueven la agenda, con la calificación de la evaluación vigente de cada repaso.
function memoryEventsOf(
  rows: readonly ObservationRow[],
  verdicts: ReadonlyMap<string, Verdict>,
): { cardId: string; event: MemoryEvent }[] {
  return rows.map((row) => {
    if (row.kind === 'schedule.adopted') {
      const { cardId, memory } = readPayload('schedule.adopted', row.schemaVersion, row.payload);
      const adopted: CardMemory = {
        ...memory,
        dueAt: new Date(memory.dueAt),
        lastReviewAt: memory.lastReviewAt === null ? null : new Date(memory.lastReviewAt),
      };
      return { cardId, event: { kind: 'adopted', id: row.id, seq: row.seq, memory: adopted } };
    }
    if (row.kind === 'card.meaning_changed') {
      const { cardId } = readPayload('card.meaning_changed', row.schemaVersion, row.payload);
      return {
        cardId,
        event: { kind: 'reset', id: row.id, seq: row.seq, occurredAt: new Date(row.occurredAt) },
      };
    }
    if (row.kind === 'review.annulled') {
      const { cardId, reviewId } = readPayload('review.annulled', row.schemaVersion, row.payload);
      return { cardId, event: { kind: 'annulled', id: row.id, seq: row.seq, reviewId } };
    }
    const payload = readPayload('review.graded', row.schemaVersion, row.payload);
    const verdict = verdicts.get(row.id);
    const grade = verdict === undefined ? payload.grade : gradeOfVerdict(verdict);
    const helpLevel: HelpLevel = payload.helpLevel;
    return {
      cardId: payload.cardId,
      event: {
        kind: 'review',
        id: row.id,
        seq: row.seq,
        occurredAt: new Date(row.occurredAt),
        grade,
        helpLevel,
        fuzz: 'fuzz' in payload ? payload.fuzz : false,
      },
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

function cardEvents(db: Writer, cardId: string): MemoryEvent[] {
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
  return memoryEventsOf(rows, verdicts).map(({ event }) => event);
}

const asStatus = (value: string | null) =>
  value === null ? null : (SUBJECT_STATUSES.find((status) => status === value) ?? 'maintenance');

interface CardBasics {
  readonly createdAt: string;
  readonly retention: number;
}

// Cuándo se creó la tarjeta y la retención objetivo de su materia hoy.
function cardBasics(db: Writer, cardId: string): CardBasics {
  const card = db
    .select({ createdAt: cards.createdAt, status: subjects.status })
    .from(cards)
    .leftJoin(subjects, eq(subjects.id, cards.subjectId))
    .where(eq(cards.id, cardId))
    .get();
  if (!card) {
    throw new Error('No encontré la tarjeta para recalcular su agenda');
  }
  return { createdAt: card.createdAt, retention: retentionForSubject(asStatus(card.status)) };
}

function trace(cardId: string, basics: CardBasics, events: readonly MemoryEvent[]): MemoryTrace {
  return traceCardMemory(
    { cardId, createdAt: new Date(basics.createdAt), events },
    { retention: basics.retention },
  );
}

// Lo que el motor sabe hoy de una tarjeta: su memoria y qué pasó con cada intento.
function cardTrace(db: Writer, cardId: string): MemoryTrace {
  return trace(cardId, cardBasics(db, cardId), cardEvents(db, cardId));
}

// El historial de una tarjeta en el orden en que se registró, con los repasos anulados y los del
// mismo día marcados.
export function cardHistory(db: Writer, cardId: string): HistoryEvent[] {
  const events = cardEvents(db, cardId);
  const steps = new Map(cardTrace(db, cardId).steps.map((step) => [step.id, step]));
  const occurredAt = new Map(
    db
      .select({ id: observations.id, occurredAt: observations.occurredAt })
      .from(observations)
      .where(eq(observations.cardId, cardId))
      .all()
      .map((row) => [row.id, new Date(row.occurredAt)]),
  );
  return events
    .flatMap((event): HistoryEvent[] => {
      const at = occurredAt.get(event.id) ?? new Date(0);
      if (event.kind === 'annulled') {
        return [];
      }
      if (event.kind !== 'review') {
        return [
          {
            id: event.id,
            seq: event.seq,
            occurredAt: at,
            result: event.kind === 'adopted' ? 'adopted' : 'reset',
            annulled: false,
            sameDay: false,
          },
        ];
      }
      const step = steps.get(event.id);
      return [
        {
          id: event.id,
          seq: event.seq,
          occurredAt: at,
          result: event.grade,
          annulled: step?.reason === 'annulled',
          sameDay: step?.reason === 'sameDay',
        },
      ];
    })
    .sort((a, b) => a.seq - b.seq);
}

// «¿Por qué hoy?» de una tarjeta, el día de estudio `today`.
export function whyToday(db: Writer, cardId: string, today: string): DueExplanation {
  return explainDue(cardTrace(db, cardId), today);
}

// Lo que se guarda junto a un intento (Fase 09): lo que el motor predecía en ese momento, los días
// que pasaron de verdad, por qué apareció la tarjeta y con qué motor y parámetros se calcula.
export function reviewFacts(
  db: Writer,
  cardId: string,
  occurredAt: Date,
  fuzz: boolean,
): {
  predictedRecall: number | null;
  elapsedDays: number | null;
  rule: AppearanceRule;
  engineVersion: number;
  parametersVersion: string;
  retention: number;
  fuzz: boolean;
} {
  const basics = cardBasics(db, cardId);
  const { memory, steps } = trace(cardId, basics, cardEvents(db, cardId));
  const today = studyDayOf(occurredAt);
  const failedToday = steps.some(
    (step) => step.reason !== 'annulled' && step.studyDay === today && step.engineGrade === 'again',
  );
  return {
    predictedRecall: recallProbability(memory, today),
    elapsedDays:
      memory.lastReviewAt === null
        ? null
        : Math.max(0, daysBetween(today, studyDayOf(memory.lastReviewAt))),
    rule: appearanceRule({ memory, today, failedToday }),
    engineVersion: MEMORY_ENGINE_VERSION,
    parametersVersion: MEMORY_PARAMETERS_VERSION,
    retention: basics.retention,
    fuzz,
  };
}

function writeSchedule(db: Writer, row: ScheduleRow): void {
  const values = { ...row, engineVersion: row.engineVersion ?? MEMORY_ENGINE_VERSION };
  db.insert(cardSchedule)
    .values(values)
    .onConflictDoUpdate({ target: cardSchedule.cardId, set: values })
    .run();
}

// Recalcula y guarda la agenda de una tarjeta desde todos sus eventos (en la misma transacción
// que el evento que la cambió).
export function recomputeCardSchedule(db: Writer, cardId: string): CardMemory {
  const basics = cardBasics(db, cardId);
  const { memory } = trace(cardId, basics, cardEvents(db, cardId));
  writeSchedule(db, scheduleRowOf(cardId, memory, basics.retention, MEMORY_ENGINE_VERSION));
  return memory;
}

// Las agendas que no están al día con el motor vigente o con la retención de su materia (se
// calcularon con el motor de antes, o la materia cambió de estado): se recalculan. Corre al abrir
// la base y cada vez que una materia cambia de estado o recibe tarjetas sin materia.
export function refreshStaleSchedules(db: Writer): number {
  const rows = db
    .select({
      cardId: cardSchedule.cardId,
      engineVersion: cardSchedule.engineVersion,
      retentionTarget: cardSchedule.retentionTarget,
      status: subjects.status,
    })
    .from(cardSchedule)
    .innerJoin(cards, eq(cards.id, cardSchedule.cardId))
    .leftJoin(subjects, eq(subjects.id, cards.subjectId))
    .all();
  const stale = rows.filter(
    (row) =>
      row.engineVersion !== MEMORY_ENGINE_VERSION ||
      row.retentionTarget !== retentionForSubject(asStatus(row.status)),
  );
  for (const row of stale) {
    recomputeCardSchedule(db, row.cardId);
  }
  return stale.length;
}

// Lo que debería estar guardado para cada tarjeta existente (también las de la Papelera),
// recalculado desde el historial completo.
function expectedSchedules(db: Writer): ScheduleRow[] {
  const allCards = db
    .select({ id: cards.id, createdAt: cards.createdAt, status: subjects.status })
    .from(cards)
    .leftJoin(subjects, eq(subjects.id, cards.subjectId))
    .all();
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
  return allCards.map((card) => {
    const basics = {
      createdAt: card.createdAt,
      retention: retentionForSubject(asStatus(card.status)),
    };
    const { memory } = trace(card.id, basics, eventsByCard.get(card.id) ?? []);
    return scheduleRowOf(card.id, memory, basics.retention, MEMORY_ENGINE_VERSION);
  });
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
// (Recibe la base abierta; se nombra por su `orm` para no importar database.ts, que importa esto.)
export function verifyData(db: { readonly orm: Writer }): DataDifference[] {
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
export function repairData(db: { readonly orm: Writer }): DataDifference[] {
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
