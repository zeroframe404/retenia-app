import { and, eq, inArray } from 'drizzle-orm';
import {
  compareSchedules,
  type Difference,
  type ScheduleRow,
  scheduleRowOf,
} from '../core/data-check';
import { type ActivityType, hasPendingCheck } from '../core/evaluation';
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
  verdictOfGrade,
} from '../core/memory';
import { SUBJECT_STATUSES } from '../core/organization';
import { studyDayOf } from '../core/study-day';
import { readPayload } from './ledger';
import type { Writer } from './orm';
import { postponementsOf } from './postponements';
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
  // Fase 16: un intento sobre un ejercicio, con su evaluación vigente.
  'attempt.submitted',
];

// La evaluación vigente de un intento: el veredicto y si quedó afectado (no cuenta, CA-142).
interface CurrentEvaluation {
  readonly verdict: Verdict;
  readonly affected: boolean;
}

type ObservationRow = typeof observations.$inferSelect;

export interface HistoryEvent {
  readonly id: string;
  readonly seq: number;
  readonly occurredAt: Date;
  // La calificación que vale (la de la evaluación vigente) o «adopted» para la agenda heredada.
  // «reset»: cambió lo que hay que recordar y la tarjeta volvió a programarse como nueva.
  // «postponed» (Fase 11): un aplazamiento, sin resultado ni calificación.
  readonly result: 'again' | 'hard' | 'good' | 'adopted' | 'reset' | 'postponed';
  // Para un aplazamiento, el día para el que quedó.
  readonly plannedDay: string | null;
  // El repaso se deshizo (CA-063): figura como «Anulado».
  readonly annulled: boolean;
  // Por qué un repaso quedó anotado sin cambiar la fecha: ya había otro ese día de estudio, o tiene
  // un día anterior al último que contó (la fecha volvió atrás).
  readonly skipped: 'sameDay' | 'earlier' | null;
  // Si llegó al motor (Fase 10: la regla de los 4 fallos seguidos cuenta solo estos).
  readonly counted: boolean;
  // Fase 15: «anki» si el repaso se importó de Anki.
  readonly origin: 'anki' | null;
  // Fase 16: el intento quedó afectado («La pregunta era ambigua», «La referencia es
  // incorrecta»): no cuenta.
  readonly affected?: boolean | undefined;
  // Fase 16: en un intento sobre un ejercicio, su evaluación vigente (nula si todavía no se
  // evaluó), todas sus versiones de la más vieja a la más nueva (para tachar las anteriores) y la
  // ayuda más alta que usó.
  readonly evaluation?: AttemptEvaluation | null | undefined;
}

interface AttemptEvaluation {
  readonly activity: ActivityType;
  readonly current: Verdict | null;
  readonly versions: readonly Verdict[];
  readonly causes: readonly string[];
  readonly helpLevel: HelpLevel;
}

// Los eventos que mueven la agenda, con la calificación de la evaluación vigente de cada repaso.
function memoryEventsOf(
  rows: readonly ObservationRow[],
  verdicts: ReadonlyMap<string, CurrentEvaluation>,
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
    if (row.kind === 'attempt.submitted') {
      const attempt = readPayload('attempt.submitted', row.schemaVersion, row.payload);
      const current = verdicts.get(row.id);
      return {
        cardId: attempt.cardId,
        event: {
          kind: 'review',
          id: row.id,
          seq: row.seq,
          occurredAt: new Date(row.occurredAt),
          // Sin evaluación todavía (se cerró antes de salir del resultado): queda anotado y no
          // llega al motor.
          grade: current === undefined ? 'again' : gradeOfVerdict(current.verdict),
          interrupted: current === undefined,
          helpLevel: attempt.helpLevel,
          optionsQuestion: attempt.optionsQuestion,
          retry: attempt.attemptNo > 1,
          defective: current?.affected === true,
          fuzz: false,
        },
      };
    }
    const payload = readPayload('review.graded', row.schemaVersion, row.payload);
    const current = verdicts.get(row.id);
    const grade = current === undefined ? payload.grade : gradeOfVerdict(current.verdict);
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
        retry: 'retry' in payload ? payload.retry === true : false,
        defective: current?.affected === true,
      },
    };
  });
}

interface EvaluationRow {
  readonly attemptId: string;
  readonly id: string;
  readonly version: number;
  readonly verdict: string;
  readonly affected: number;
}

const evaluationColumns = {
  attemptId: evaluations.attemptId,
  id: evaluations.id,
  version: evaluations.version,
  verdict: evaluations.verdict,
  affected: evaluations.affected,
};

