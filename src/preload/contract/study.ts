import { z } from 'zod';
import { cardDetailSchema } from './cards';
import { day } from './common';

// La sesión de estudio (Fase 10): lo que pide la ventana y lo que devuelve el principal. Los
// identificadores de la sesión, del intento, de la valoración y de la duda los genera la ventana
// antes de pedir: un pedido repetido (un doble clic, un reintento) no agrega nada.

// Lo más largo que se acepta en «Tu respuesta…» y en una duda.
export const MAX_ANSWER_LENGTH = 20_000;
export const MAX_DOUBT_LENGTH = 2_000;

// Cada cuánto se guarda el borrador de «Tu respuesta…» (y además al perder el foco).
export const DRAFT_SAVE_MS = 2000;

const grade = z.enum(['again', 'hard', 'good']);
const status = z.enum(['active', 'paused', 'finished', 'abandoned']);
const ratingSchema = z.enum(['easy', 'fair', 'hard']);
export type SessionRating = z.output<typeof ratingSchema>;

const draftSchema = z.strictObject({
  text: z.string().max(MAX_ANSWER_LENGTH),
  answerShown: z.boolean(),
});

export const sessionViewSchema = z.strictObject({
  sessionId: z.uuid(),
  status,
  progress: z.strictObject({
    done: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
  complete: z.boolean(),
  current: z
    .strictObject({
      activityId: z.uuid(),
      cardId: z.uuid(),
      retry: z.boolean(),
      card: cardDetailSchema,
      draft: draftSchema,
    })
    .nullable(),
  // La última calificación, si se puede deshacer.
  undoable: z.strictObject({ activityId: z.uuid(), grade }).nullable(),
  // La ayuda de teclas, hasta que se la cierra la primera vez.
  showShortcuts: z.boolean(),
});
export type SessionView = z.output<typeof sessionViewSchema>;

export const studyOverviewSchema = z.strictObject({
  subjectId: z.uuid().nullable(),
  subjectName: z.string().nullable(),
  dueCount: z.number().int().nonnegative(),
  resumable: z
    .strictObject({
      sessionId: z.uuid(),
      done: z.number().int().nonnegative(),
      total: z.number().int().positive(),
    })
    .nullable(),
});
export type StudyOverview = z.output<typeof studyOverviewSchema>;

export const sessionIdRequest = z.strictObject({ sessionId: z.uuid() });
export const activityRequest = z.strictObject({ sessionId: z.uuid(), activityId: z.uuid() });

export const studyMarkRequest = z.strictObject({
  sessionId: z.uuid(),
  activityId: z.uuid(),
  mark: z.enum(['shown', 'firstInteraction', 'answerRequested']),
});

export const studyGradeRequest = z.strictObject({
  sessionId: z.uuid(),
  activityId: z.uuid(),
  attemptId: z.uuid(),
  grade,
  answer: z.string().max(MAX_ANSWER_LENGTH).nullable(),
});

export const studyFlagRequest = z.strictObject({
  sessionId: z.uuid(),
  activityId: z.uuid(),
  attemptId: z.uuid(),
});

export const studyDraftRequest = z.strictObject({
  sessionId: z.uuid(),
  activityId: z.uuid(),
  text: z.string().max(MAX_ANSWER_LENGTH),
  answerShown: z.boolean(),
});

export const studyRateRequest = z.strictObject({
  sessionId: z.uuid(),
  rating: ratingSchema,
  ratingId: z.uuid(),
});

const planOptionSchema = z.enum(['shorter', 'morePractice', 'pauseTopic']);
export type PlanOption = z.output<typeof planOptionSchema>;
export const studyAdjustRequest = z.strictObject({
  sessionId: z.uuid(),
  option: planOptionSchema,
});

export const sessionSummarySchema = z.strictObject({
  sessionId: z.uuid(),
  subjectName: z.string().nullable(),
  minutes: z.number().int().positive(),
  results: z.strictObject({
    good: z.number().int().nonnegative(),
    hard: z.number().int().nonnegative(),
    again: z.number().int().nonnegative(),
    flagged: z.number().int().nonnegative(),
  }),
  difficulties: z.array(
    z.strictObject({
      topicName: z.string().nullable(),
      cardIds: z.array(z.uuid()),
      questions: z.array(z.string()),
    }),
  ),
  remainingDueToday: z.number().int().nonnegative(),
  dueTomorrow: z.number().int().nonnegative(),
  rating: ratingSchema.nullable(),
  // Las tarjetas de la sesión, para elegir de cuál sale una duda.
  cards: z.array(z.strictObject({ cardId: z.uuid(), question: z.string() })),
  focusTopic: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
});
export type SessionSummary = z.output<typeof sessionSummarySchema>;

export const doubtsCreateRequest = z.strictObject({
  doubtId: z.uuid(),
  text: z.string().trim().min(1).max(MAX_DOUBT_LENGTH),
  cardId: z.uuid().nullable(),
  sessionId: z.uuid().nullable(),
});

export const reviewsResponse = z.strictObject({
  doubts: z.array(
    z.strictObject({
      id: z.uuid(),
      text: z.string(),
      createdAt: z.iso.datetime(),
      // El día (dd/mm/aaaa en pantalla) en Buenos Aires.
      day,
      card: z
        .strictObject({ id: z.uuid(), question: z.string(), subjectId: z.uuid().nullable() })
        .nullable(),
    }),
  ),
  inReview: z.array(
    z.strictObject({
      cardId: z.uuid(),
      question: z.string(),
      subjectId: z.uuid().nullable(),
      subjectName: z.string().nullable(),
    }),
  ),
});
export type ReviewsList = z.output<typeof reviewsResponse>;

export const okResponse = z.strictObject({ ok: z.literal(true) });
