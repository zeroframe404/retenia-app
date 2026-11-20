import { z } from 'zod';

// El paquete importado (H-29): lo que el proceso aislado leyó de un mazo de Anki o de una
// exportación de RemNote, ya traducido a la forma de Retenia y sin nada escrito todavía. El principal
// lo vuelve a validar con este esquema antes de usarlo, porque viene de un archivo ajeno: es dato,
// nunca instrucción.

const IMPORT_KINDS = ['anki', 'remnote'] as const;

// Por qué no entró algo (se muestra en palabras, en tono neutro).
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

// Lo que entró, pero distinto de como venía (se anota).
const ANNOTATIONS = ['plainText', 'latex', 'unknownLink'] as const;

// Los topes: lo que pasa de acá se rechaza con su motivo.
export const MAX_TEXT = 200_000;
const MAX_TITLE = 300;
const MAX_NODES = 5000;
const MAX_ITEMS = 200_000;
const SHA = z.string().regex(/^[0-9a-f]{64}$/);
const GRADES = ['again', 'hard', 'good'] as const;

const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string().min(1).max(MAX_TEXT) }),
  z.strictObject({
    type: z.literal('image'),
    sha: SHA,
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000),
    alt: z.string().max(MAX_TITLE),
  }),
  z.strictObject({ type: z.literal('cloze'), text: z.string().min(1).max(MAX_TEXT) }),
  // Un enlace a otra nota del mismo paquete, por su clave (se vuelve enlace por identificador al
  // escribir).
  z.strictObject({
    type: z.literal('link'),
    target: z.string().min(1).max(2000),
    label: z.string().max(MAX_TITLE),
  }),
]);
type PackageNode = z.output<typeof nodeSchema>;
const contentSchema = z.array(nodeSchema).max(MAX_NODES);
export type PackageContent = PackageNode[];

const reviewSchema = z.strictObject({
  // La clave de idempotencia del repaso (de dónde salió: la tarjeta y su entrada del historial).
  key: z.string().min(1).max(500),
  at: z.iso.datetime(),
  grade: z.enum(GRADES),
});
export type PackageReview = z.output<typeof reviewSchema>;

const cardSchema = z.strictObject({
  // La huella del origen: con ella se reconoce lo que ya se importó (CA-124).
  key: z.string().min(1).max(500),
  topic: z.string().min(1).max(MAX_TITLE).nullable(),
  kind: z.enum(['qa', 'cloze']),
  question: contentSchema,
  answer: contentSchema,
  createdAt: z.iso.datetime(),
  reviews: z.array(reviewSchema).max(MAX_ITEMS),
  suspended: z.boolean(),
  tags: z.array(z.string().max(MAX_TITLE)).max(200),
  audio: z.array(SHA).max(50),
});
export type PackageCard = z.output<typeof cardSchema>;

const blockSchema = z.strictObject({
  key: z.string().min(1).max(100),
  parentKey: z.string().min(1).max(100).nullable(),
  content: contentSchema,
  // «::» y «<>» de RemNote: además de la tarjeta del renglón, su inversa.
  inverse: z.boolean(),
});
export type PackageBlock = z.output<typeof blockSchema>;

const noteSchema = z.strictObject({
  key: z.string().min(1).max(2000),
  title: z.string().max(MAX_TITLE),
  topic: z.string().min(1).max(MAX_TITLE).nullable(),
  blocks: z.array(blockSchema).max(20_000),
});
export type PackageNote = z.output<typeof noteSchema>;

const mediaSchema = z.strictObject({
  sha: SHA,
  name: z.string().min(1).max(500),
  mime: z.string().min(1).max(100),
  bytes: z.number().int().min(0),
  kind: z.enum(['image', 'audio']),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
});
export type PackageMedia = z.output<typeof mediaSchema>;

const rejectedSchema = z.strictObject({
  what: z.string().max(1000),
  reason: z.enum(REJECT_REASONS),
});
export type RejectedItem = z.output<typeof rejectedSchema>;

const annotatedSchema = z.strictObject({
  what: z.string().max(1000),
  note: z.enum(ANNOTATIONS),
});
export type AnnotatedItem = z.output<typeof annotatedSchema>;

export const importPackageSchema = z.strictObject({
  kind: z.enum(IMPORT_KINDS),
  cards: z.array(cardSchema).max(MAX_ITEMS),
  notes: z.array(noteSchema).max(MAX_ITEMS),
  media: z.array(mediaSchema).max(MAX_ITEMS),
  rejected: z.array(rejectedSchema).max(MAX_ITEMS),
  annotated: z.array(annotatedSchema).max(MAX_ITEMS),
  // De qué tarjeta o nota es cada rechazo y cada anotación (su clave; vacía si es del archivo entero):
  // lo de algo que ya estaba no se cuenta otra vez.
  rejectedBy: z.array(z.string().max(2000)).max(MAX_ITEMS),
  annotatedBy: z.array(z.string().max(2000)).max(MAX_ITEMS),
  // Entradas del historial que no son repasos (reprogramaciones a mano): se saltean.
  skippedReviews: z.number().int().min(0),
});
export type ImportPackage = z.output<typeof importPackageSchema>;

// Un texto corto para nombrar algo en la lista de rechazadas.
export function excerpt(text: string, length = 80): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

// El nombre de un archivo sin su carpeta.
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
