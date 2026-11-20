import mammoth from 'mammoth';
import type { DocxNode } from '../core/materials/docx-tree';
import { inspectZip, ZipRejectedError } from './zip-guard';

// Un Word (.docx) por dentro, con mammoth (H-25, CA-107). Antes de dárselo, el comprimido se revisa
// entero (src/ingest/zip-guard.ts). mammoth recibe el contenido, nunca una ruta, y no abre las
// imágenes: de cada una queda solo su texto alternativo. Lo que devuelve es el árbol del documento
// pasado a datos simples, junto con los avisos del lector.

export const MAMMOTH_VERSION = '1.13.0';

export class WordUnreadableError extends Error {
  constructor(reason: string) {
    super(`No se pudo leer el Word: ${reason}`);
    this.name = 'WordUnreadableError';
  }
}

// ¿Es un Word que se puede leer? Revisa el comprimido y que tenga el documento adentro.
export async function checkDocx(buffer: Buffer): Promise<'ok' | 'notWord' | 'unreadable'> {
  try {
    const { entries } = await inspectZip(buffer);
    return entries.includes('word/document.xml') ? 'ok' : 'notWord';
  } catch (error) {
    if (error instanceof ZipRejectedError) {
      return 'unreadable';
    }
    throw error;
  }
}

const KEPT = ['type', 'value', 'styleId', 'styleName', 'altText'] as const;

// El árbol de mammoth tiene funciones (las imágenes saben leerse): se copian solo los datos.
function plain(node: unknown): DocxNode {
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of KEPT) {
    const value = source[key];
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  const numbering = source.numbering as { level?: unknown; isOrdered?: unknown } | null | undefined;
  if (numbering) {
    out.numbering = {
      level: String(numbering.level ?? '0'),
      isOrdered: numbering.isOrdered === true,
    };
  }
  if (Array.isArray(source.children)) {
    out.children = source.children.map(plain);
  }
  return out as unknown as DocxNode;
}

export async function readDocx(buffer: Buffer): Promise<{ tree: DocxNode; messages: string[] }> {
  if ((await checkDocx(buffer)) !== 'ok') {
    throw new WordUnreadableError('el comprimido no es un Word que se pueda abrir');
  }
  let captured: unknown = null;
  const result = await mammoth.convertToHtml({ buffer }, {
    transformDocument: (document: unknown) => {
      captured = document;
      return document;
    },
    // Las imágenes no se abren.
    convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
    externalFileAccess: false,
  } as Parameters<typeof mammoth.convertToHtml>[1]);
  if (captured === null) {
    throw new WordUnreadableError('el lector no devolvió el documento');
  }
  return {
    tree: plain(captured),
    messages: result.messages.map((message) => `${message.type}: ${message.message}`),
  };
}
