import { z } from 'zod';
import { day } from './common';

// Canales de las actividades de la Fase 16 (H-31 a H-33): «Practicar ahora», la barra de ayuda,
// «Enviar», el resultado, «Discrepo» y el aviso de evaluación corregida. La ventana nunca recibe la
// respuesta de referencia antes de enviar o de confirmar que quiere ver la solución.

const ACTIVITY_TYPES = [
  'short',
  'numeric',
  'options',
  'order',
  'open',
  // Fase 18: el procedimiento, la decisión y el conjunto intercalado.
  'procedure',
  'decision',
  'interleaved',
] as const;
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);

const MAX_TEXT = 100_000;
const itemId = z.string().min(1).max(64);
const itemText = z.string().trim().min(1).max(MAX_TEXT);

const MAX_UNIT_LENGTH = 20;
const MAX_NAME = 40;
const MAX_FORMULA = 500;
const name = z.string().trim().min(1).max(MAX_NAME);
const formula = z.string().trim().min(1).max(MAX_FORMULA);

// Una familia de variantes (Fase 18): enunciados con «{dato}», los datos que cambian y los que salen
// de una cuenta.
const variantFamilySchema = z.strictObject({
  statements: z.array(itemText).min(1).max(6),
  parameters: z
    .array(z.strictObject({ name, values: z.array(z.number()).min(1).max(200) }))
    .min(1)
    .max(8),
  derived: z.array(z.strictObject({ name, formula })).max(8),
});
export type VariantFamilyValue = z.output<typeof variantFamilySchema>;

const procedureStepSchema = z.strictObject({
  id: itemId,
  prompt: itemText,
  expected: z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('number'),
      formula,
      tolerance: z.number().nonnegative(),
      unit: z.string().trim().min(1).max(MAX_UNIT_LENGTH).nullable(),
    }),
    z.strictObject({ type: z.literal('text'), text: itemText }),
  ]),
  explanation: itemText,
  key: z.boolean(),
});

const choice = z.strictObject({
  id: itemId,
  text: itemText,
  correct: z.boolean(),
  explanation: z.string().trim().max(MAX_TEXT),
});

// Lo propio de cada tipo, como se guarda en la ficha (el editor lo valida igual que el núcleo).
export const activitySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('short') }),
  z.strictObject({
    type: z.literal('numeric'),
    value: z.number(),
    tolerance: z.number().nonnegative(),
    unit: z.string().trim().min(1).max(MAX_UNIT_LENGTH).nullable(),
    family: variantFamilySchema.nullable().optional(),
    formula: formula.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal('options'),
    options: z.array(choice).length(3),
  }),
  z.strictObject({
    type: z.literal('procedure'),
    steps: z.array(procedureStepSchema).min(2).max(8),
    family: variantFamilySchema.nullable(),
  }),
  z.strictObject({ type: z.literal('decision'), options: z.array(choice).min(2).max(5) }),
  z.strictObject({
    type: z.literal('interleaved'),
    types: z
      .array(
        z.strictObject({
          id: itemId,
          name: itemText,
          cardIds: z.array(z.uuid()).min(1).max(30),
        }),
      )
      .min(2)
      .max(5),
  }),
  z.strictObject({
    type: z.literal('order'),
    steps: z
      .array(z.strictObject({ id: itemId, text: itemText }))
      .min(3)
      .max(8),
    acceptedOrders: z.array(z.array(itemId).max(8)).max(20),
  }),
  z.strictObject({
    type: z.literal('open'),
    units: z
      .array(z.strictObject({ id: itemId, text: itemText }))
      .min(2)
      .max(4),
  }),
]);
export type ActivityValue = z.output<typeof activitySchema>;

export const activityModeSchema = z.enum(['practice', 'evaluation']);
export type ActivityModeValue = z.output<typeof activityModeSchema>;

export const verdictSchema = z.enum(['correct', 'partial', 'incorrect']);
export type VerdictValue = z.output<typeof verdictSchema>;

const helpLevelSchema = z.enum(['A0', 'A1', 'A2', 'A3', 'A4']);
export const helpUseSchema = z.strictObject({
  kind: z.enum(['hint', 'example', 'source', 'solution']),
  level: helpLevelSchema,
  index: z.number().int().min(0).max(2).optional(),
  atMs: z.number().int().nonnegative().optional(),
});
export type HelpUseValue = z.output<typeof helpUseSchema>;
const helpList = z.array(helpUseSchema).max(40);

