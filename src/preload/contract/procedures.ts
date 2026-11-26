import { z } from 'zod';
import { diagnosisSchema, helpUseSchema, verdictSchema } from './activities';
import { day } from './common';

// Canales de la Fase 18 (H-37 a H-39): el procedimiento con su escalera de apoyo y su corrección por
// pasos, el conjunto intercalado y el micro-ejercicio. La ventana nunca recibe el resultado de un
// paso vacío antes de enviar y, si hay un error, antes de pedir la corrección.

const MAX_TEXT = 10_000;
const itemId = z.string().min(1).max(64);
const written = z.string().max(MAX_TEXT);
const position = z.number().int().positive();
const stepRef = z.strictObject({ stepId: itemId, position });

// --- El procedimiento ---

const rungSchema = z.strictObject({
  // «example»: el ejemplo completo; «blanks»: los últimos pasos vacíos; «whole»: el problema
  // entero; «variant»: una variante.
  kind: z.enum(['example', 'blanks', 'whole', 'variant']),
  blanks: z.number().int().nonnegative(),
});
export type RungValue = z.output<typeof rungSchema>;

export const procedureOpenRequest = z.strictObject({
  cardId: z.uuid(),
  openingId: z.uuid(),
});
export const procedureViewSchema = z.strictObject({
  cardId: z.uuid(),
  title: z.string(),
  // El enunciado con los números de esta vez (vacío si el procedimiento no tiene variantes).
  statement: z.string(),
  rung: rungSchema,
  steps: z.array(
    z.strictObject({
      id: itemId,
      position,
      prompt: z.string(),
      key: z.boolean(),
      // Para completar.
      blank: z.boolean(),
      answerType: z.enum(['number', 'text']),
      unit: z.string().nullable(),
      // El resultado y la explicación, solo en los pasos resueltos.
      solved: z.strictObject({ result: z.string(), explanation: z.string() }).nullable(),
    }),
  ),
  // Lo que contestaste la última vez a «¿Por qué este paso?».
  previousWhy: z.array(z.strictObject({ stepId: itemId, answer: z.string() })),
});
export type ProcedureView = z.output<typeof procedureViewSchema>;

// Cómo queda la escalera después de este intento.
const ladderSchema = z.strictObject({
  next: rungSchema,
  // «less»: se retiró un paso de apoyo; «more»: se sumó uno.
  change: z.enum(['less', 'more']).nullable(),
  // Falso si no era el primer intento del día (el escalón no cambia).
  counted: z.boolean(),
});
export type LadderValue = z.output<typeof ladderSchema>;

export const procedureStudiedRequest = z.strictObject({
  cardId: z.uuid(),
  openingId: z.uuid(),
  why: z
    .array(z.strictObject({ stepId: itemId, text: z.string().trim().min(1).max(MAX_TEXT) }))
    .max(8),
  studySessionId: z.uuid().optional(),
});
export const procedureStudiedResponse = z.strictObject({ ladder: ladderSchema });

const correctionSchema = z.strictObject({
  attemptId: z.uuid(),
  steps: z.array(
    z.strictObject({
      id: itemId,
      position,
      prompt: z.string(),
      written: z.string(),
      // Lo que escribiste al reintentar (el último).
      retried: z.string().nullable(),
      // «self»: un paso de texto, para comparar con el paso modelo.
      state: z.enum(['ok', 'fixed', 'wrong', 'self']),
      expected: z.string(),
      explanation: z.string(),
    }),
  ),
});
export type CorrectionValue = z.output<typeof correctionSchema>;

export const procedureCheckRequest = z.strictObject({
  cardId: z.uuid(),
  openingId: z.uuid(),
  attemptId: z.uuid(),
  answers: z.array(z.strictObject({ stepId: itemId, written })).max(8),
  help: z.array(helpUseSchema).max(40),
  noIdea: z.boolean(),
  studySessionId: z.uuid().optional(),
});
export const procedureCheckResponse = z.discriminatedUnion('kind', [
  // «Hay un error en el paso N; ¿lo encontrás?», sin mostrar la corrección todavía.
  z.strictObject({ kind: z.literal('error'), attemptId: z.uuid(), step: stepRef }),
  z.strictObject({ kind: z.literal('correction'), correction: correctionSchema }),
]);
export type ProcedureCheck = z.output<typeof procedureCheckResponse>;

export const procedureRetryRequest = z.strictObject({
  attemptId: z.uuid(),
  stepId: itemId,
  retryId: z.uuid(),
  written,
});
export const procedureRetryResponse = z.strictObject({
  ok: z.boolean(),
  // El próximo paso que sigue mal (nulo si ya están todos bien).
  next: stepRef.nullable(),
});

