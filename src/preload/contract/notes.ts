import { z } from 'zod';

// Canales de notas, renglones (bloques), imágenes y enlaces (H-10). Los esquemas los comparten la
// ventana (que arma y lee el editor con las mismas formas), el puente y el proceso principal.

// El guardado automático: a los dos segundos de dejar de escribir (CA-043).
export const AUTOSAVE_MS = 2000;

export const MAX_TITLE_LENGTH = 300;
export const MAX_BLOCK_TEXT_LENGTH = 200_000;
export const MAX_BLOCKS = 20_000;
export const MAX_INLINE_NODES = 5000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 20_000;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

// Lo que lleva un renglón por dentro: texto (las fórmulas entre signos $ son texto común: se ven
// como en un libro, pero el texto original sigue ahí), un enlace a otra nota por su identificador
// (el nombre se vuelve a leer cada vez, así renombrar la nota no rompe el enlace) o una imagen por
// su huella.
const textNode = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1).max(MAX_BLOCK_TEXT_LENGTH),
});
const mentionNode = z.strictObject({
  type: z.literal('mention'),
  id: z.uuid(),
  label: z.string().max(MAX_TITLE_LENGTH),
});
const imageNode = z.strictObject({
  type: z.literal('image'),
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().min(1).max(MAX_IMAGE_SIDE),
  height: z.number().int().min(1).max(MAX_IMAGE_SIDE),
  alt: z.string().max(MAX_TITLE_LENGTH),
});
export const inlineNodeSchema = z.discriminatedUnion('type', [textNode, mentionNode, imageNode]);
export type InlineNode = z.output<typeof inlineNodeSchema>;

// Un renglón. La lista de renglones va en orden de lectura: un renglón siempre aparece después de
// su padre, y los hijos de un padre quedan en el orden en que aparecen.
export const blockSchema = z.strictObject({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  // Plegado: sus hijos no se ven (CA-042: «se pueden arrastrar y plegar»).
  collapsed: z.boolean(),
  content: z.array(inlineNodeSchema).max(MAX_INLINE_NODES),
});
export type Block = z.output<typeof blockSchema>;

// Los renglones son únicos y cada padre existe y aparece antes que sus hijos.
export function outlineIssue(
  blocks: readonly { id: string; parentId: string | null }[],
): string | null {
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.id)) {
      return 'renglón repetido';
    }
    if (block.parentId !== null && !seen.has(block.parentId)) {
      return 'renglón sin su padre';
    }
    seen.add(block.id);
  }
  return null;
}

const blocksSchema = z
  .array(blockSchema)
  .min(1)
  .max(MAX_BLOCKS)
  .superRefine((blocks, context) => {
    const issue = outlineIssue(blocks);
    if (issue !== null) {
      context.addIssue({ code: 'custom', message: issue });
    }
  });

export const noteSummarySchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  // Sin tema es nulo; también lo es una nota cuyo tema está en la Papelera.
  topicId: z.uuid().nullable(),
  // Vacío mientras no tiene título: la ventana la muestra como «Sin título».
  title: z.string(),
  archived: z.boolean(),
});
export type NoteSummary = z.output<typeof noteSummarySchema>;

// `notes.get` y `notes.create` devuelven una nota entera; los enlaces traen siempre el nombre
// vigente de la nota enlazada (CA-376).
export const noteSchema = z.strictObject({
  ...noteSummarySchema.shape,
  blocks: z.array(blockSchema),
});
export type Note = z.output<typeof noteSchema>;

export const notesListRequest = z.strictObject({ subjectId: z.uuid() });
// Las que están en la lista y las archivadas (con su marca); las de la Papelera no.
export const notesListResponse = z.strictObject({ notes: z.array(noteSummarySchema) });

// Una nota nueva nace con un renglón vacío, sin título, en el tema que se elija (o sin tema).
export const notesCreateRequest = z.strictObject({
  subjectId: z.uuid(),
  topicId: z.uuid().nullable(),
});

export const noteIdRequest = z.strictObject({ noteId: z.uuid() });

export const notesSaveRequest = z.strictObject({
  noteId: z.uuid(),
  title: z.string().max(MAX_TITLE_LENGTH),
  blocks: blocksSchema,
});
export const notesSaveResponse = z.strictObject({});

// «Mover a…» un tema, o a «Sin tema» con nulo.
export const notesMoveRequest = z.strictObject({
  noteId: z.uuid(),
  topicId: z.uuid().nullable(),
});

// «Eliminar»: la nota va a la Papelera por 30 días.
export const notesDeleteResponse = z.strictObject({ trashEntryId: z.uuid() });

// «[[» y las primeras letras: las notas que se pueden enlazar.
export const notesTitlesRequest = z.strictObject({ query: z.string().max(MAX_TITLE_LENGTH) });
export const notesTitlesResponse = z.strictObject({
  notes: z.array(
    z.strictObject({
      id: z.uuid(),
      title: z.string(),
      // El tema de la nota, para distinguir dos con el mismo nombre.
      topicName: z.string().nullable(),
    }),
  ),
});

// «Mencionada en»: cada renglón que enlaza a la nota, con el nombre de su nota de origen
// (CA-375). Un clic lleva a ese renglón.
export const notesMentionsResponse = z.strictObject({
  mentions: z.array(
    z.strictObject({
      noteId: z.uuid(),
      noteTitle: z.string(),
      blockId: z.uuid(),
      excerpt: z.string(),
    }),
  ),
});

// Imágenes (CA-372): el archivo vive en la carpeta de datos, por su huella SHA-256.
export const imagesSaveRequest = z.strictObject({
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES),
  mime: z.enum(IMAGE_TYPES),
  width: z.number().int().min(1).max(MAX_IMAGE_SIDE),
  height: z.number().int().min(1).max(MAX_IMAGE_SIDE),
});
export const imagesSaveResponse = z.strictObject({ sha: z.string().regex(/^[0-9a-f]{64}$/) });
export const imagesReadRequest = z.strictObject({ sha: z.string().regex(/^[0-9a-f]{64}$/) });
export const imagesReadResponse = z.strictObject({
  mime: z.enum(IMAGE_TYPES),
  bytes: z.instanceof(Uint8Array),
});
