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
export const MAX_CARD_TEXT = 2000;

const count = z.number().int().nonnegative();
const materialKind = z.enum(['pdf', 'docx', 'md', 'text', 'web']);
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
  'webBlocked',
  'webNotPage',
  'webEmpty',
  'webUnreachable',
]);

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
  z.strictObject({ kind: z.literal('pendingNetwork') }),
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
  // Una página web: su dirección (nula si vino de un archivo) y el día en que se guardó.
  sourceUrl: z.string().nullable(),
  snapshotDay: day.nullable(),
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
  // «Estudiar sin estas páginas» y de dónde salió el texto ('ocr' si se reconoció).
  excluded: z.boolean(),
  textSource: z.enum(['pdf', 'ocr']),
  // Si el material se está leyendo (o espera en la cola): una unidad sin leer de un material
  // cancelado no dice «Todavía estamos leyendo».
  working: z.boolean(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  blocks: z.array(blockViewSchema),
});
export type MaterialPage = z.output<typeof materialPageSchema>;

const positionSchema = z.strictObject({ blockId: z.uuid(), offset: count });
const selectionSchema = z.strictObject({ from: positionSchema, to: positionSchema });
export type MaterialSelection = z.output<typeof selectionSchema>;

// Una ruta de Windows absoluta: con unidad («C:\…») o de red («\\equipo\…»). Nunca de
// dispositivo («\\.\…» o «\\?\…»), que llegan a tuberías y a unidades sin pasar por una carpeta.
const absolutePath = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?:[a-zA-Z]:[\\/]|\\\\(?![.?][\\/])[^\\/]+[\\/])/);

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

const materialsAddFilesRequest = z.strictObject({
  paths: z.array(absolutePath).min(1).max(MAX_FILES),
  subjectId: z.uuid(),
  title: titleInput,
});
const materialsAddFilesResponse = z.strictObject({ results: z.array(addResultSchema) });

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

// Lo que se va a citar de una selección, tal como se va a guardar: la frase y su referencia.
export const materialsPreviewResponse = z.strictObject({
  quote: z.string(),
  reference: z.string(),
});

// --- Fase 14: escaneos, web y revisión ---

export const materialsAddUrlRequest = z.strictObject({
  subjectId: z.uuid(),
  address: z.string().trim().min(1).max(2048),
  title: titleInput,
});

export const materialsSnapshotResponse = z.strictObject({
  // El HTML saneado del contenido principal (un fragmento): la ventana lo muestra en un marco
  // sin permisos, nunca lo inserta en su propia página.
  html: z.string(),
  address: z.string().nullable(),
  savedDay: day,
});

const signalKind = z.enum([
  'lowCoverage',
  'anomalousChars',
  'possibleTable',
  'possibleFormula',
  'lowConfidence',
]);
export type SignalView = z.output<typeof signalKind>;

const diffSegment = z.strictObject({
  text: z.string(),
  changed: z.boolean(),
  kind: z.enum(['figure', 'sign', 'unit', 'text']).optional(),
});
export type DiffSegmentView = z.output<typeof diffSegment>;

const resolution = z.enum(['corrected', 'image', 'ignored', 'conflict']);

const problemSchema = z.strictObject({
  id: z.string(),
  unit: z.number().int().positive(),
  blockId: z.uuid().nullable(),
  signals: z.array(signalKind),
  // El comienzo del texto, para reconocerlo en la lista.
  excerpt: z.string(),
  // El texto de base (lo que leyó Retenia) y el que se muestra hoy (el tuyo, si lo corregiste).
  original: z.string(),
  current: z.string(),
  resolution: resolution.nullable(),
  correctionId: z.uuid().nullable(),
  actions: z.array(z.enum(['viewOriginal', 'correctText', 'markAsImage', 'ignore'])),
  conflict: z
    .strictObject({ mine: z.string(), current: z.string(), differences: z.array(diffSegment) })
    .nullable(),
});
export type ReviewProblem = z.output<typeof problemSchema>;

const notExtractedSchema = z.strictObject({
  unit: z.number().int().positive(),
  reason: z.enum(['none', 'sparse', 'pending', 'error']),
  // Se está reconociendo o leyendo ahora.
  working: z.boolean(),
  actions: z.array(z.enum(['recognize', 'studyWithout', 'reprocess'])),
});

const pageWord = z.enum(['ready', 'review', 'pending', 'error', 'excluded']);
const sectionState = z.enum(['ready', 'processing', 'problems', 'excluded']);

export const materialReviewSchema = z.strictObject({
  materialId: z.uuid(),
  title: z.string(),
  kind: materialKind,
  working: z.boolean(),
  stages: z.array(stageSchema).length(4),
  ready: z.strictObject({ units: z.array(z.number().int().positive()), sections: count }),
  problems: z.array(problemSchema),
  notExtracted: z.array(notExtractedSchema),
  excluded: z.array(z.number().int().positive()),
  coverage: z.strictObject({
    pages: z.array(z.strictObject({ unit: z.number().int().positive(), word: pageWord })),
    summary: z.strictObject({
      total: count,
      ready: count,
      review: count,
      pending: count,
      error: count,
      excluded: count,
    }),
    sections: z.array(
      z.strictObject({
        blockId: z.uuid(),
        title: z.string(),
        level: z.number().int().positive(),
        from: z.number().int().positive(),
        to: z.number().int().positive(),
        state: sectionState,
      }),
    ),
  }),
  firstSection: z.strictObject({ blockId: z.uuid(), title: z.string() }).nullable(),
});
export type MaterialReview = z.output<typeof materialReviewSchema>;

export const materialsUnitRequest = z.strictObject({
  materialId: z.uuid(),
  unit: z.number().int().positive().max(100_000),
});
export const materialsUnitResponse = z.strictObject({});

export const materialsExcludeRequest = z.strictObject({
  materialId: z.uuid(),
  units: z.array(z.number().int().positive().max(100_000)).min(1).max(1000),
  excluded: z.boolean(),
});

export const materialsResolveProblemRequest = z.strictObject({
  materialId: z.uuid(),
  problemId: z.string().min(1).max(200),
  resolution: z.enum(['image', 'ignored']).nullable(),
});

export const materialsCorrectTextRequest = z.strictObject({
  materialId: z.uuid(),
  blockId: z.uuid(),
  text: z.string().min(1).max(MAX_PASTED_TEXT),
});
export const materialsCorrectTextResponse = z.strictObject({
  correctionId: z.uuid(),
  // Las tarjetas que usan este texto: se pregunta si actualizarlas.
  cards: z.array(z.strictObject({ cardId: z.uuid(), question: z.string() })),
});

export const materialsUpdateDerivedRequest = z.strictObject({
  correctionId: z.uuid(),
  update: z.boolean(),
});
export const materialsUpdateDerivedResponse = z.strictObject({ updated: count });

export const materialsResolveConflictRequest = z.strictObject({
  correctionId: z.uuid(),
  keep: z.boolean(),
});

export const materialsSourceChangeRequest = z.strictObject({ cardId: z.uuid() });
export const materialsSourceChangeResponse = z.strictObject({ changed: z.boolean() });

// El canal que solo usa el puente de archivos.
export const fileChannels = {
  'materials.addFiles': { request: materialsAddFilesRequest, response: materialsAddFilesResponse },
};
