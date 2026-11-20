import { z } from 'zod';

// «Exportar todo» (H-30): cada nota como Markdown común, que se lee con el Bloc de notas y lo entiende
// otro programa. Arriba, un encabezado de datos (YAML entre «---»); después los renglones como lista,
// con una tabulación por nivel. Las tarjetas quedan como se escriben en Retenia («>>» y «{{…}}»), las
// fórmulas entre signos $ (CA-379), los enlaces como «[[Título]]{nota=<identificador>}» y las imágenes
// por su archivo dentro de la exportación.

export interface MarkdownNode {
  readonly type: 'text' | 'mention' | 'image' | 'cloze';
  readonly text?: string;
  readonly id?: string;
  readonly label?: string;
  readonly sha?: string;
  readonly alt?: string;
}

export interface MarkdownNote {
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly topic: string | null;
  readonly createdAt: string;
  readonly archived: boolean;
  readonly blocks: readonly {
    readonly id: string;
    readonly parentId: string | null;
    readonly position: number;
    readonly content: readonly MarkdownNode[];
  }[];
}

// Lo que no puede ir en un nombre de archivo de Windows, y los nombres reservados.
const FORBIDDEN = /[\\/:*?"<>|]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

export function safeFileName(name: string, fallback: string): string {
  const clean = name
    .replace(FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  if (clean === '' || RESERVED.test(clean)) {
    return fallback;
  }
  return clean;
}

const yamlValue = (value: string) =>
  /^[\p{L}\p{N} ._()«»¿?¡!,;-]*$/u.test(value) && !/^[\s-]/.test(value) && value !== ''
    ? value
    : JSON.stringify(value);

function inline(node: MarkdownNode, depth: number, extensionOf: (sha: string) => string): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'cloze':
      return `{{${node.text ?? ''}}}`;
    case 'mention':
      return `[[${node.label ?? ''}]]{nota=${node.id ?? ''}}`;
    case 'image':
      return `![${(node.alt ?? '').replace(/[[\]]/g, '')}](${'../'.repeat(depth)}imagenes/${node.sha ?? ''}.${extensionOf(node.sha ?? '')})`;
  }
}

// `depth`: cuántas carpetas hay entre el archivo de la nota y la raíz de la exportación.
export function noteMarkdown(
  note: MarkdownNote,
  { depth, extensionOf }: { depth: number; extensionOf: (sha: string) => string },
): string {
  const lines = [
    '---',
    `id: ${note.id}`,
    `materia: ${yamlValue(note.subject)}`,
    `tema: ${yamlValue(note.topic ?? 'Sin tema')}`,
    `titulo: ${yamlValue(note.title === '' ? 'Sin título' : note.title)}`,
    `creada: ${note.createdAt}`,
    ...(note.archived ? ['archivada: sí'] : []),
    '---',
  ];
  const children = new Map<string | null, MarkdownNote['blocks'][number][]>();
  for (const block of note.blocks) {
    const list = children.get(block.parentId) ?? [];
    list.push(block);
    children.set(block.parentId, list);
  }
  const visit = (parentId: string | null, level: number) => {
    const list = [...(children.get(parentId) ?? [])].sort((a, b) => a.position - b.position);
    for (const block of list) {
      const indent = '\t'.repeat(level);
      const text = block.content.map((node) => inline(node, depth, extensionOf)).join('');
      lines.push(`${indent}- ${text.replace(/\n/g, `\n${indent}  `)}`.trimEnd());
      visit(block.id, level + 1);
    }
  };
  visit(null, 0);
  return `${lines.join('\n')}\n`;
}

// --- El índice de la exportación (indice.json) ---

export const EXPORT_FORMAT = 'retenia-exportacion';
export const EXPORT_FORMAT_VERSION = 1;

export const exportCountsSchema = z.strictObject({
  subjects: z.number().int().min(0),
  topics: z.number().int().min(0),
  notes: z.number().int().min(0),
  cards: z.number().int().min(0),
  reviews: z.number().int().min(0),
  materials: z.number().int().min(0),
  images: z.number().int().min(0),
  events: z.number().int().min(0),
});
export type ExportCounts = z.output<typeof exportCountsSchema>;

export const exportFileSchema = z.strictObject({
  path: z.string().min(1).max(500),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().min(0),
  kind: z.enum(['data', 'note', 'original', 'image', 'attachment']),
});
export type ExportFile = z.output<typeof exportFileSchema>;

export const exportIndexSchema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.number().int().min(1),
  appVersion: z.string().max(100),
  exportedAt: z.iso.datetime(),
  migrations: z.array(z.string().regex(/^\d{4}_[a-z_]+$/)).max(1000),
  counts: exportCountsSchema,
  files: z.array(exportFileSchema).max(500_000),
});
export type ExportIndex = z.output<typeof exportIndexSchema>;