export const procedureCorrectionRequest = z.strictObject({ attemptId: z.uuid() });
export const procedureCorrectionResponse = correctionSchema;

export const procedureFinishRequest = z.strictObject({
  attemptId: z.uuid(),
  // En los pasos de texto: si lo tuyo coincide con el paso modelo.
  self: z.array(z.strictObject({ stepId: itemId, ok: z.boolean() })).max(8),
});
export const procedureFinishResponse = z.strictObject({
  verdict: verdictSchema,
  steps: z.array(z.strictObject({ id: itemId, position, state: z.enum(['ok', 'fixed', 'wrong']) })),
  ladder: ladderSchema,
  nextReviewDay: day.nullable(),
  // Tras un fallo, qué sigue y por qué (CA-153).
  diagnosis: diagnosisSchema.nullable(),
});
export type ProcedureResult = z.output<typeof procedureFinishResponse>;

// --- El conjunto intercalado ---

export const setsOpenRequest = z.strictObject({ cardId: z.uuid(), runId: z.uuid() });
export const setsOpenResponse = z.discriminatedUnion('kind', [
  // Todavía no practicaste por separado al menos 2 tipos.
  z.strictObject({ kind: z.literal('notReady'), missing: z.array(z.string()) }),
  // Algún enunciado nombra un tipo, hay materias mezcladas o quedó sin problemas.
  z.strictObject({
    kind: z.literal('invalid'),
    reason: z.enum(['namesType', 'subjects', 'empty']),
  }),
  z.strictObject({
    kind: z.literal('run'),
    runId: z.uuid(),
    title: z.string(),
    total: z.number().int().positive(),
    done: z.number().int().nonnegative(),
    // El próximo problema (nulo si ya no queda ninguno).
    nextCardId: z.uuid().nullable(),
  }),
]);
export type SetRun = z.output<typeof setsOpenResponse>;

export const setsSummaryRequest = z.strictObject({ runId: z.uuid() });
export const setsSummaryResponse = z.strictObject({
  title: z.string(),
  // El tipo de cada problema, en el orden en que salieron.
  order: z.array(
    z.strictObject({
      position,
      typeName: z.string(),
      verdict: verdictSchema.nullable(),
    }),
  ),
  complete: z.boolean(),
});
export type SetSummary = z.output<typeof setsSummaryResponse>;

// --- El micro-ejercicio ---

const proposalSchema = z.strictObject({
  pointKey: z.string().max(200),
  cardId: z.uuid(),
  // El procedimiento (o el problema) y el paso en que se repitió el error.
  title: z.string(),
  step: z.string().nullable(),
  items: z.number().int().min(5).max(10),
});
export type MicroProposal = z.output<typeof proposalSchema>;

export const microProposalResponse = z.strictObject({ proposal: proposalSchema.nullable() });

export const microOpenRequest = z.strictObject({
  microId: z.uuid(),
  pointKey: z.string().max(200),
});
export const microOpenResponse = z.strictObject({
  microId: z.uuid(),
  title: z.string(),
  step: z.string().nullable(),
  items: z.array(
    z.strictObject({
      index: z.number().int().nonnegative(),
      statement: z.string(),
      // Los pasos de antes, ya resueltos.
      givens: z.array(z.strictObject({ position, prompt: z.string(), result: z.string() })),
      prompt: z.string(),
      answerType: z.enum(['number', 'text']),
      unit: z.string().nullable(),
    }),
  ),
});
export type MicroExercise = z.output<typeof microOpenResponse>;

export const microCheckRequest = z.strictObject({
  microId: z.uuid(),
  index: z.number().int().min(0).max(9),
  written,
});
export const microCheckResponse = z.strictObject({
  // Nulo en un paso de texto: lo comparás vos.
  ok: z.boolean().nullable(),
  expected: z.string(),
  explanation: z.string(),
});
export type MicroCheck = z.output<typeof microCheckResponse>;

export const microSelfRequest = z.strictObject({
  microId: z.uuid(),
  index: z.number().int().min(0).max(9),
  ok: z.boolean(),
});

export const microFinishRequest = z.strictObject({ microId: z.uuid() });
export const microFinishResponse = z.strictObject({
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  // Esta sesión llegó al 85 % o más sin pistas.
  good: z.boolean(),
  // Las sesiones buenas en días distintos (de 2).
  goodSessions: z.number().int().min(0).max(2),
  passed: z.boolean(),
});
export type MicroResult = z.output<typeof microFinishResponse>;
