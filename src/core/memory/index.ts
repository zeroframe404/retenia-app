import {
  createEmptyCard,
  type Grade as FsrsGrade,
  fsrs,
  generatorParameters,
  Rating,
} from 'ts-fsrs';
import { inCanonicalOrder } from '../ledger';

// El motor de repaso mínimo de la Fase 03: ts-fsrs con FSRS-6 y sus parámetros por defecto,
// sin variación al azar y sin pasos de aprendizaje de minutos. El reloj llega siempre como
// argumento. La Fase 09 lo amplía; la fecha de CA-010 tiene que seguir dando lo mismo.

export type Grade = 'again' | 'hard' | 'good';

export const DEFAULT_RETENTION = 0.9;

// La versión del motor con la que se calcula la agenda. Una agenda guardada se recalcula con la
// misma versión; la Fase 09 trae la siguiente.
export const MEMORY_ENGINE_VERSION = 1;

const RATINGS: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

export interface CardMemory {
  // 0 = nueva, 2 = en repaso (los números de State de ts-fsrs).
  state: number;
  stability: number;
  difficulty: number;
  dueAt: Date;
  lastReviewAt: Date | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
}

// Con `enable_short_term: false` ts-fsrs fuerza intervalos crecientes entre los tres botones
// y «La sabía» de una tarjeta nueva da 3 días. Con los pasos vacíos da 2 (el redondeo de la
// estabilidad inicial 2,3065), que es lo que fijan CA-010 y CA-058. Ambas formas evitan los
// minutos; esta es la que coincide con la especificación.
function scheduler(retention: number) {
  return fsrs(
    generatorParameters({
      request_retention: retention,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: [],
      relearning_steps: [],
    }),
  );
}

export function newCardMemory(now: Date): CardMemory {
  const card = createEmptyCard(now);
  return {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    dueAt: card.due,
    lastReviewAt: null,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduled_days,
  };
}

export function reviewCard(
  memory: CardMemory,
  grade: Grade,
  now: Date,
  retention: number = DEFAULT_RETENTION,
): CardMemory {
  // Si el reloj retrocede (la PC se atrasó o se restableció la fecha de demostración), ts-fsrs
  // rechaza un tiempo negativo: se cuenta desde el último repaso, como si no hubiera pasado nada.
  if (memory.lastReviewAt && now < memory.lastReviewAt) {
    now = memory.lastReviewAt;
  }
  const next = scheduler(retention).next(
    {
      due: memory.dueAt,
      stability: memory.stability,
      difficulty: memory.difficulty,
      elapsed_days: 0,
      scheduled_days: memory.scheduledDays,
      learning_steps: 0,
      reps: memory.reps,
      lapses: memory.lapses,
      state: memory.state,
      ...(memory.lastReviewAt ? { last_review: memory.lastReviewAt } : {}),
    },
    now,
    RATINGS[grade],
  ).card;
  return {
    state: next.state,
    stability: next.stability,
    difficulty: next.difficulty,
    dueAt: next.due,
    lastReviewAt: now,
    reps: next.reps,
    lapses: next.lapses,
    scheduledDays: next.scheduled_days,
  };
}

// Cómo se calificó un repaso (la evaluación) y con qué botón se repasa la tarjeta.
export type Verdict = 'correct' | 'partial' | 'incorrect';

const VERDICTS: Record<Grade, Verdict> = { good: 'correct', hard: 'partial', again: 'incorrect' };
const GRADES: Record<Verdict, Grade> = { correct: 'good', partial: 'hard', incorrect: 'again' };

export function verdictOfGrade(grade: Grade): Verdict {
  return VERDICTS[grade];
}

export function gradeOfVerdict(verdict: Verdict): Grade {
  return GRADES[verdict];
}

// Lo que mueve la agenda de una tarjeta: un repaso (con la calificación de su evaluación
// vigente) o la agenda que traía de antes del libro mayor (bases de la Fase 03).
export type MemoryEvent =
  | {
      readonly kind: 'review';
      readonly id: string;
      readonly seq: number;
      readonly occurredAt: Date;
      readonly grade: Grade;
    }
  | {
      readonly kind: 'adopted';
      readonly id: string;
      readonly seq: number;
      readonly memory: CardMemory;
    };

export interface MemoryConfig {
  readonly retention: number;
}

export class UnknownEngineError extends Error {
  constructor(version: number) {
    super(`No conozco la versión ${version} del motor de memoria`);
    this.name = 'UnknownEngineError';
  }
}

// La agenda de una tarjeta como proyección: se recalcula entera desde sus eventos, la
// configuración y la versión del motor, en el orden canónico. Da lo mismo que haber repasado
// uno por uno en el momento, así «Verificar datos» la puede comparar con la guardada.
export function projectCardMemory(
  { createdAt, events }: { createdAt: Date; events: readonly MemoryEvent[] },
  config: MemoryConfig,
  engineVersion: number,
): CardMemory {
  if (engineVersion !== MEMORY_ENGINE_VERSION) {
    throw new UnknownEngineError(engineVersion);
  }
  let memory = newCardMemory(createdAt);
  for (const event of inCanonicalOrder(events)) {
    memory =
      event.kind === 'adopted'
        ? event.memory
        : reviewCard(memory, event.grade, event.occurredAt, config.retention);
  }
  return memory;
}
