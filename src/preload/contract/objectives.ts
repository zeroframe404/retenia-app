import { z } from 'zod';

// Los objetivos (Fase 17, H-34 y H-35): crear, enlazar actividades, la lista por tema, el panel de
// evidencias, los requisitos, «Ya lo sé» y «No quiero esto ahora». También «Mis errores» y
// «Mejorar la tarjeta» (H-36).

const MAX_OBJECTIVE_LENGTH = 200;
const MAX_CONDITIONS_LENGTH = 300;
const MAX_LINKED = 1000;

const objectiveKindSchema = z.enum(['remember', 'understand', 'apply', 'reason', 'execute']);
export type ObjectiveKindValue = z.output<typeof objectiveKindSchema>;

const masteryStateSchema = z.enum([
  'not-started',
  'in-practice',
  'to-review',
  'enough',
  'consolidated',
]);
export type MasteryStateValue = z.output<typeof masteryStateSchema>;

// Un objetivo tuyo (UUID) o el implícito «Recordar: tema» de un tema («topic:<tema>») o de las
// tarjetas sin tema de una materia («subject:<materia>»).
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const objectiveRefSchema = z.union([
  z.uuid(),
  z.string().regex(new RegExp(`^(topic|subject):${UUID}$`, 'u')),
]);

const day = z.iso.date();

const objectiveSummarySchema = z.strictObject({
  id: objectiveRefSchema,
  implicit: z.boolean(),
  topicId: z.uuid().nullable(),
  // El nombre del tema (nulo: sin tema).
  topicName: z.string().nullable(),
  // El texto del objetivo; en uno implícito, el nombre del tema (la pantalla dice «Recordar: …»).
  title: z.string(),
  kind: objectiveKindSchema,
  state: masteryStateSchema,
  toVerify: z.boolean(),
  postponed: z.boolean(),
  activityCount: z.number().int().nonnegative(),
});
export type ObjectiveSummary = z.output<typeof objectiveSummarySchema>;

export const objectivesListRequest = z.strictObject({ subjectId: z.uuid().optional() });
export const objectivesListResponse = z.strictObject({
  subject: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  topics: z.array(
    z.strictObject({
      topicId: z.uuid().nullable(),
      name: z.string().nullable(),
      objectives: z.array(objectiveSummarySchema),
    }),
  ),
});
export type ObjectivesList = z.output<typeof objectivesListResponse>;

export const objectivesCreateRequest = z.strictObject({
  objectiveId: z.uuid(),
  subjectId: z.uuid(),
  topicId: z.uuid().nullable(),
  text: z.string().trim().min(1).max(MAX_OBJECTIVE_LENGTH),
  conditions: z.string().trim().max(MAX_CONDITIONS_LENGTH).nullable(),
  kind: objectiveKindSchema,
  cardIds: z.array(z.uuid()).max(MAX_LINKED),
});
export const objectivesCreateResponse = z.strictObject({
  objectiveId: z.uuid(),
  // Si el texto empieza con algo que se puede hacer (si no, la pantalla avisa).
  observable: z.boolean(),
});

// Las actividades que se pueden enlazar: las del tema (o todas las de la materia), con su objetivo
// de ahora.
export const objectivesActivitiesRequest = z.strictObject({
  subjectId: z.uuid(),
  topicId: z.uuid().nullable().optional(),
});
const objectiveActivitySchema = z.strictObject({
  cardId: z.uuid(),
  question: z.string(),
  isExercise: z.boolean(),
  topicId: z.uuid().nullable(),
  objectiveId: objectiveRefSchema,
  objectiveTitle: z.string(),
  objectiveImplicit: z.boolean(),
});
export const objectivesActivitiesResponse = z.strictObject({
  activities: z.array(objectiveActivitySchema),
});

// Enlazar actividades a un objetivo tuyo, o devolverlas al implícito de su tema (nulo).
export const objectivesLinkRequest = z.strictObject({
  linkId: z.uuid(),
  objectiveId: z.uuid().nullable(),
  cardIds: z.array(z.uuid()).min(1).max(MAX_LINKED),
});
export const objectivesLinkResponse = z.strictObject({ linked: z.number().int().nonnegative() });

export const objectiveIdRequest = z.strictObject({ objectiveId: z.uuid() });
export const objectivePanelRequest = z.strictObject({ objectiveId: objectiveRefSchema });

const column = z.strictObject({ count: z.number().int().nonnegative(), lastDay: day.nullable() });

const nextStepSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('start') }),
  z.strictObject({ kind: z.literal('toEnough'), remaining: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('recover') }),
  z.strictObject({ kind: z.literal('check'), from: day }),
  z.strictObject({
    kind: z.literal('toConsolidated'),
    remaining: z.number().int().positive(),
    delayedFrom: day.nullable(),
  }),
  z.strictObject({ kind: z.literal('kept') }),
]);
export type NextStepValue = z.output<typeof nextStepSchema>;

