import { z } from 'zod';

// Los canales del buscador (Fase 12, H-23 y H-24).

// Lo más largo que se acepta escribir en el buscador.
export const MAX_SEARCH_LENGTH = 300;

const searchKind = z.enum(['note', 'block', 'card', 'topic', 'doubt', 'material', 'section']);

// Los cuatro grupos que ve la persona.
const searchGroup = z.enum(['notes', 'cards', 'materials', 'doubts']);

// Un tramo de texto; los que coinciden con lo buscado vienen marcados. La ventana los muestra como
// texto (nunca como código), así lo que haya escrito un apunte no puede cambiar la pantalla.
const segmentSchema = z.strictObject({ text: z.string().max(1000), match: z.boolean() });

const searchHitSchema = z.strictObject({
  // «card:<id>», «note:<id>»…: identifica el resultado para anotarlo como abierto.
  docId: z.string().max(64),
  kind: searchKind,
  // El grupo donde se muestra: apuntes, tarjetas, materiales o dudas.
  group: searchGroup,
  // La tarjeta, el tema, la nota o la duda; para un renglón, el renglón.
  entityId: z.uuid(),
  // Para un renglón, su nota.
  parentId: z.uuid().nullable(),
  subjectId: z.uuid().nullable(),
  subjectName: z.string().nullable(),
  topicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
  title: z.array(segmentSchema),
  fragment: z.array(segmentSchema),
  archived: z.boolean(),
});
export type SearchHit = z.output<typeof searchHitSchema>;

export const searchQueryRequest = z.strictObject({ text: z.string().max(MAX_SEARCH_LENGTH) });
// `recent`: sin texto, lo que se abrió hace poco.
export const searchQueryResponse = z.strictObject({
  results: z.array(searchHitSchema).max(100),
  recent: z.boolean(),
});
export type SearchResponse = z.output<typeof searchQueryResponse>;

export const searchOpenedRequest = z.strictObject({
  docId: z
    .string()
    .regex(
      /^(note|block|card|topic|doubt|material|section):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    ),
});
export const searchOpenedResponse = z.strictObject({});
export const searchRebuildResponse = z.strictObject({ documents: z.number().int().min(0) });
