import { z } from 'zod';
import { day } from './common';

// Canales de la Papelera (H-06).

const trashItemSchema = z.strictObject({
  id: z.uuid(),
  cardId: z.uuid(),
  question: z.string(),
  // Cuándo se eliminó y cuándo se elimina para siempre (fechas de calendario).
  deletedDay: day,
  expiresDay: day,
});

export const trashListResponse = z.strictObject({ items: z.array(trashItemSchema) });
export const trashRestoreRequest = z.strictObject({ entryId: z.uuid() });
export const trashRestoreResponse = z.strictObject({ restored: z.boolean() });
export const trashEmptyResponse = z.strictObject({ purged: z.number().int().nonnegative() });
export type TrashItem = z.output<typeof trashItemSchema>;