const requirementKindSchema = z.enum(['indispensable', 'recommended']);
const requirementStatusSchema = z.enum(['confirmed', 'suggested']);

const requirementViewSchema = z.strictObject({
  requirementId: z.uuid(),
  objectiveId: z.uuid(),
  objectiveTitle: z.string(),
  requiresId: z.uuid(),
  requiresTitle: z.string(),
  kind: requirementKindSchema,
  status: requirementStatusSchema,
  // El estado del objetivo que hace falta antes, y si ya está cumplido.
  requiredState: masteryStateSchema,
  met: z.boolean(),
  // Si frena (indispensable, confirmado y sin cumplir).
  blocking: z.boolean(),
});
export type RequirementView = z.output<typeof requirementViewSchema>;

export const objectivePanelResponse = z.strictObject({
  objective: objectiveSummarySchema.extend({
    action: z.string(),
    content: z.string(),
    conditions: z.string().nullable(),
  }),
  columns: z.strictObject({
    unaided: column,
    aided: column,
    delayed: column,
    variants: column,
  }),
  nextStep: nextStepSchema,
  pendingCheckFrom: day.nullable(),
  // La estimación del concepto (por nivel), con su respaldo: nunca un porcentaje.
  estimate: z.strictObject({
    concept: z.string(),
    outOfTen: z.number().int().min(0).max(10).nullable(),
    observations: z.number().int().nonnegative(),
  }),
  activities: z.array(
    z.strictObject({
      cardId: z.uuid(),
      question: z.string(),
      isExercise: z.boolean(),
      // Se puede practicar ahora (no en pausa, «En revisión» ni «Retirada»).
      practicable: z.boolean(),
    }),
  ),
  // Intentos de estas actividades de cuando eran de otro objetivo: se ven, no cuentan acá.
  previousAttempts: z.number().int().nonnegative(),
  needs: z.array(requirementViewSchema),
  neededBy: z.array(requirementViewSchema),
  // Los objetivos tuyos de la materia que podrían ser requisito de este (sin armar un círculo).
  requirementCandidates: z.array(z.strictObject({ objectiveId: z.uuid(), title: z.string() })),
  // Los objetivos tuyos de la materia de los que este podría ser requisito.
  dependentCandidates: z.array(z.strictObject({ objectiveId: z.uuid(), title: z.string() })),
});
export type ObjectivePanel = z.output<typeof objectivePanelResponse>;

export const requirementsAddRequest = z.strictObject({
  requirementId: z.uuid(),
  objectiveId: z.uuid(),
  requiresId: z.uuid(),
  kind: requirementKindSchema,
  status: requirementStatusSchema,
});
export const requirementIdRequest = z.strictObject({ requirementId: z.uuid() });

// --- «Mis errores» (CA-155) ---

const mistakeTypeSchema = z.enum([
  'distraction',
  'forgotten',
  'confusion',
  'calculation',
  'missingIdea',
  'stepOrder',
  'other',
]);
export type MistakeTypeValue = z.output<typeof mistakeTypeSchema>;

export const progressErrorsRequest = z.strictObject({ subjectId: z.uuid().optional() });
export const progressErrorsResponse = z.strictObject({
  subject: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  groups: z.array(
    z.strictObject({
      topicId: z.uuid().nullable(),
      topicName: z.string().nullable(),
      items: z.array(
        z.strictObject({
          attemptId: z.uuid(),
          cardId: z.uuid(),
          question: z.string(),
          // Lo que escribiste, tal cual.
          written: z.string(),
          correct: z.string(),
          type: mistakeTypeSchema,
          // Si el tipo lo elegiste vos (si no, es el que propone la regla).
          typeChosen: z.boolean(),
          day,
          practicable: z.boolean(),
        }),
      ),
    }),
  ),
});
export type ProgressErrors = z.output<typeof progressErrorsResponse>;

export const progressErrorsSetTypeRequest = z.strictObject({
  attemptId: z.uuid(),
  type: mistakeTypeSchema,
});

// --- «Mejorar la tarjeta» (CA-154) ---

export const improveCardsResponse = z.strictObject({
  cards: z.array(
    z.strictObject({
      cardId: z.uuid(),
      question: z.string(),
      answer: z.string(),
      reason: z.enum(['total', 'thirtyDays']),
      failures: z.number().int().positive(),
      hasCite: z.boolean(),
      isExercise: z.boolean(),
    }),
  ),
});
export type ImproveCards = z.output<typeof improveCardsResponse>;

const MAX_SIDE = 2000;
// `splitId`: el mismo pedido dos veces no crea otras dos tarjetas.
export const improveSplitRequest = z.strictObject({
  splitId: z.uuid(),
  cardId: z.uuid(),
  parts: z
    .array(
      z.strictObject({
        question: z.string().trim().min(1).max(MAX_SIDE),
        answer: z.string().trim().min(1).max(MAX_SIDE),
      }),
    )
    .length(2),
});
export const improveSplitResponse = z.strictObject({ cardIds: z.array(z.uuid()).length(2) });
