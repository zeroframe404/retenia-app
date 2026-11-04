import {
  default_w,
  type FSRS,
  type Grade as FsrsGrade,
  forgetting_curve,
  fsrs,
  generatorParameters,
  Rating,
  StrategyMode,
} from 'ts-fsrs';
import { inCanonicalOrder } from '../ledger';
import { studyDayOf } from '../study-day';
import type { CardHistoryInput, CardMemory, Grade, HelpLevel, MemoryConfig } from './types';
import { newCardMemory } from './v1';

// La versión 2 del motor de memoria (Fase 09): ts-fsrs con FSRS-6 y sus 21 parámetros por defecto,
// sin ajustarlos con tus datos y sin pasos de aprendizaje de minutos, con estas reglas encima:
//
// - El tiempo se cuenta en días de estudio de Buenos Aires (el día cambia a las 04:00), no en horas
//   ni en días de UTC.
// - Al motor solo le llega el primer intento de cada día de estudio: una tarjeta fallada vuelve
//   dentro de la sesión, pero esa vuelta no la reprograma.
// - La ayuda cambia lo que recibe el motor (CA-064) y un intento interrumpido o de una tarjeta
//   marcada como defectuosa no mueve nada.
// - Un repaso anulado («Deshacer», CA-063) queda en el historial y no cuenta.
// - La retención objetivo es la de la materia en el momento de calcular (CA-060).
// - En el uso real, la fecha lleva la variación al azar de ts-fsrs, con una semilla que sale de la
//   tarjeta, del número de repaso y de su día: el mismo historial da siempre la misma fecha, y
//   deshacer y rehacer el mismo repaso también.
//
// Nada de esto lee el reloj ni toca la base: todo llega por parámetro.

export const MEMORY_PARAMETERS: readonly number[] = Object.freeze([...default_w]);
// Identifica los parámetros con que se calculó cada repaso (se guarda junto al intento).
export const MEMORY_PARAMETERS_VERSION = 'fsrs6-default';

export const ACTIVE_RETENTION = 0.9;
export const MAINTENANCE_RETENTION = 0.85;

// Con menos intentos que estos, «¿Por qué hoy?» dice «Estimación general (sin datos tuyos)».
export const GENERAL_ESTIMATE_ATTEMPTS = 5;

type SubjectStatus = 'active' | 'maintenance' | 'paused' | 'archived';

// 0,90 para la materia activa y 0,85 para las demás (en mantenimiento, en pausa o archivadas: no
// avanzan, solo se repasan). Una tarjeta sin materia, de antes de la Fase 08, usa la de la activa.
export function retentionForSubject(status: SubjectStatus | null): number {
  return status === null || status === 'active' ? ACTIVE_RETENTION : MAINTENANCE_RETENTION;
}

const GRADES: readonly Grade[] = ['again', 'hard', 'good'];

class UnknownGradeError extends Error {
  constructor(grade: unknown) {
    super(`El motor no conoce la calificación «${String(grade)}»`);
    this.name = 'UnknownGradeError';
  }
}

// Lo que le llega al motor de un intento (CA-064): con pista de concepto o de paso, un acierto
// cuenta como «Con dudas»; con la solución vista, cualquier intento como «No la sabía»; con la
// pregunta orientadora, igual que sin ayuda. Interrumpido o defectuoso: nada (null).
export function engineGradeOf(attempt: {
  readonly grade: Grade;
  readonly helpLevel?: HelpLevel | undefined;
  readonly interrupted?: boolean | undefined;
  readonly defective?: boolean | undefined;
}): Grade | null {
  if (!GRADES.includes(attempt.grade)) {
    throw new UnknownGradeError(attempt.grade);
  }
  if (attempt.interrupted === true || attempt.defective === true) {
    return null;
  }
  const help = attempt.helpLevel ?? 'A0';
  if (help === 'A4') {
    return 'again';
  }
  if ((help === 'A2' || help === 'A3') && attempt.grade === 'good') {
    return 'hard';
  }
  return attempt.grade;
}

const DAY_MS = 86_400_000;

// Un día de estudio (AAAA-MM-DD) como instante del mediodía en UTC: así ts-fsrs, que cuenta días
// de UTC, cuenta exactamente días de estudio.
const noonOf = (day: string) => new Date(`${day}T12:00:00Z`);

export function daysBetween(later: string, earlier: string): number {
  return Math.round((noonOf(later).getTime() - noonOf(earlier).getTime()) / DAY_MS);
}

