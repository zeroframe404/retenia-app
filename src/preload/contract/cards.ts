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

export const cardsReviewRequest = z.strictObject({ cardId: z.uuid(), grade: gradeSchema });