// El rótulo de la actividad: «PRÁCTICA AUTÓNOMA», «PRÁCTICA CON AYUDA» o «EVALUACIÓN».
const modeLabelSchema = z.enum(['autonomous', 'help', 'evaluation']);

const availabilitySchema = z.strictObject({
  hint: z.boolean(),
  example: z.boolean(),
  source: z.boolean(),
  noIdea: z.boolean(),
});

// «Practicar ahora»: lo que hace falta para mostrar la actividad, sin la respuesta.
export const activitiesStartRequest = z.strictObject({
  cardId: z.uuid(),
  openingId: z.uuid(),
});
const activityInputSchema = z.discriminatedUnion('type', [
  // La tarjeta de siempre: «Tu respuesta…» y «Mostrar respuesta».
  z.strictObject({ type: z.literal('card') }),
  z.strictObject({ type: z.literal('short') }),
  z.strictObject({ type: z.literal('numeric'), unit: z.string().nullable() }),
  // Mezcladas con la semilla de la apertura.
  z.strictObject({
    type: z.literal('options'),
    options: z.array(z.strictObject({ id: itemId, text: z.string() })),
  }),
  // En el orden inicial, que nunca es el correcto.
  z.strictObject({
    type: z.literal('order'),
    steps: z.array(z.strictObject({ id: itemId, text: z.string() })),
  }),
  z.strictObject({ type: z.literal('open') }),
  z.strictObject({
    type: z.literal('decision'),
    options: z.array(z.strictObject({ id: itemId, text: z.string() })),
  }),
  // El procedimiento y el conjunto tienen sus propios canales.
  z.strictObject({ type: z.literal('procedure') }),
  z.strictObject({ type: z.literal('interleaved') }),
]);

export const activityOpeningSchema = z.strictObject({
  cardId: z.uuid(),
  question: z.string(),
  mode: activityModeSchema,
  label: modeLabelSchema,
  input: activityInputSchema,
  // Qué botones de la barra se prenden antes y después de empezar el intento (CA-135).
  // `retry`: en un reintento (desde «Reintentar»), que ya es práctica aunque la actividad sea una
  // evaluación.
  availability: z.strictObject({
    idle: availabilitySchema,
    started: availabilitySchema,
    retry: availabilitySchema,
  }),
  hints: z.number().int().min(0).max(3),
  // En una numérica con variantes, el enunciado con los números de esta vez.
  statement: z.string().optional(),
});
export type ActivityOpening = z.output<typeof activityOpeningSchema>;

// Fase 18: lo que está mal en un ejercicio antes de guardarlo (las cuentas y los conjuntos solo
// los puede comprobar el principal).
export const activitiesValidateRequest = z.strictObject({
  activity: activitySchema,
  subjectId: z.uuid().nullable(),
});
export const activitiesValidateResponse = z.strictObject({ problems: z.array(z.string()) });

// Una ayuda de la barra (CA-136): la próxima pista, el ejemplo, la fuente o la solución. Para la
// solución hace falta haber confirmado la pregunta.
export const activitiesHelpRequest = z.strictObject({
  cardId: z.uuid(),
  openingId: z.uuid(),
  kind: z.enum(['hint', 'example', 'source', 'solution']),
  used: helpList,
  confirmed: z.boolean().optional(),
  attemptNo: z.number().int().positive(),
});
const citeSchema = z.strictObject({
  materialId: z.uuid(),
  reference: z.string(),
  quote: z.string(),
  status: z.enum(['located', 'pending', 'relocate']),
});
const solutionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('card'), answer: z.string() }),
  z.strictObject({ type: z.literal('short'), answer: z.string() }),
  z.strictObject({ type: z.literal('numeric'), answer: z.string() }),
  z.strictObject({ type: z.literal('options'), answer: z.string() }),
  z.strictObject({ type: z.literal('order'), steps: z.array(z.string()) }),
  z.strictObject({ type: z.literal('open'), units: z.array(z.string()) }),
  z.strictObject({ type: z.literal('decision'), answer: z.string() }),
  z.strictObject({ type: z.literal('procedure'), steps: z.array(z.string()) }),
]);
export const activitiesHelpResponse = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('confirmSolution') }),
  z.strictObject({
    kind: z.literal('help'),
    use: helpUseSchema,
    label: modeLabelSchema,
    content: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('hint'), index: z.number().int(), text: z.string() }),
      z.strictObject({ kind: z.literal('example'), text: z.string() }),
      z.strictObject({ kind: z.literal('source'), text: z.string(), cite: citeSchema.nullable() }),
      z.strictObject({ kind: z.literal('solution'), solution: solutionSchema }),
    ]),
  }),
]);
export type ActivityHelp = z.output<typeof activitiesHelpResponse>;

const attemptAnswerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('short'), text: z.string().max(MAX_TEXT) }),
  z.strictObject({ type: z.literal('numeric'), raw: z.string().max(200) }),
  z.strictObject({
    type: z.literal('options'),
    optionId: itemId,
    shown: z.array(itemId).max(3),
  }),
  z.strictObject({
    type: z.literal('order'),
    stepIds: z.array(itemId).max(8),
    initial: z.array(itemId).max(8),
  }),
  z.strictObject({ type: z.literal('open'), text: z.string().max(MAX_TEXT) }),
  z.strictObject({
    type: z.literal('decision'),
    optionId: itemId,
    shown: z.array(itemId).max(5),
  }),
]);
export type AttemptAnswer = z.output<typeof attemptAnswerSchema>;

export const activitiesSubmitRequest = z.strictObject({
  cardId: z.uuid(),
  openingId: z.uuid(),
  attemptId: z.uuid(),
  attemptNo: z.number().int().positive(),
  answer: attemptAnswerSchema,
  help: helpList,
  noIdea: z.boolean(),
  // Fase 18: el conjunto intercalado en el que se resuelve.
  runId: z.uuid().optional(),
});

// La primera interacción con la actividad (escribir, elegir, mover): el principal mide el tiempo.
export const activitiesMarkRequest = z.strictObject({ openingId: z.uuid() });

// Las claves del resultado en tres líneas (los textos están en el catálogo).
const resultPartsSchema = z.strictObject({
  verdict: z.enum([
    'correct',
    'partial',
    'incorrect',
    'hintConcept',
    'hintStep',
    'example',
    'source',
    'solution',
  ]),
  review: z.enum([
    'nothing',
    'orientingUsed',
    'helpUsed',
    'optionsChance',
    'letters',
    'number',
    'unit',
    'unreadable',
    'optionExplanation',
    'steps',
    'missingUnits',
  ]),
  action: z.enum(['next', 'check', 'retryLater', 'retry', 'explanation']),
});
export type ResultPartsValue = z.output<typeof resultPartsSchema>;

const diffStepSchema = z.strictObject({
  op: z.enum(['same', 'changed', 'extra', 'missing']),
  written: z.string().nullable(),
  expected: z.string().nullable(),
});
export type DiffStepValue = z.output<typeof diffStepSchema>;

// El diagnóstico tras un fallo (Fase 17, CA-153): una sola acción siguiente con su motivo, en el
// orden del criterio. Nulo si no es un fallo.
const diagnosisSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('checkUnaided'),
    reason: z.enum(['previousAided', 'previousOptions']),
  }),
  z.strictObject({ action: z.literal('sendToReview'), reason: z.literal('doubtful') }),
  z.strictObject({
    action: z.literal('goToRequirement'),
    reason: z.literal('missingRequirement'),
    requirement: z.strictObject({
      objectiveId: z.uuid(),
      title: z.string(),
      state: z.enum(['not-started', 'in-practice', 'to-review', 'enough', 'consolidated']),
    }),
  }),
  z.strictObject({
    action: z.literal('practiceDifference'),
    reason: z.literal('confusion'),
    confusedWith: z.strictObject({ cardId: z.uuid(), question: z.string() }),
  }),
  z.strictObject({ action: z.literal('forgotten'), reason: z.literal('forgotten') }),
]);
export type DiagnosisValue = z.output<typeof diagnosisSchema>;

// Lo que se muestra al enviar, según el tipo.
const attemptDetailSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('short'),
    written: z.string(),
    expected: z.string(),
    diff: z.array(diffStepSchema),
  }),
  z.strictObject({
    type: z.literal('numeric'),
    expected: z.number(),
    tolerance: z.number(),
    unit: z.string().nullable(),
    reason: z.enum(['unreadable', 'unit', 'off']).nullable(),
  }),
  z.strictObject({
    type: z.literal('options'),
    chosenId: z.string(),
    correctId: z.string(),
    correctText: z.string(),
    explanation: z.string().nullable(),
  }),
  z.strictObject({
    type: z.literal('order'),
    given: z.array(z.strictObject({ id: z.string(), text: z.string(), ok: z.boolean() })),
    correct: z.array(z.string()),
  }),
  z.strictObject({
    type: z.literal('open'),
    units: z.array(z.strictObject({ id: z.string(), text: z.string() })),
  }),
  // «¿Qué método usarías?»: lo elegido, el correcto y el porqué de cada uno.
  z.strictObject({
    type: z.literal('decision'),
    chosenId: z.string(),
    correctId: z.string(),
    correctText: z.string(),
    explanation: z.string().nullable(),
    options: z.array(
      z.strictObject({
        id: z.string(),
        text: z.string(),
        why: z.string(),
        correct: z.boolean(),
      }),
    ),
  }),
]);
export type AttemptDetail = z.output<typeof attemptDetailSchema>;

