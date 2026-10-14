import { z } from 'zod';

// Canales de tarjetas. Los esquemas los comparten la ventana (que valida el formulario con
// los mismos), el puente y el proceso principal (que valida todo lo que llega).

// El tope es generoso a propósito: se pueden pegar varias páginas. Más que eso no es una tarjeta.
export const MAX_CARD_TEXT_LENGTH = 100_000;

// Se guarda sin los espacios y saltos de los bordes; lo que queda vacío no vale.
const cardText = z.string().trim().min(1).max(MAX_CARD_TEXT_LENGTH);

const studyDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const gradeSchema = z.enum(['again', 'hard', 'good']);

export const cardSchema = z.strictObject({
  id: z.uuid(),
  question: z.string(),
  answer: z.string(),
  // El día de estudio del próximo repaso; nulo mientras la tarjeta no se repasó.
  nextReviewDay: studyDay.nullable(),
});
export type Card = z.output<typeof cardSchema>;

export const cardsCreateRequest = z.strictObject({ question: cardText, answer: cardText });

export const cardsListRequest = z.strictObject({});
export const cardsListResponse = z.strictObject({ cards: z.array(cardSchema) });

// `attemptId` lo genera la ventana al abrir el repaso: si el mismo repaso llega dos veces (un
// doble toque, un reintento), queda una sola vez en el historial.
export const cardsReviewRequest = z.strictObject({
  cardId: z.uuid(),
  grade: gradeSchema,
  attemptId: z.uuid(),
});

export const cardsEditRequest = z.strictObject({
  cardId: z.uuid(),
  question: cardText,
  answer: cardText,
});

export const cardIdRequest = z.strictObject({ cardId: z.uuid() });

// Un renglón del historial: el día de estudio y el resultado que vale. «adopted» son los
// repasos de antes de que existiera el historial (bases de la Fase 03), sin detalle.
export const cardHistorySchema = z.strictObject({
  question: z.string(),
  entries: z.array(
    z.strictObject({
      id: z.uuid(),
      day: studyDay,
      result: z.enum(['again', 'hard', 'good', 'adopted']),
    }),
  ),
});
export type CardHistory = z.output<typeof cardHistorySchema>;
