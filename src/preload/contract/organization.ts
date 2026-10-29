import { z } from 'zod';
import { day, noRequest } from './common';

// Canales de materias, temas y Bandeja (H-09 y H-11). Los esquemas los comparten la ventana, el
// puente y el proceso principal.

export const MAX_NAME_LENGTH = 120;
export const MAX_INBOX_LENGTH = 1000;

// Se guarda sin los espacios de los bordes; lo que queda vacío no vale.
const name = z.string().trim().min(1).max(MAX_NAME_LENGTH);

// La lista cerrada de estados (es la misma que la de `core/organization`; una prueba comprueba
// que coinciden). Hay una sola materia activa.
export const subjectStatus = z.enum(['active', 'maintenance', 'paused', 'archived']);
export type SubjectStatus = z.output<typeof subjectStatus>;

export const subjectSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: subjectStatus,
  // La materia «Ejemplo»: lleva la etiqueta EJEMPLO y no suma progreso.
  isExample: z.boolean(),
});
export type Subject = z.output<typeof subjectSchema>;

export const subjectsListRequest = noRequest;
// La activa primero, después en mantenimiento, en pausa y archivadas; dentro de cada grupo, por
// orden de creación. Sin materias es la primera vez (CA-041).
export const subjectsListResponse = z.strictObject({ subjects: z.array(subjectSchema) });

// En la primera vez la materia nace activa; desde «Nueva materia» nace en mantenimiento y se
// activa con «Hacer activa» (CA-038).
export const subjectsCreateRequest = z.strictObject({
  name,
  makeActive: z.boolean().default(false),
});

export const subjectsActivateRequest = z.strictObject({ subjectId: z.uuid() });

// «Probar con un ejemplo (3 min)»: carga la materia «Ejemplo» (una sola vez) y la deja activa.
export const subjectsCreateExampleRequest = noRequest;

export const topicSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  name: z.string(),
  archived: z.boolean(),
  // «Otros nombres»: los que tuvo antes (CA-044).
  aliases: z.array(z.string()),
  // Las notas que no están archivadas ni en la Papelera.
  noteCount: z.number().int().nonnegative(),
});
export type Topic = z.output<typeof topicSchema>;

export const topicsListRequest = z.strictObject({ subjectId: z.uuid() });
export const topicsListResponse = z.strictObject({ topics: z.array(topicSchema) });
export const topicsCreateRequest = z.strictObject({ subjectId: z.uuid(), name });
export const topicsRenameRequest = z.strictObject({ topicId: z.uuid(), name });
export const topicIdRequest = z.strictObject({ topicId: z.uuid() });
// «Eliminar»: el tema va a la Papelera por 30 días.
export const topicsDeleteResponse = z.strictObject({ trashEntryId: z.uuid() });

export const inboxItemSchema = z.strictObject({
  id: z.uuid(),
  text: z.string(),
  // El día de Buenos Aires en que se anotó.
  day,
});
export type InboxItem = z.output<typeof inboxItemSchema>;

export const inboxListRequest = noRequest;
export const inboxListResponse = z.strictObject({
  items: z.array(inboxItemSchema),
  count: z.number().int().nonnegative(),
});

// Una línea, sin materia ni tema (CA-046).
export const inboxCaptureRequest = z.strictObject({
  text: z.string().trim().min(1).max(MAX_INBOX_LENGTH),
});
export const inboxCaptureResponse = z.strictObject({ count: z.number().int().nonnegative() });

// «Mover a…» un tema: el elemento se convierte en una nota de ese tema (CA-047).
export const inboxMoveRequest = z.strictObject({ itemId: z.uuid(), topicId: z.uuid() });
export const inboxIdRequest = z.strictObject({ itemId: z.uuid() });
export const inboxDeleteResponse = z.strictObject({ trashEntryId: z.uuid() });