const RATINGS: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

// La semilla de la variación viaja en la tarjeta que recibe ts-fsrs, en este campo.
const SEED_FIELD = 'reteniaSeed';

// Un planificador por retención y variación (armarlos cuesta; el resultado no depende de nada más).
const schedulers = new Map<string, FSRS>();
function schedulerFor(retention: number, fuzz: boolean): FSRS {
  const key = `${retention}:${fuzz}`;
  const known = schedulers.get(key);
  if (known) {
    return known;
  }
  const made = fsrs(
    generatorParameters({
      w: [...MEMORY_PARAMETERS],
      request_retention: retention,
      enable_fuzz: fuzz,
      enable_short_term: true,
      learning_steps: [],
      relearning_steps: [],
    }),
  );
  // ts-fsrs llama a la estrategia con el planificador del repaso; la tarjeta que recibió está en su
  // campo `current` (protegido, por eso se lee con Reflect).
  // biome-ignore lint/correctness/useHookAtTopLevel: es un método de ts-fsrs, no un gancho de React.
  made.useStrategy(StrategyMode.SEED, function seed(this: object) {
    const current: unknown = Reflect.get(this, 'current');
    return String(typeof current === 'object' && current ? Reflect.get(current, SEED_FIELD) : '');
  });
  schedulers.set(key, made);
  return made;
}

function applyReview(
  memory: CardMemory,
  lastDay: string | null,
  review: { day: string; occurredAt: Date; grade: Grade; fuzz: boolean; seed: string },
  retention: number,
): CardMemory {
  const card = {
    due: noonOf(lastDay ?? review.day),
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: 0,
    scheduled_days: memory.scheduledDays,
    learning_steps: 0,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state,
    ...(lastDay === null ? {} : { last_review: noonOf(lastDay) }),
    [SEED_FIELD]: review.seed,
  };
  const next = schedulerFor(retention, review.fuzz).next(
    card,
    noonOf(review.day),
    RATINGS[review.grade],
  ).card;
  return {
    state: next.state,
    stability: next.stability,
    difficulty: next.difficulty,
    // Los días enteros se suman a la hora real del repaso: Buenos Aires no cambia de horario, así
    // que el día de estudio de la fecha es el del repaso más el intervalo.
    dueAt: new Date(review.occurredAt.getTime() + next.scheduled_days * DAY_MS),
    lastReviewAt: review.occurredAt,
    reps: next.reps,
    lapses: next.lapses,
    scheduledDays: next.scheduled_days,
  };
}

// Por qué un intento contó o no: lo tomó el motor, estaba anulado, ya hubo uno ese día de estudio o
// no tenía calificación para el motor (interrumpido o defectuoso).
type StepReason = 'counted' | 'annulled' | 'sameDay' | 'noGrade';

interface TraceStep {
  readonly id: string;
  readonly studyDay: string;
  readonly grade: Grade;
  readonly helpLevel: HelpLevel;
  readonly engineGrade: Grade | null;
  readonly counted: boolean;
  readonly reason: StepReason;
  // Días de estudio desde el repaso anterior que contó (null en el primero o si no contó).
  readonly elapsedDays: number | null;
  // La estabilidad con que quedó la tarjeta después de este intento.
  readonly stability: number;
}

export interface MemoryTrace {
  readonly memory: CardMemory;
  // Un paso por intento, en el orden canónico.
  readonly steps: readonly TraceStep[];
  // Lo que tomó el motor en el último repaso que contó (null si no hubo, o si viene de una agenda
  // heredada sin detalle).
  readonly lastGrade: Grade | null;
  // Tus intentos que el motor pudo usar (sin anulados, interrumpidos ni defectuosos), desde el
  // último reinicio.
  readonly attempts: number;
}

