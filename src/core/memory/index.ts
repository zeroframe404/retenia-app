import {
  createEmptyCard,
  type Grade as FsrsGrade,
  fsrs,
  generatorParameters,
  Rating,
} from 'ts-fsrs';

// El motor de repaso mínimo de la Fase 03: ts-fsrs con FSRS-6 y sus parámetros por defecto,
// sin variación al azar y sin pasos de aprendizaje de minutos. El reloj llega siempre como
// argumento. La Fase 09 lo amplía; la fecha de CA-010 tiene que seguir dando lo mismo.

export type Grade = 'again' | 'hard' | 'good';

const DEFAULT_RETENTION = 0.9;

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
