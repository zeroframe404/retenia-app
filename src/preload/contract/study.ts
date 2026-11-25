import { z } from 'zod';
import { helpUseSchema } from './activities';
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

// Cuánto tiempo hay para estudiar (Fase 11): los cuatro tiempos de «Tengo:».
export const SESSION_MINUTES = [5, 10, 25, 45] as const;
const minutesSchema = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(45)]);
export type SessionMinutes = z.output<typeof minutesSchema>;

// Qué parte de lo vencido y de lo nuevo se estudia en una alternativa de «Elegir otra actividad».
const focusSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('reviewsOnly') }),
  z.strictObject({ kind: z.literal('newOnly') }),
  z.strictObject({ kind: z.literal('topic'), topicId: z.uuid() }),
]);
export type SessionFocus = z.output<typeof focusSchema>;

const alternativeSchema = z.strictObject({
  kind: z.enum(['reviewsOnly', 'newOnly', 'topic']),
  topicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
  reviews: z.number().int().nonnegative(),
  newCards: z.number().int().nonnegative(),
  shownMinutes: z.number().int().positive(),
});
export type StudyAlternative = z.output<typeof alternativeSchema>;

// El requisito que nombra la propuesta (Fase 17).
const requirementLineSchema = z.strictObject({
  kind: z.enum(['before', 'maybe']),
  requirementId: z.uuid(),
  objectiveId: z.uuid(),
  objectiveTitle: z.string(),
  requiresId: z.uuid(),
  requiresTitle: z.string(),
  requiresState: z.enum(['not-started', 'in-practice', 'to-review', 'enough', 'consolidated']),
  // La primera actividad del requisito que se puede practicar ahora (nula si no tiene).
  practiceCardId: z.uuid().nullable(),
});
export type RequirementLine = z.output<typeof requirementLineSchema>;

// La propuesta de hoy (H-19): lo que entra en los minutos elegidos y por qué. Las duraciones ya
// vienen redondeadas a 5 minutos; el atraso se mide en días de lo que estudiás por día.
const proposalSchema = z.strictObject({
  // Los minutos de esta propuesta y los de siempre (los que se eligieron solo esta vez no se guardan).
  minutes: minutesSchema,
  defaultMinutes: minutesSchema,
  reviews: z.number().int().nonnegative(),
  newCards: z.number().int().nonnegative(),
  // Los repasos que no entran y quedan para mañana, sin calificarse.
  forTomorrow: z.number().int().nonnegative(),
  // Los que entran sí o sí porque ya se pospusieron 3 veces.
  forced: z.number().int().nonnegative(),
  shownMinutes: z.number().int().nonnegative(),
  // Con pocos intentos propios la duración es una estimación inicial.
  initialEstimate: z.boolean(),
  why: z.strictObject({
    // Los repasos que vencen hoy (lo observado) y lo que se estima por cada uno (lo estimado).
    due: z.number().int().nonnegative(),
    reviewSeconds: z.number().int().positive(),
    ownAttempts: z.number().int().nonnegative(),
  }),
  brake: z.strictObject({
    band: z.enum(['full', 'half', 'few', 'none']),
    days: z.number().nonnegative(),
  }),
  // Los repasos que se pospusieron para otro día y hoy no se ofrecen.
  postponedCount: z.number().int().nonnegative(),
  maintenance: z
    .strictObject({ subjectName: z.string(), minutes: z.number().int().positive() })
    .nullable(),
  alternatives: z.array(alternativeSchema).max(3),
  // Fase 17 (H-35): un requisito sin cumplir de un objetivo de la materia. «before»: frena (es
  // indispensable y confirmado) y la propuesta empieza por él («Antes conviene: …»); «maybe»: solo
  // avisa («Quizá te ayude repasar: …»).
  requirement: requirementLineSchema.nullable(),
  // Fase 17 (CA-150): la comprobación sin ayuda de un «Ya lo sé», desde el día siguiente.
  check: z
    .strictObject({
      objectiveId: z.uuid(),
      objectiveTitle: z.string(),
      practiceCardId: z.uuid().nullable(),
    })
    .nullable(),
});
export type StudyProposal = z.output<typeof proposalSchema>;

export const studyOverviewRequest = z.strictObject({ minutes: minutesSchema.optional() });

export const studyStartRequest = z.strictObject({
  sessionId: z.uuid(),
  minutes: minutesSchema.optional(),
  only: focusSchema.optional(),
});

export const studyPostponeRequest = z.strictObject({
  requestId: z.uuid(),
  minutes: minutesSchema.optional(),
  when: z.enum(['later', 'tomorrow', 'day']),
  day: day.optional(),
});
export const postponeResponse = z.strictObject({
  postponed: z.number().int().nonnegative(),
  forced: z.number().int().nonnegative(),
  plannedDay: day,
});
export type PostponeResult = z.output<typeof postponeResponse>;

export const studyOverviewSchema = z.strictObject({
  subjectId: z.uuid().nullable(),
  subjectName: z.string().nullable(),
  dueCount: z.number().int().nonnegative(),
  proposal: proposalSchema.nullable(),
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
  // Fase 16: la ayuda que se usó en esa tarjeta y si se tocó «No sé por dónde empezar».
  help: z.array(helpUseSchema).max(40).optional(),
  noIdea: z.boolean().optional(),
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
