import { z } from 'zod';
import {
  activityModeSchema,
  activitySchema,
  activityTypeSchema,
  helpUseSchema,
  verdictSchema,
} from './activities';
import { day } from './common';
import { inlineNodeSchema } from './notes';

// Canales de tarjetas. Los esquemas los comparten la ventana (que valida el formulario con
// los mismos), el puente y el proceso principal (que valida todo lo que llega).

// El tope es generoso a propósito: se pueden pegar varias páginas. Más que eso no es una tarjeta.
export const MAX_CARD_TEXT_LENGTH = 100_000;

// Se guarda sin los espacios y saltos de los bordes; lo que queda vacío no vale.
const cardText = z.string().trim().min(1).max(MAX_CARD_TEXT_LENGTH);

const gradeSchema = z.enum(['again', 'hard', 'good']);

// Los estados de la ficha (CA-053). «Propuesta» es solo de la IA: vos elegís los otros cuatro.
export const SHEET_STATE_VALUES = [
  'proposed',
  'reviewed',
  'verified',
  'in_review',
  'retired',
] as const;
const sheetStateSchema = z.enum(SHEET_STATE_VALUES);
export type SheetStateValue = z.output<typeof sheetStateSchema>;
const userSheetStateSchema = z.enum(['reviewed', 'verified', 'in_review', 'retired']);
const formTypeSchema = z.enum(['exact', 'meaning']);
const cardKindSchema = z.enum(['qa', 'cloze']);

// Los topes de la ficha: hasta 4 componentes esenciales (unidades de idea) y hasta 3 pistas.
export const MAX_ESSENTIALS = 4;
export const MAX_HINTS = 3;
const MAX_SHEET_ITEMS = 20;
const sheetLine = z.string().max(MAX_CARD_TEXT_LENGTH);

export const cardSchema = z.strictObject({
  id: z.uuid(),
  question: z.string(),
  answer: z.string(),
  // El día de estudio del próximo repaso; nulo mientras la tarjeta no se repasó.
  nextReviewDay: day.nullable(),
  // 'qa' (pregunta y respuesta) o 'cloze' (completar).
  kind: cardKindSchema,
  sheetState: sheetStateSchema,
  paused: z.boolean(),
  // «Disponible» (Fase 15): importada sin historial; no entra a los repasos hasta «Sumar a mis
  // repasos».
  available: z.boolean(),
  // El tema que se ve (nulo si no tiene o si está en la Papelera).
  topicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
  // Fase 16: el tipo de un ejercicio (nulo en la tarjeta de siempre). Lleva la marca «Ejercicio» y
  // no suma al contador.
  activityType: activityTypeSchema.nullable(),
});
export type Card = z.output<typeof cardSchema>;

// La ficha de una tarjeta completa. Todos los campos existen siempre (vacíos si no los cargaste).
const sheetSchema = z.strictObject({
  referenceAnswer: z.string(),
  variants: z.array(z.string()),
  essentials: z.array(z.string()).max(MAX_ESSENTIALS),
  hints: z.array(z.string()).max(MAX_HINTS),
  explanation: z.string(),
  source: z.string(),
  formType: formTypeSchema,
  state: sheetStateSchema,
});

// Lo que mandás al guardar la ficha: solo lo que cambia.
const sheetInputSchema = z.strictObject({
  referenceAnswer: sheetLine.optional(),
  variants: z.array(sheetLine).max(MAX_SHEET_ITEMS).optional(),
  essentials: z.array(sheetLine).max(MAX_SHEET_ITEMS).optional(),
  hints: z.array(sheetLine).max(MAX_SHEET_ITEMS).optional(),
  explanation: sheetLine.optional(),
  source: sheetLine.optional(),
  formType: formTypeSchema.optional(),
  state: userSheetStateSchema.optional(),
});
export type CardSheetInput = z.input<typeof sheetInputSchema>;

// El camino de contexto (CA-051): «Estadística básica › Regresión › Regresión lineal».
const cardPathSchema = z.strictObject({
  subjectName: z.string().nullable(),
  topicName: z.string().nullable(),
  noteTitle: z.string().nullable(),
  noteId: z.uuid().nullable(),
  blockId: z.uuid().nullable(),
  // «Ver en la nota» solo existe mientras el renglón siga pidiendo la tarjeta.
  canOpenNote: z.boolean(),
});

