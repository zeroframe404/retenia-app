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

// Lo que no es tarjeta (Fase 07): notas, temas y elementos de la Bandeja. «Restaurar» y «Vaciar
// papelera» sirven para todo, con el mismo identificador de entrada.
const trashOrganizationItemSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['note', 'topic', 'inbox']),
  // El título de la nota (vacío si no tenía), el nombre del tema o el texto de la Bandeja.
  name: z.string(),
  deletedDay: day,
  expiresDay: day,
});
export const trashOrganizationResponse = z.strictObject({
  items: z.array(trashOrganizationItemSchema),
});
export type TrashOrganizationItem = z.output<typeof trashOrganizationItemSchema>;
export const trashRestoreRequest = z.strictObject({ entryId: z.uuid() });
export const trashRestoreResponse = z.strictObject({ restored: z.boolean() });
export const trashEmptyResponse = z.strictObject({ purged: z.number().int().nonnegative() });
export type TrashItem = z.output<typeof trashItemSchema>;