const proposalSchema = z.strictObject({
  proposed: verdictSchema,
  allowed: z.array(verdictSchema),
  parts: resultPartsSchema,
  // Las unidades de idea que faltan (respuesta abierta), para «qué revisar».
  missing: z.array(z.string()),
  // Fase 17: con «Todavía no.», qué sigue y por qué (CA-153).
  diagnosis: diagnosisSchema.nullable(),
});

export const activitiesSubmitResponse = z.strictObject({
  attemptId: z.uuid(),
  ...proposalSchema.shape,
  detail: attemptDetailSchema,
  explanation: z.string(),
});
export type SubmitResult = z.output<typeof activitiesSubmitResponse>;

const marked = z.array(itemId).max(4);

// `verdict`: el resultado elegido (si se bajó), para mostrar sus tres líneas.
export const activitiesProposeRequest = z.strictObject({
  attemptId: z.uuid(),
  marked,
  verdict: verdictSchema.optional(),
});
export const activitiesProposeResponse = proposalSchema;
export type Proposal = z.output<typeof proposalSchema>;

export const activitiesFinalizeRequest = z.strictObject({
  attemptId: z.uuid(),
  verdict: verdictSchema,
  marked: marked.optional(),
});
export const activitiesFinalizeResponse = z.strictObject({
  verdict: verdictSchema,
  parts: resultPartsSchema,
  nextReviewDay: day.nullable(),
  pendingCheck: z.boolean(),
  // El día de la comprobación sin ayuda, si quedó pendiente.
  checkDay: day.nullable(),
  diagnosis: diagnosisSchema.nullable(),
});
export type FinalResult = z.output<typeof activitiesFinalizeResponse>;

export const APPEAL_REASONS = [
  'answer_correct',
  'ambiguous',
  'reference_incomplete',
  'reference_incorrect',
] as const;
const appealReasonSchema = z.enum(APPEAL_REASONS);
export type AppealReason = z.output<typeof appealReasonSchema>;

// El aviso de evaluación corregida (CA-141): antes, después y el próximo repaso antes y después.
const amendmentNoticeSchema = z.strictObject({
  amendmentId: z.uuid(),
  cardId: z.uuid(),
  attemptId: z.uuid(),
  reason: appealReasonSchema,
  before: verdictSchema,
  after: z.enum(['correct', 'partial', 'incorrect', 'notCounted']),
  dueBefore: day.nullable(),
  dueAfter: day.nullable(),
  // La tarjeta quedó «En revisión».
  inReview: z.boolean(),
});
export type AmendmentNotice = z.output<typeof amendmentNoticeSchema>;

export const activitiesAppealRequest = z.strictObject({
  attemptId: z.uuid(),
  reason: appealReasonSchema,
  // El resultado elegido, si todavía no se guardó (se guarda primero).
  verdict: verdictSchema.optional(),
  marked: marked.optional(),
});
export const activitiesAppealResponse = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('amended'),
    notice: amendmentNoticeSchema,
    verdict: verdictSchema,
    parts: resultPartsSchema,
  }),
  // «La referencia está incompleta»: se abre la ficha en la parte a corregir.
  z.strictObject({
    kind: z.literal('editor'),
    field: z.enum(['variants', 'numeric', 'options', 'steps', 'units']),
  }),
]);
export type AppealResult = z.output<typeof activitiesAppealResponse>;

export const activitiesAmendmentRequest = z.strictObject({ amendmentId: z.uuid() });
export const activitiesUndoResponse = z.strictObject({
  verdict: verdictSchema,
  nextReviewDay: day.nullable(),
});
export const activitiesNoticesRequest = z.strictObject({ cardId: z.uuid() });
export const activitiesNoticesResponse = z.array(amendmentNoticeSchema);