export const cardDetailSchema = z.strictObject({
  ...cardSchema.shape,
  // La pregunta y la respuesta con sus imágenes (CA-377); las fórmulas son texto entre signos $.
  questionContent: z.array(inlineNodeSchema),
  answerContent: z.array(inlineNodeSchema),
  sheet: sheetSchema,
  path: cardPathSchema,
  siblingGroupId: z.uuid().nullable(),
  inverseOfCardId: z.uuid().nullable(),
  // Ya tiene una tarjeta inversa (no se ofrece «Crear inversa» otra vez).
  hasInverse: z.boolean(),
  // Nació en un renglón y sigue ligada: su pregunta y respuesta se editan en la nota.
  linked: z.boolean(),
  // El renglón dejó de pedirla (lo borraste o le sacaste la marca) y la conservaste.
  detached: z.boolean(),
  hasHistory: z.boolean(),
  // La cita de un material (Fase 13): de dónde salió, la frase y si todavía se encuentra en el
  // original («located»), si el material todavía se está leyendo («pending») o si hay que
  // reubicarla («relocate», «Fuente a reubicar»).
  cite: z
    .strictObject({
      materialId: z.uuid(),
      reference: z.string(),
      quote: z.string(),
      status: z.enum(['located', 'pending', 'relocate']),
      // El texto del material se corrigió y la tarjeta todavía no se actualizó (Fase 14): «el origen
      // cambió», un aviso que no bloquea nada.
      changed: z.boolean(),
    })
    .nullable(),
  // Fase 16: lo propio del tipo de actividad, el ejemplo de «Ver un ejemplo», si es de práctica o de
  // evaluación y si quedó una comprobación sin ayuda pendiente (CA-137).
  activity: activitySchema.nullable(),
  example: z.string(),
  mode: activityModeSchema,
  pendingCheck: z.boolean(),
});
export type CardDetail = z.output<typeof cardDetailSchema>;

export const cardsCreateRequest = z.strictObject({
  question: cardText,
  answer: cardText,
  subjectId: z.uuid().nullable().optional(),
  topicId: z.uuid().nullable().optional(),
  // Fase 16: «Nuevo ejercicio» crea la actividad con su ficha de una vez.
  activity: activitySchema.nullable().optional(),
  sheet: sheetInputSchema.optional(),
  example: sheetLine.optional(),
  mode: activityModeSchema.optional(),
});

// La lista de una materia con sus filtros (CA-056). `total` son las de la materia sin filtrar.
export const cardsListRequest = z.strictObject({
  subjectId: z.uuid().optional(),
  // Un tema, o «none» para las que no tienen.
  topicId: z.union([z.uuid(), z.literal('none')]).optional(),
  sheetState: sheetStateSchema.optional(),
  // «exercise» (Fase 16): solo los ejercicios.
  kind: z.enum(['qa', 'cloze', 'exercise']).optional(),
});
export const cardsListResponse = z.strictObject({
  cards: z.array(cardSchema),
  total: z.number().int().nonnegative().default(0),
});

// `attemptId` lo genera la ventana al abrir el repaso: si el mismo repaso llega dos veces (un
// doble toque, un reintento), queda una sola vez en el historial.
export const cardsReviewRequest = z.strictObject({
  cardId: z.uuid(),
  grade: gradeSchema,
  attemptId: z.uuid(),
  // Fase 16: la ayuda que se usó con «Practicar ahora» y si se tocó «No sé por dónde empezar».
  help: z.array(helpUseSchema).max(40).optional(),
  noIdea: z.boolean().optional(),
});

// `meaningChanged` es la respuesta a «¿Cambió lo que hay que recordar?»: hace falta cuando la
// tarjeta tiene historial y cambia su pregunta o su respuesta.
export const cardsEditRequest = z.strictObject({
  cardId: z.uuid(),
  question: cardText,
  answer: cardText,
  sheet: sheetInputSchema.optional(),
  meaningChanged: z.boolean().optional(),
  // Fase 16: el tipo de actividad (nulo para volver a la tarjeta de siempre), el ejemplo y el modo.
  activity: activitySchema.nullable().optional(),
  example: sheetLine.optional(),
  mode: activityModeSchema.optional(),
  // Fase 17: la edición viene de «Mejorar la tarjeta» («Reformular» o «Agregar una pista»).
  improve: z.enum(['rephrase', 'hint']).optional(),
});

export const cardIdRequest = z.strictObject({ cardId: z.uuid() });

