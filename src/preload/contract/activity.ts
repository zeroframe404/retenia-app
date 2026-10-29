import { z } from 'zod';
import { day, time } from './common';

// Canales de «Actividad reciente» y «Deshacer» (H-06).

// Las tarjetas (Fase 04) y, desde la Fase 07, las materias, los temas, las notas y la Bandeja.
const operationKind = z.enum([
  'card.create',
  'card.edit',
  'card.delete',
  'card.restore',
  'card.purge',
  'subject.activate',
  'topic.create',
  'topic.rename',
  'topic.archive',
  'topic.unarchive',
  'topic.delete',
  'topic.restore',
  'topic.purge',
  'note.create',
  'note.move',
  'note.archive',
  'note.unarchive',
  'note.delete',
  'note.restore',
  'note.purge',
  'inbox.delete',
  'inbox.restore',
  'inbox.purge',
]);

const activityItemSchema = z.strictObject({
  id: z.uuid(),
  kind: operationKind,
  // Si este cambio deshizo otro, el tipo de ese otro.
  undoneKind: operationKind.nullable(),
  // La pregunta de la tarjeta, o el nombre de la nota, del tema, de la materia o el texto de la
  // Bandeja; nada si se eliminó para siempre. Una nota sin título viene como cadena vacía.
  label: z.string().nullable(),
  day,
  time,
  canUndo: z.boolean(),
});

export const activityRecentResponse = z.strictObject({ items: z.array(activityItemSchema) });
export const activityUndoRequest = z.strictObject({ operationId: z.uuid() });
export const activityUndoResponse = z.strictObject({ undone: z.boolean() });
export type ActivityItem = z.output<typeof activityItemSchema>;
