import {
  createEmptyCard,
  type Grade as FsrsGrade,
  fsrs,
  generatorParameters,
  Rating,
} from 'ts-fsrs';
import { inCanonicalOrder } from '../ledger';
import type { CardMemory, Grade, MemoryConfig, MemoryEvent } from './types';

// La versión 1 del motor, la de las Fases 03 a 08, tal cual: ts-fsrs con FSRS-6 y sus parámetros
// por defecto, sin variación al azar y sin pasos de aprendizaje de minutos, contando el tiempo con
// la hora real (no con días de estudio) y pasándole al motor todos los repasos. Queda para
// recalcular lo que se calculó con ella; la agenda nueva usa la versión 2 (engine.ts).

const RATINGS: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

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
  retention = 0.9,
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

export function projectV1(
  createdAt: Date,
  events: readonly MemoryEvent[],
  config: MemoryConfig,
): CardMemory {
  let memory = newCardMemory(createdAt);
  for (const event of inCanonicalOrder(events)) {
    if (event.kind === 'adopted') {
      memory = event.memory;
    } else if (event.kind === 'reset') {
      memory = newCardMemory(event.occurredAt);
    } else if (event.kind === 'review') {
      memory = reviewCard(memory, event.grade, event.occurredAt, config.retention);
    }
  }
  return memory;
}
