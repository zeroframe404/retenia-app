import { z } from 'zod';

// Canales de importar y exportar (H-29, H-30, Fase 15). Los archivos se eligen con el diálogo de
// Windows desde el proceso principal: la ventana nunca manda una ruta. La vista previa no escribe
// nada; recién «Importar» (o «Cargar») escribe, después de la copia «Antes de importar».

const REJECT_REASONS = [
  'missingImage',
  'missingAudio',
  'onlineImage',
  'unsupportedImage',
  'unsupportedCard',
  'emptyCard',
  'tooLarge',
  'unreadableDocument',
] as const;
const ANNOTATIONS = ['plainText', 'latex', 'unknownLink'] as const;
const MAX_ITEMS = 200_000;

const importKindSchema = z.enum(['anki', 'remnote']);
export type ImportKindValue = z.output<typeof importKindSchema>;

const rejectedSchema = z.strictObject({
  what: z.string().max(1000),
  reason: z.enum(REJECT_REASONS),
});
const annotatedSchema = z.strictObject({ what: z.string().max(1000), note: z.enum(ANNOTATIONS) });

const pairSchema = z.strictObject({
  fresh: z.number().int().min(0),
  existing: z.number().int().min(0),
});
const importCountsSchema = z.strictObject({
  cards: pairSchema,
  notes: pairSchema,
  reviews: z.number().int().min(0),
  withoutHistory: z.number().int().min(0),
  // Cuántas cosas no entran (con su motivo en la lista de rechazadas).
  rejected: z.number().int().min(0),
});

const importPreviewSchema = z.strictObject({
  previewId: z.uuid(),
  kind: importKindSchema,
  fileName: z.string().max(500),
  counts: importCountsSchema,
  rejected: z.array(rejectedSchema).max(MAX_ITEMS),
  annotated: z.array(annotatedSchema).max(MAX_ITEMS),
  // Si este mismo archivo ya se importó, cuándo (instante).
  importedBefore: z.iso.datetime().nullable(),
});
export type ImportPreview = z.output<typeof importPreviewSchema>;

// Por qué no hay vista previa: el archivo no es lo que dice, es de una versión más nueva, está
// dañado o tiene partes que no son seguras.
const importProblemSchema = z.enum(['notAnki', 'notRemnote', 'tooNew', 'damaged', 'unsafe']);
export type ImportProblem = z.output<typeof importProblemSchema>;

export const importsChooseRequest = z.strictObject({
  kind: importKindSchema,
  // RemNote: un comprimido o una carpeta.
  folder: z.boolean().optional(),
});
export const importsChooseResponse = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('cancelled') }),
  z.strictObject({ outcome: z.literal('preview'), preview: importPreviewSchema }),
  z.strictObject({ outcome: z.literal('problem'), problem: importProblemSchema }),
]);

const destinationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('subject'), subjectId: z.uuid() }),
  z.strictObject({ kind: z.literal('new'), name: z.string().trim().min(1).max(120) }),
]);

export const importsRunRequest = z.strictObject({
  previewId: z.uuid(),
  destination: destinationSchema,
});
export const importsRunResponse = z.strictObject({
  importId: z.uuid(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  counts: importCountsSchema,
  backupId: z.uuid(),
});
export type ImportResult = z.output<typeof importsRunResponse>;

export const importsCancelRequest = z.strictObject({ previewId: z.uuid() });

const importRecordSchema = z.strictObject({
  importId: z.uuid(),
  kind: importKindSchema,
  fileName: z.string(),
  at: z.iso.datetime(),
  subjectName: z.string(),
  counts: importCountsSchema,
  rejected: z.array(rejectedSchema).max(MAX_ITEMS),
  annotated: z.array(annotatedSchema).max(MAX_ITEMS),
});
export type ImportRecordView = z.output<typeof importRecordSchema>;
export const importsListResponse = z.strictObject({ imports: z.array(importRecordSchema) });

export const importsSaveRejectedRequest = z.strictObject({ importId: z.uuid() });
export const importsSaveRejectedResponse = z.strictObject({ saved: z.boolean() });

// --- Exportar todo e Importar exportación ---

const exportCountsSchema = z.strictObject({
  subjects: z.number().int().min(0),
  topics: z.number().int().min(0),
  notes: z.number().int().min(0),
  cards: z.number().int().min(0),
  reviews: z.number().int().min(0),
  materials: z.number().int().min(0),
  images: z.number().int().min(0),
  events: z.number().int().min(0),
});
export type ExportCountsView = z.output<typeof exportCountsSchema>;

export const exportsAllResponse = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('cancelled') }),
  z.strictObject({
    outcome: z.literal('exported'),
    fileName: z.string(),
    counts: exportCountsSchema,
  }),
]);

const exportProblemSchema = z.enum(['notEmpty', 'notExport', 'damaged', 'tooNew', 'unsafe']);
export type ExportProblem = z.output<typeof exportProblemSchema>;
export const exportsChooseResponse = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('cancelled') }),
  z.strictObject({
    outcome: z.literal('preview'),
    previewId: z.uuid(),
    counts: exportCountsSchema,
    exportedAt: z.iso.datetime(),
  }),
  z.strictObject({ outcome: z.literal('problem'), problem: exportProblemSchema }),
]);
export const exportsLoadRequest = z.strictObject({ previewId: z.uuid() });
export const exportsLoadResponse = z.strictObject({ counts: exportCountsSchema });
// Retenia está vacío: se puede cargar una exportación entera.
export const exportsCanLoadResponse = z.strictObject({ empty: z.boolean() });
