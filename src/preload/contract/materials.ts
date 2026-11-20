import { z } from 'zod';
import { day } from './common';

// Los canales de los materiales (Fase 13, H-25 y H-26). La ventana nunca manda rutas: los archivos
// soltados o elegidos llegan por el puente de archivos (src/preload/index.ts), que saca la ruta de
// cada archivo del disco con `webUtils.getPathForFile`. Ese canal («materials.addFiles») está
// aparte, en `fileChannels`: el `window.retenia` de la ventana no lo tiene.

// Lo más largo que se acepta pegar con «Pegar texto».
export const MAX_PASTED_TEXT = 200_000;
// Cuántos archivos se pueden soltar juntos.
export const MAX_FILES = 20;
const MAX_TITLE = 200;
const MAX_CARD_TEXT = 2000;

const count = z.number().int().nonnegative();
const materialKind = z.enum(['pdf', 'docx', 'md', 'text']);
const errorProblem = z.enum([
  'empty',
  'unsupported',
  'notPdf',
  'notWord',
  'tooLarge',
  'copyFailed',
  'pdfUnreadable',
  'wordUnreadable',
  'textUnreadable',
]);
export type MaterialProblem = z.output<typeof errorProblem>;

const materialState = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('received'), cancelled: z.literal(true).optional() }),
  z.strictObject({ kind: z.literal('processing'), read: count, total: count }),
  z.strictObject({ kind: z.literal('ready') }),
  z.strictObject({
    kind: z.literal('partial'),
    read: count,
    total: count,
    cancelled: z.literal(true).optional(),
  }),
  z.strictObject({ kind: z.literal('review') }),
  z.strictObject({ kind: z.literal('error'), problem: errorProblem }),
]);
export type MaterialStateView = z.output<typeof materialState>;

const stageStatus = z.enum(['done', 'current', 'pending']);
const stageSchema = z.union([
  z.strictObject({ id: z.enum(['saved', 'sections', 'ready']), status: stageStatus }),
  z.strictObject({
    id: z.literal('extracted'),
    status: stageStatus,
    withText: count,
    total: count,
  }),
  z.strictObject({ id: z.literal('extracted'), status: stageStatus, paragraphs: count }),
]);
export type StageItem = z.output<typeof stageSchema>;

export const materialSummarySchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  title: z.string(),
  // El nombre del archivo que agregaste (un dato: nunca una ruta).
  originalName: z.string(),
  kind: materialKind.nullable(),
  versionNo: z.number().int().positive(),
  previousMaterialId: z.uuid().nullable(),
  // El día de Buenos Aires en que se agregó.
  addedDay: day,
  state: materialState,
  stages: z.array(stageSchema).length(4),
});
export type MaterialSummary = z.output<typeof materialSummarySchema>;

const unitStatus = z.enum(['pending', 'ready', 'no_text', 'review']);

export const materialDetailSchema = z.strictObject({
  ...materialSummarySchema.shape,
  units: z.array(
    z.strictObject({ unit: z.number().int().positive(), status: unitStatus, chars: count }),
  ),
  sections: z.array(
    z.strictObject({
      blockId: z.uuid(),
      title: z.string(),
      level: z.number().int().positive(),
      unit: z.number().int().positive(),
    }),
  ),
});
export type MaterialDetail = z.output<typeof materialDetailSchema>;

