import { z } from 'zod';
import { day, time } from './common';

// Canales de «Actividad reciente» y «Deshacer» (H-06).

const operationKind = z.enum([
  'card.create',
  'card.edit',
  'card.delete',
  'card.restore',
  'card.purge',
]);

const activityItemSchema = z.strictObject({
  id: z.uuid(),
  kind: operationKind,
  // Si este cambio deshizo otro, el tipo de ese otro.
  undoneKind: operationKind.nullable(),
  // La pregunta que dejó el cambio; nada si la tarjeta se eliminó para siempre.
  label: z.string().nullable(),
  day,
  time,
  canUndo: z.boolean(),
});

export const activityRecentResponse = z.strictObject({ items: z.array(activityItemSchema) });
export const activityUndoRequest = z.strictObject({ operationId: z.uuid() });
export const activityUndoResponse = z.strictObject({ undone: z.boolean() });
