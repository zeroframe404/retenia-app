import { z } from 'zod';

// Los mensajes entre el proceso principal y los procesos de trabajo, validados de los dos lados
// con Zod (docs/arquitectura.md, sección 1). El principal manda { id, kind, … } y el proceso
// contesta { id, ok: true, result } o { id, ok: false, problem }.

const folder = z.string().min(1).max(1000);

export const voiceTask = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('speak'),
    modelsDir: folder,
    text: z.string().trim().min(1).max(500),
    voice: z.number().int().min(0).max(3),
  }),
  z.strictObject({
    kind: z.literal('transcribe'),
    modelsDir: folder,
    samples: z.instanceof(Float32Array),
    sampleRate: z.number().int().min(8000).max(48000),
  }),
]);

// La cadena de los materiales (Fase 13): las piezas que viajan entre etapas.
const format = z.enum(['pdf', 'docx', 'md', 'text', 'web']);
const boxSchema = z.strictObject({
  page: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
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
const draftSchema = z.strictObject({
  type: blockType,
  level: z.number().int().nonnegative(),
  unit: z.number().int().positive(),
  lines: z.array(z.strictObject({ text: z.string(), box: boxSchema.nullable() })),
  markup: z.literal('md').optional(),
});
const pdfExtractSchema = z.strictObject({
  page: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  items: z.array(
    z.strictObject({
      text: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      size: z.number(),
      bold: z.boolean(),
      fontFamily: z.string(),
      fontName: z.string(),
    }),
  ),
  images: z.array(
    z.strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  ),
  // Fase 14: la página salió de un reconocimiento (tesseract.js) y con qué confianza (0 a 100).
  ocr: z.strictObject({ confidence: z.number() }).optional(),
});
const outlineSchema = z.array(
  z.strictObject({
    title: z.string(),
    page: z.number().int().positive().nullable(),
    level: z.number().int().positive(),
  }),
);

export const materialsTask = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('readPdfPage'),
    file: folder,
    page: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('ocrPdfPage'),
    file: folder,
    page: z.number().int().positive(),
    workDir: folder,
  }),
  // Validar: abrir el original y fijar sus unidades.
  z.strictObject({
    kind: z.literal('validate'),
    format,
    file: folder,
    // El nombre decía Word (para elegir el mensaje si adentro no hay un documento).
    declaredWord: z.boolean(),
  }),
  // Extraer una unidad: una página de un PDF, o el documento entero.
  z.strictObject({
    kind: z.literal('extract'),
    format,
    file: folder,
    unit: z.number().int().positive(),
    // Fase 14: reconocer el escaneo en lugar de leer la capa de texto (con la carpeta de trabajo
    // donde tesseract.js deja los datos de idioma).
    ocr: z.boolean().optional(),
    workDir: folder.optional(),
  }),
  // La estructura: de lo extraído, los bloques con su tipo.
  z.strictObject({
    kind: z.literal('structure'),
    format,
    pages: z.array(pdfExtractSchema),
    drafts: z.array(draftSchema),
    outline: outlineSchema,
  }),
  // La normalización reversible.
  z.strictObject({ kind: z.literal('normalize'), drafts: z.array(draftSchema) }),
]);
export type MaterialsTask = z.input<typeof materialsTask>;

export const validateResult = z.union([
  z.strictObject({
    units: z.array(
      z.strictObject({
        unit: z.number().int().positive(),
        width: z.number().positive().nullable(),
        height: z.number().positive().nullable(),
      }),
    ),
    outline: outlineSchema,
  }),
  z.strictObject({
    unreadable: z.enum([
      'pdfUnreadable',
      'wordUnreadable',
      'textUnreadable',
      'unsupported',
      'tooLarge',
    ]),
  }),
]);
export const extractResult = z.union([
  z.strictObject({ format: z.literal('pdf'), page: pdfExtractSchema, tool: z.unknown() }),
  z.strictObject({
    format: z.enum(['docx', 'md', 'text']),
    drafts: z.array(draftSchema),
    tool: z.unknown(),
  }),
  // Una página web: sus bloques y la instantánea saneada (o que no tiene texto que guardar).
  z.strictObject({
    format: z.literal('web'),
    drafts: z.array(draftSchema),
    snapshot: z.strictObject({ title: z.string(), html: z.string() }),
    tool: z.unknown(),
  }),
  z.strictObject({ format: z.literal('web'), unreadable: z.literal('webEmpty') }),
]);
export const structureResult = z.strictObject({ drafts: z.array(draftSchema) });
export const normalizeResult = z.strictObject({
  blocks: z.array(
    z.strictObject({
      type: blockType,
      level: z.number().int().nonnegative(),
      unit: z.number().int().positive(),
      raw: z.string(),
      normalized: z.string(),
      transformations: z.array(
        z.strictObject({
          kind: z.enum(['nfc', 'hyphen', 'linebreak', 'join', 'markup']),
          raw: z.tuple([z.number().int(), z.number().int()]),
          norm: z.tuple([z.number().int(), z.number().int()]),
          original: z.string(),
        }),
      ),
      lines: z.array(
        z.strictObject({
          text: z.string(),
          box: boxSchema.nullable(),
          norm: z.tuple([z.number().int(), z.number().int()]),
        }),
      ),
      parent: z.number().int().nonnegative().nullable(),
      headingPath: z.array(z.string()),
    }),
  ),
});

// Las herramientas de cada etapa y su versión: entran en la clave de cada resultado (cambiar una
// versión hace que esa etapa se vuelva a correr).
export const TOOLS = {
  pdf: { tool: 'pdfjs-dist', toolVersion: '6.4.299' },
  docx: { tool: 'mammoth', toolVersion: '1.13.0' },
  md: { tool: 'retenia-markdown', toolVersion: '1' },
  text: { tool: 'retenia-texto', toolVersion: '1' },
  web: {
    tool: 'retenia-web',
    toolVersion: 'readability-0.6.0+dompurify-3.4.17+jsdom-30.1.2+1',
  },
  ocr: { tool: 'tesseract.js', toolVersion: '7.0.0' },
  structure: { tool: 'retenia-estructura', toolVersion: '1' },
  normalize: { tool: 'retenia-normalizacion', toolVersion: '1' },
} as const;

// Lo que devuelve cada tarea: el principal lo valida antes de usarlo.
export const speakResult = z.strictObject({
  wav: z.instanceof(Uint8Array),
  seconds: z.number().nonnegative(),
});
export const textResult = z.strictObject({ text: z.string() });
export const pdfPageResult = z.strictObject({
  pageCount: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  items: z.array(
    z.strictObject({
      text: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
});

// Lo que puede salir mal en un proceso de trabajo, además de su respuesta.
const workerProblem = z.enum(['noModels', 'failed', 'timeout', 'crashed', 'memory']);
export type WorkerProblemName = z.infer<typeof workerProblem>;

export const workerResponse = z.union([
  z.strictObject({ id: z.number().int(), ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ id: z.number().int(), ok: z.literal(false), problem: workerProblem }),
]);

// Separa el número de pedido de la tarea.
export function splitRequest(raw: unknown): { id: number; task: unknown } {
  if (raw === null || typeof raw !== 'object' || !('id' in raw)) {
    return { id: -1, task: raw };
  }
  const { id, ...task } = raw as { id: unknown };
  return { id: typeof id === 'number' ? id : -1, task };
}