export function traceCardMemoryV2(
  { cardId, createdAt, events }: CardHistoryInput,
  config: MemoryConfig,
): MemoryTrace {
  const ordered = inCanonicalOrder(events);
  const annulled = new Set(
    ordered.flatMap((event) => (event.kind === 'annulled' ? [event.reviewId] : [])),
  );
  let memory = newCardMemory(createdAt);
  let lastDay: string | null = null;
  let lastGrade: Grade | null = null;
  let attempts = 0;
  const steps: TraceStep[] = [];
  for (const event of ordered) {
    if (event.kind === 'annulled') {
      continue;
    }
    if (event.kind === 'adopted') {
      memory = event.memory;
      lastDay = memory.lastReviewAt === null ? null : studyDayOf(memory.lastReviewAt);
      lastGrade = null;
      attempts = memory.reps;
      continue;
    }
    if (event.kind === 'reset') {
      memory = newCardMemory(event.occurredAt);
      lastDay = null;
      lastGrade = null;
      attempts = 0;
      continue;
    }
    const engineGrade = engineGradeOf(event);
    const day = studyDayOf(event.occurredAt);
    const base = {
      id: event.id,
      studyDay: day,
      grade: event.grade,
      helpLevel: event.helpLevel ?? 'A0',
      engineGrade,
    };
    const skip = (reason: StepReason) =>
      steps.push({
        ...base,
        counted: false,
        reason,
        elapsedDays: null,
        stability: memory.stability,
      });
    if (annulled.has(event.id)) {
      skip('annulled');
      continue;
    }
    if (engineGrade === null) {
      skip('noGrade');
      continue;
    }
    attempts += 1;
    // Un segundo intento el mismo día de estudio (o uno de un día anterior, si el reloj volvió
    // atrás) queda en el historial y no llega al motor.
    if (lastDay !== null && day <= lastDay) {
      skip('sameDay');
      continue;
    }
    const elapsedDays = lastDay === null ? null : daysBetween(day, lastDay);
    memory = applyReview(
      memory,
      lastDay,
      {
        day,
        occurredAt: event.occurredAt,
        grade: engineGrade,
        fuzz: event.fuzz === true,
        seed: `${cardId ?? ''}:${memory.reps + 1}:${day}`,
      },
      config.retention,
    );
    lastDay = day;
    lastGrade = engineGrade;
    steps.push({
      ...base,
      counted: true,
      reason: 'counted',
      elapsedDays,
      stability: memory.stability,
    });
  }
  return { memory, steps, lastGrade, attempts };
}

// La probabilidad estimada de recordarla hoy (con la curva de olvido de FSRS-6), o null si es
// nueva.
export function recallProbability(memory: CardMemory, today: string): number | null {
  if (memory.lastReviewAt === null || memory.reps === 0) {
    return null;
  }
  const elapsed = Math.max(0, daysBetween(today, studyDayOf(memory.lastReviewAt)));
  return forgetting_curve([...MEMORY_PARAMETERS], elapsed, memory.stability);
}

// «unos N de cada 10»: redondea hacia abajo, así nunca promete más de lo que estima el motor.
export function outOfTen(probability: number): number {
  return Math.min(10, Math.max(0, Math.floor(probability * 10 + 1e-9)));
}

export type DueExplanation =
  | { readonly kind: 'new'; readonly general: true }
  | {
      readonly kind: 'seen';
      readonly daysSince: number;
      readonly lastResult: Grade | null;
      readonly outOfTen: number;
      readonly general: boolean;
    };

// «¿Por qué hoy?» (CA-065): los días desde el último repaso, cómo salió y la probabilidad dicha
// como «unos N de cada 10», y si es una estimación general (con pocos intentos tuyos).
export function explainDue(trace: MemoryTrace, today: string): DueExplanation {
  const { memory } = trace;
  const probability = recallProbability(memory, today);
  if (probability === null || memory.lastReviewAt === null) {
    return { kind: 'new', general: true };
  }
  return {
    kind: 'seen',
    daysSince: Math.max(0, daysBetween(today, studyDayOf(memory.lastReviewAt))),
    lastResult: trace.lastGrade,
    outOfTen: outOfTen(probability),
    general: trace.attempts < GENERAL_ESTIMATE_ATTEMPTS,
  };
}

// Por qué apareció la tarjeta (se guarda junto al intento): ya fallada hoy, «reaprendizaje»; nueva
// o con su fecha cumplida, «vencida»; antes de su fecha, «elegida por mí». El «sondeo» lo pone
// quien arma el sondeo (Fase 27).
export type AppearanceRule = 'due' | 'relearning' | 'chosen' | 'probe';

export function appearanceRule({
  memory,
  today,
  failedToday,
}: {
  memory: CardMemory;
  today: string;
  failedToday: boolean;
}): AppearanceRule {
  if (failedToday) {
    return 'relearning';
  }
  if (memory.lastReviewAt === null) {
    return 'due';
  }
  return studyDayOf(memory.dueAt) <= today ? 'due' : 'chosen';
}