// «Deshacer» el repaso recién hecho (Fase 09, CA-063): el mismo intento que se mandó a
// «cards.review».
export const cardsUndoReviewRequest = z.strictObject({ cardId: z.uuid(), attemptId: z.uuid() });

// «¿Por qué hoy?» (Fase 09, CA-065): una tarjeta nueva, o los días desde el último repaso, cómo
// salió (nulo si viene de una agenda heredada sin detalle) y la probabilidad dicha como «unos N de
// cada 10». `general`: «Estimación general (sin datos tuyos)», con menos de 5 intentos.
export const cardsWhyTodayResponse = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('new'), general: z.literal(true) }),
  // El último repaso tiene un día posterior a hoy: la fecha volvió atrás.
  z.strictObject({ kind: z.literal('ahead'), general: z.boolean() }),
  z.strictObject({
    kind: z.literal('seen'),
    daysSince: z.number().int().nonnegative(),
    lastResult: gradeSchema.nullable(),
    outOfTen: z.number().int().min(0).max(10),
    general: z.boolean(),
  }),
]);
export type CardWhyToday = z.output<typeof cardsWhyTodayResponse>;

export const cardsPauseRequest = z.strictObject({ cardId: z.uuid(), paused: z.boolean() });
export const cardsInverseResponse = z.strictObject({ card: cardSchema, created: z.boolean() });

// «Eliminar»: la tarjeta va a la Papelera por 30 días.
export const cardsDeleteResponse = z.strictObject({ trashEntryId: z.uuid() });

// Un renglón del historial: el día de estudio y el resultado que vale. «adopted» son los
// repasos de antes de que existiera el historial (bases de la Fase 03), sin detalle; «reset» es
// el momento en que cambió lo que hay que recordar y la tarjeta volvió a programarse como nueva.
// Desde la Fase 09: `annulled`, el repaso se deshizo («Anulado»); `skipped`, quedó anotado sin
// cambiar la fecha porque ya había otro ese día (`sameDay`) o porque tiene un día anterior al
// último que contó (`earlier`: la fecha volvió atrás).
export const cardHistorySchema = z.strictObject({
  question: z.string(),
  entries: z.array(
    z.strictObject({
      id: z.uuid(),
      day,
      result: z.enum(['again', 'hard', 'good', 'adopted', 'reset', 'postponed']),
      // Si es un aplazamiento (Fase 11), el día para el que quedó; sin resultado ni calificación.
      plannedDay: day.nullable(),
      annulled: z.boolean(),
      skipped: z.enum(['sameDay', 'earlier']).nullable(),
      // De dónde vino el repaso (Fase 15): «anki» si se importó de Anki; nulo si lo hiciste en Retenia.
      origin: z.enum(['anki']).nullable(),
      // Fase 16: si llegó al motor (un reintento o un segundo intento del mismo día no llegan) y si
      // el intento quedó afectado («La pregunta era ambigua», «La referencia es incorrecta»).
      counted: z.boolean(),
      affected: z.boolean(),
      // Fase 16: en un ejercicio, la calificación vigente (nula sin evaluar), todas sus versiones de
      // la más vieja a la más nueva (las anteriores se muestran tachadas), por qué existe cada una y
      // la ayuda más alta que usó.
      evaluation: z
        .strictObject({
          activity: activityTypeSchema,
          current: verdictSchema.nullable(),
          versions: z.array(verdictSchema),
          causes: z.array(z.string()),
          helpLevel: z.enum(['A0', 'A1', 'A2', 'A3', 'A4']),
        })
        .nullable(),
    }),
  ),
});
export type CardHistory = z.output<typeof cardHistorySchema>;

// «Sumar a mis repasos» (Fase 11): cuánto suman al repaso las tarjetas que se agregan, antes de
// confirmar, y qué tarjetas se agregan.
const MAX_ACTIVATION = 500;
export const cardsActivationCostRequest = z.strictObject({
  count: z.number().int().min(1).max(MAX_ACTIVATION),
});
export const cardsActivationCostResponse = z.strictObject({
  lowMinutes: z.number().int().positive(),
  highMinutes: z.number().int().positive(),
});
export type ActivationCost = z.output<typeof cardsActivationCostResponse>;
export const cardsActivateRequest = z.strictObject({
  batchId: z.uuid(),
  cardIds: z.array(z.uuid()).min(1).max(MAX_ACTIVATION),
});
export const cardsActivateResponse = z.strictObject({ activated: z.number().int().nonnegative() });
