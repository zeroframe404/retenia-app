import { z } from 'zod';
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
export const sheetStateSchema = z.enum(SHEET_STATE_VALUES);
export type SheetStateValue = z.output<typeof sheetStateSchema>;
export const userSheetStateSchema = z.enum(['reviewed', 'verified', 'in_review', 'retired']);
export const formTypeSchema = z.enum(['exact', 'meaning']);
export const cardKindSchema = z.enum(['qa', 'cloze']);

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
  // El tema que se ve (nulo si no tiene o si está en la Papelera).
  topicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
});
export type Card = z.output<typeof cardSchema>;

// La ficha de una tarjeta completa. Todos los campos existen siempre (vacíos si no los cargaste).
export const sheetSchema = z.strictObject({
  referenceAnswer: z.string(),
  variants: z.array(z.string()),
  essentials: z.array(z.string()).max(MAX_ESSENTIALS),
  hints: z.array(z.string()).max(MAX_HINTS),
  explanation: z.string(),
  source: z.string(),
  formType: formTypeSchema,
  state: sheetStateSchema,
});
export type CardSheet = z.output<typeof sheetSchema>;

// Lo que mandás al guardar la ficha: solo lo que cambia.
export const sheetInputSchema = z.strictObject({
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
export const cardPathSchema = z.strictObject({
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
  hasHistory: z.boolean(),
});
export type CardDetail = z.output<typeof cardDetailSchema>;

export const cardsCreateRequest = z.strictObject({
  question: cardText,
  answer: cardText,
  subjectId: z.uuid().nullable().optional(),
  topicId: z.uuid().nullable().optional(),
});

// La lista de una materia con sus filtros (CA-056). `total` son las de la materia sin filtrar.
export const cardsListRequest = z.strictObject({
  subjectId: z.uuid().optional(),
  // Un tema, o «none» para las que no tienen.
  topicId: z.union([z.uuid(), z.literal('none')]).optional(),
  sheetState: sheetStateSchema.optional(),
  kind: cardKindSchema.optional(),
});
export const cardsListResponse = z.strictObject({
  cards: z.array(cardSchema),
  total: z.number().int().nonnegative(),
});

// `attemptId` lo genera la ventana al abrir el repaso: si el mismo repaso llega dos veces (un
// doble toque, un reintento), queda una sola vez en el historial.
export const cardsReviewRequest = z.strictObject({
  cardId: z.uuid(),
  grade: gradeSchema,
  attemptId: z.uuid(),
});

// `meaningChanged` es la respuesta a «¿Cambió lo que hay que recordar?»: hace falta cuando la
// tarjeta tiene historial y cambia su pregunta o su respuesta.
export const cardsEditRequest = z.strictObject({
  cardId: z.uuid(),
  question: cardText,
  answer: cardText,
  sheet: sheetInputSchema.optional(),
  meaningChanged: z.boolean().optional(),
});

export const cardIdRequest = z.strictObject({ cardId: z.uuid() });

export const cardsPauseRequest = z.strictObject({ cardId: z.uuid(), paused: z.boolean() });
export const cardsInverseResponse = z.strictObject({ card: cardSchema, created: z.boolean() });

// «Eliminar»: la tarjeta va a la Papelera por 30 días.
export const cardsDeleteResponse = z.strictObject({ trashEntryId: z.uuid() });

// Un renglón del historial: el día de estudio y el resultado que vale. «adopted» son los
// repasos de antes de que existiera el historial (bases de la Fase 03), sin detalle; «reset» es
// el momento en que cambió lo que hay que recordar y la tarjeta volvió a programarse como nueva.
export const cardHistorySchema = z.strictObject({
  question: z.string(),
  entries: z.array(
    z.strictObject({
      id: z.uuid(),
      day,
      result: z.enum(['again', 'hard', 'good', 'adopted', 'reset']),
    }),
  ),
});
export type CardHistory = z.output<typeof cardHistorySchema>;
