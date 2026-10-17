import { z } from 'zod';
import { day, time } from './common';

// Canales de Ajustes › «Datos y copias» (H-04, H-05). La ventana nunca manda una ruta: una copia
// se pide por su identificador y el principal sabe dónde está.

const sizeBytes = z.number().int().nonnegative();

const backupSchema = z.discriminatedUnion('readable', [
  z.strictObject({
    readable: z.literal(true),
    id: z.uuid(),
    kind: z.enum(['auto', 'manual', 'before_restore']),
    day,
    time,
    sizeBytes,
  }),
  // Un archivo de la carpeta de copias que no se pudo abrir: se ve, pero no se puede restaurar.
  z.strictObject({ readable: z.literal(false), sizeBytes }),
]);
export type Backup = z.output<typeof backupSchema>;

export const backupsListResponse = z.strictObject({ backups: z.array(backupSchema) });
export const backupsCreateResponse = z.strictObject({
  created: backupSchema,
  backups: z.array(backupSchema),
});
export const backupsRestoreRequest = z.strictObject({ backupId: z.uuid() });
export const backupsRestoreResponse = z.strictObject({
  restoredFrom: z.strictObject({ day, time }),
  backups: z.array(backupSchema),
});

const differenceSchema = z.strictObject({
  cardId: z.uuid(),
  // La pregunta de la tarjeta; nada si la agenda guardada es de una tarjeta que no existe.
  question: z.string().nullable(),
  kind: z.enum(['due', 'memory', 'missing', 'extra']),
  storedDay: day.nullable(),
  expectedDay: day.nullable(),
});

export const differencesResponse = z.strictObject({ differences: z.array(differenceSchema) });
export const openFolderResponse = z.strictObject({});
export type DataDifference = z.output<typeof differenceSchema>;