// Una caja en la hoja de un PDF, en puntos, con el origen arriba a la izquierda.
const boxSchema = z.strictObject({
  page: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type MaterialBox = z.output<typeof boxSchema>;

const blockType = z.enum([
  'section',
  'title',
  'paragraph',
  'list',
  'table',
  'formula',
  'figure',
  'code',
  'header',
  'footer',
]);

const blockViewSchema = z.strictObject({
  id: z.uuid(),
  type: blockType,
  level: z.number().int().nonnegative(),
  unit: z.number().int().positive(),
  // El texto normalizado, tal como se lee. La ventana lo muestra como texto, nunca como código.
  text: z.string(),
  headingPath: z.array(z.string()),
  boxes: z.array(boxSchema),
  // Las tarjetas que citan este bloque.
  cited: z.array(z.strictObject({ cardId: z.uuid(), question: z.string() })),
});
export type MaterialBlockView = z.output<typeof blockViewSchema>;

export const materialPageSchema = z.strictObject({
  materialId: z.uuid(),
  title: z.string(),
  kind: materialKind,
  unit: z.number().int().positive(),
  unitCount: count,
  status: unitStatus,
  width: z.number().nullable(),
  height: z.number().nullable(),
  blocks: z.array(blockViewSchema),
});
export type MaterialPage = z.output<typeof materialPageSchema>;

const positionSchema = z.strictObject({ blockId: z.uuid(), offset: count });
const selectionSchema = z.strictObject({ from: positionSchema, to: positionSchema });
export type MaterialSelection = z.output<typeof selectionSchema>;

// Una ruta de Windows absoluta: con unidad («C:\…») o de red («\\equipo\…»).
const absolutePath = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/])/);

const addResultSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('added'), materialId: z.uuid() }),
  z.strictObject({
    outcome: z.literal('duplicate'),
    // La decisión pendiente: se contesta con `materials.decide`.
    pendingId: z.uuid(),
    existing: z.strictObject({ materialId: z.uuid(), name: z.string(), day }),
  }),
]);
export type AddResult = z.output<typeof addResultSchema>;

const titleInput = z.string().trim().max(MAX_TITLE).optional();

export const materialsAddFilesRequest = z.strictObject({
  paths: z.array(absolutePath).min(1).max(MAX_FILES),
  subjectId: z.uuid(),
  title: titleInput,
});
export const materialsAddFilesResponse = z.strictObject({ results: z.array(addResultSchema) });

export const materialsAddTextRequest = z.strictObject({
  subjectId: z.uuid(),
  text: z
    .string()
    .max(MAX_PASTED_TEXT)
    .refine((text) => text.trim() !== ''),
  title: titleInput,
});
export const materialsAddTextResponse = addResultSchema;

export const materialsDecideRequest = z.strictObject({
  pendingId: z.uuid(),
  decision: z.enum(['open', 'newVersion', 'addAnyway']),
});
export const materialIdResponse = z.strictObject({ materialId: z.uuid() });

export const materialsListRequest = z.strictObject({ subjectId: z.uuid() });
export const materialsListResponse = z.strictObject({ materials: z.array(materialSummarySchema) });

export const materialIdRequest = z.strictObject({ materialId: z.uuid() });
export const materialsDismissResponse = z.strictObject({});

export const materialsPageRequest = z.strictObject({
  materialId: z.uuid(),
  unit: z.number().int().positive().max(100_000),
});

// Abrir el original: en la página y con el pasaje de una tarjeta, de un bloque, o de un texto
// buscado.
export const materialsOpenRequest = z.strictObject({
  materialId: z.uuid(),
  cardId: z.uuid().optional(),
  blockId: z.uuid().optional(),
  unit: z.number().int().positive().max(100_000).optional(),
  text: z.string().max(300).optional(),
});
export const materialsOpenResponse = z.strictObject({
  materialId: z.uuid(),
  unit: z.number().int().positive(),
  blockId: z.uuid().nullable(),
  highlight: z.array(boxSchema),
  // La cita ya no se encuentra en el original: «Fuente a reubicar».
  notFound: z.boolean(),
});
export type MaterialOpen = z.output<typeof materialsOpenResponse>;

const cardText = z.string().trim().min(1).max(MAX_CARD_TEXT);

export const materialsCreateCardRequest = z.strictObject({
  materialId: z.uuid(),
  selection: selectionSchema,
  question: cardText,
  answer: cardText,
});
export const materialsCreateCardResponse = z.strictObject({ cardId: z.uuid() });

export const materialsExcerptRequest = z.strictObject({
  materialId: z.uuid(),
  selection: selectionSchema,
});
export const materialsExcerptResponse = z.strictObject({ count });

// El canal que solo usa el puente de archivos.
export const fileChannels = {
  'materials.addFiles': { request: materialsAddFilesRequest, response: materialsAddFilesResponse },
};