// La evaluación vigente de cada intento.
function currentVerdicts(rows: readonly EvaluationRow[]): Map<string, CurrentEvaluation> {
  const byAttempt = new Map<string, EvaluationRow[]>();
  for (const row of rows) {
    byAttempt.set(row.attemptId, [...(byAttempt.get(row.attemptId) ?? []), row]);
  }
  const verdicts = new Map<string, CurrentEvaluation>();
  for (const [attemptId, versions] of byAttempt) {
    const current = currentEvaluation(versions);
    if (current) {
      verdicts.set(attemptId, {
        verdict: current.verdict as Verdict,
        affected: current.affected === 1,
      });
    }
  }
  return verdicts;
}

function cardEvaluations(db: Writer, cardId: string): Map<string, CurrentEvaluation> {
  return currentVerdicts(
    db
      .select(evaluationColumns)
      .from(evaluations)
      .innerJoin(observations, eq(observations.id, evaluations.attemptId))
      .where(eq(observations.cardId, cardId))
      .all(),
  );
}

function cardEvents(db: Writer, cardId: string): MemoryEvent[] {
  const rows = db
    .select()
    .from(observations)
    .where(eq(observations.cardId, cardId))
    .all()
    .filter((row) => MEMORY_KINDS.includes(row.kind));
  return memoryEventsOf(rows, cardEvaluations(db, cardId)).map(({ event }) => event);
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

// Las evaluaciones de cada intento sobre un ejercicio de la tarjeta (Fase 16), por intento.
function attemptEvaluationsOf(db: Writer, cardId: string): Map<string, AttemptEvaluation> {
  const submitted = db
    .select({
      id: observations.id,
      payload: observations.payload,
      version: observations.schemaVersion,
    })
    .from(observations)
    .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'attempt.submitted')))
    .all();
  const versions = db
    .select({
      attemptId: evaluations.attemptId,
      version: evaluations.version,
      verdict: evaluations.verdict,
      cause: evaluations.cause,
    })
    .from(evaluations)
    .innerJoin(observations, eq(observations.id, evaluations.attemptId))
    .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'attempt.submitted')))
    .all()
    .sort((a, b) => a.version - b.version);
  return new Map(
    submitted.map((row) => {
      const attempt = readPayload('attempt.submitted', row.version, row.payload);
      const own = versions.filter((version) => version.attemptId === row.id);
      return [
        row.id,
        {
          activity: attempt.activityType,
          current: (own.at(-1)?.verdict as Verdict | undefined) ?? null,
          versions: own.map((version) => version.verdict as Verdict),
          causes: own.map((version) => version.cause),
          helpLevel: attempt.helpLevel,
        },
      ];
    }),
  );
}

// ¿Queda una comprobación sin ayuda pendiente (CA-137)? Después de un acierto con pista de concepto o
// de paso, hasta un acierto sin ayuda que cuente.
export function pendingCheckOf(db: Writer, cardId: string): boolean {
  const events = cardEvents(db, cardId);
  const options = new Set(
    events.flatMap((event) =>
      event.kind === 'review' && event.optionsQuestion === true ? [event.id] : [],
    ),
  );
  return hasPendingCheck(
    trace(cardId, cardBasics(db, cardId), events).steps.map((step) => ({
      studyDay: step.studyDay,
      counted: step.counted,
      verdict: verdictOfGrade(step.grade),
      helpLevel: step.helpLevel,
      optionsQuestion: options.has(step.id),
    })),
  );
}

// El historial de una tarjeta en el orden en que se registró, con los repasos anulados y los del
// mismo día marcados.
export function cardHistory(db: Writer, cardId: string): HistoryEvent[] {
  const events = cardEvents(db, cardId);
  const steps = new Map(cardTrace(db, cardId).steps.map((step) => [step.id, step]));
  const rows = db
    .select({
      id: observations.id,
      occurredAt: observations.occurredAt,
      source: observations.source,
    })
    .from(observations)
    .where(eq(observations.cardId, cardId))
    .all();
  const occurredAt = new Map(rows.map((row) => [row.id, new Date(row.occurredAt)]));
  const fromAnki = new Set(rows.filter((row) => row.source === 'import:anki').map((row) => row.id));
  const attempts = attemptEvaluationsOf(db, cardId);
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
            plannedDay: null,
            annulled: false,
            skipped: null,
            counted: false,
            origin: null,
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
          plannedDay: null,
          annulled: step?.reason === 'annulled',
          skipped: step?.reason === 'sameDay' || step?.reason === 'earlier' ? step.reason : null,
          counted: step?.counted === true,
          origin: fromAnki.has(event.id) ? ('anki' as const) : null,
          affected: event.defective === true,
          evaluation: attempts.get(event.id) ?? null,
        },
      ];
    })
    .concat(
      postponementsOf(db, cardId).map((postponement) => ({
        id: postponement.id,
        seq: postponement.seq,
        occurredAt: postponement.occurredAt,
        result: 'postponed' as const,
        plannedDay: postponement.plannedDay,
        annulled: false,
        skipped: null,
        counted: false,
        origin: null,
      })),
    )
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
  const verdicts = currentVerdicts(db.select(evaluationColumns).from(evaluations).all());
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
