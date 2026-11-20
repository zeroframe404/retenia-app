import { tidyNodes } from './anki';
import { decodeEntities, htmlToPlain, removeDangerous } from './html';
import {
  type AnnotatedItem,
  baseName,
  excerpt,
  type ImportPackage,
  MAX_WHAT,
  type PackageBlock,
  type PackageContent,
  type PackageMedia,
  type PackageNote,
  type RejectedItem,
} from './package';

// El lector de la exportación en Markdown de RemNote (H-29). Cada documento (.md) es una nota; su
// carpeta, el tema. Cada viñeta o párrafo es un renglón, con su jerarquía. Las tarjetas escritas con
// la sintaxis de RemNote (ayuda de RemNote, «Creating Flashcards») se reconocen: «>>», «==» y «;;» de
// ida; «::», «<>» y «;<>» de ida y vuelta; «<<», «:<» y «;<» de vuelta; «{{…}}», huecos. Lo que no se
// puede interpretar entra como texto común y se anota. RemNote no exporta repasos.

export interface RemnoteDocument {
  // La ruta dentro de la exportación, con «/».
  path: string;
  text: string;
}

const TAB_WIDTH = 4;
const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const HEADING = /^[ \t]*#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/;
// Lo que RemNote escribe pero Retenia todavía no interpreta: varias líneas («>>>»), tarjetas
// apagadas («>>-»), opción múltiple («==A)», «/mcr»), detalle extra («/extra»).
const UNSUPPORTED = [
  />>>|::>|;;>/,
  /(>>|::|<>|<<|==|;;|:>|:<|;<)-(\s|$)/,
  /==\s*[A-Z]\)/,
  /\/(mcr|mcw|correct|incorrect|extra|ecd)\b/,
];

// Separadores de tarjeta, del más largo al más corto (así «;<>» no se lee como «<>»).
const SEPARATORS: { mark: string; direction: 'forward' | 'both' | 'backward' }[] = [
  { mark: ';<>', direction: 'both' },
  { mark: '::', direction: 'both' },
  { mark: '<>', direction: 'both' },
  { mark: '<<', direction: 'backward' },
  { mark: ':<', direction: 'backward' },
  { mark: ';<', direction: 'backward' },
  { mark: ':>', direction: 'forward' },
  { mark: '>>', direction: 'forward' },
  { mark: '==', direction: 'forward' },
  { mark: ';;', direction: 'forward' },
];

const indentOf = (space: string) =>
  [...space].reduce((width, char) => width + (char === '\t' ? TAB_WIDTH : 1), 0);

// Las partes que no se tocan al buscar marcas: fórmulas, huecos, enlaces e imágenes.
const PROTECTED = /\$[^$\n]+\$|\{\{[^{}]*\}\}|\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g;

function maskProtected(text: string): string {
  return text.replace(PROTECTED, (match) => '\u0000'.repeat(match.length));
}

// Dónde está el separador de tarjeta (fuera de las partes protegidas), si hay uno.
function findSeparator(text: string) {
  const masked = maskProtected(text);
  let best: { at: number; mark: string; direction: 'forward' | 'both' | 'backward' } | null = null;
  for (const separator of SEPARATORS) {
    const at = masked.indexOf(separator.mark);
    if (at !== -1 && (best === null || at < best.at)) {
      best = { at, ...separator };
    }
  }
  return best;
}

// Las marcas de negrita, cursiva, tachado y resaltado se van, y los escapes de Markdown se resuelven;
// las fórmulas quedan como estaban.
function plainMarkdown(text: string): string {
  return text
    .split(/(\$[^$\n]+\$)/)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      return part
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/(^|[\s(¿¡"«])[*_]([^*_\n]+)[*_](?=[\s).,;:!?"»]|$)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
        .replace(/\\([\\`*_{}[\]()#+\-.!>|<=:;])/g, '$1');
    })
    .join('');
}

interface Context {
  title: string;
  folder: string;
  media: ReadonlyMap<string, PackageMedia>;
  titles: ReadonlyMap<string, string>;
  rejected: RejectedItem[];
  annotated: AnnotatedItem[];
  used: Map<string, PackageMedia>;
}

// Resuelve «a/../b» dentro de la exportación; nulo si se sale de ella.
function normalizePath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function findMedia(context: Context, src: string): PackageMedia | undefined {
  let decoded = src;
  try {
    decoded = decodeURIComponent(src);
  } catch {
    // Queda como venía.
  }
  for (const candidate of [
    context.folder === '' ? decoded : `${context.folder}/${decoded}`,
    decoded,
  ]) {
    const path = normalizePath(candidate);
    const found = path === null ? undefined : context.media.get(path);
    if (found) {
      return found;
    }
  }
  // Por las dudas, una sola imagen con ese nombre en cualquier carpeta de la exportación.
  const name = baseName(decoded);
  const same = [...context.media.entries()].filter(([path]) => baseName(path) === name);
  return same.length === 1 ? same[0]?.[1] : undefined;
}

// Un pedazo de texto (sin marcas de tarjeta) como contenido: imágenes, enlaces, huecos y texto.
function inlineNodes(text: string, context: Context): PackageContent {
  const nodes: PackageContent = [];
  const token =
    /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|\[\[([^\]]+)\]\]|\{\{([^{}]*)\}\}/g;
  let last = 0;
  const pushText = (raw: string) => {
    const clean = plainMarkdown(raw);
    if (clean !== '') {
      nodes.push({ type: 'text', text: clean });
    }
  };
  for (const match of text.matchAll(token)) {
    pushText(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[2] !== undefined) {
      const src = match[2];
      const alt = plainMarkdown(match[1] ?? '').trim();
      if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) {
        context.rejected.push({
          what: `${context.title}: ${baseName(src.split('?')[0] ?? src)}`,
          reason: 'onlineImage',
        });
        continue;
      }
      const found = findMedia(context, src);
      if (!found) {
        context.rejected.push({
          what: `${context.title}: ${baseName(src)}`,
          reason: 'missingImage',
        });
      } else if (
        found.kind !== 'image' ||
        found.width === undefined ||
        found.height === undefined
      ) {
        context.rejected.push({
          what: `${context.title}: ${baseName(src)}`,
          reason: 'unsupportedImage',
        });
      } else {
        context.used.set(found.sha, found);
        nodes.push({
          type: 'image',
          sha: found.sha,
          width: found.width,
          height: found.height,
          alt: alt === '' ? found.name : alt,
        });
      }
    } else if (match[3] !== undefined) {
      const name = match[3].split('|')[0]?.trim() ?? '';
      const target = context.titles.get(name.toLocaleLowerCase('es')) ?? context.titles.get(name);
      if (target) {
        nodes.push({ type: 'link', target, label: baseName(name) });
      } else {
        nodes.push({ type: 'text', text: name });
        context.annotated.push({ what: name, note: 'unknownLink' });
      }
    } else {
      const inner = (match[4] ?? '').trim();
      if (inner === '') {
        pushText(match[0]);
      } else {
        nodes.push({ type: 'cloze', text: plainMarkdown(inner) });
      }
    }
  }
  pushText(text.slice(last));
  return tidyNodes(nodes);
}

// En Retenia todo renglón con «>>» o con «{{…}}» pide una tarjeta. Lo que entra como texto común
// lleva un separador invisible (U+2060, «unión de palabras») entre los dos signos: se ve igual y no
// pide ninguna tarjeta.
const WORD_JOINER = String.fromCharCode(0x2060);
function asPlainText(text: string): string {
  return text.replace(/>(?=>)/g, `>${WORD_JOINER}`).replace(/\{(?=\{)/g, `{${WORD_JOINER}`);
}

// Un renglón: su contenido y si es de ida y vuelta.
function blockOf(raw: string, context: Context): { content: PackageContent; inverse: boolean } {
  const text = htmlToPlainKeepingMarkdown(raw);
  if (UNSUPPORTED.some((pattern) => pattern.test(maskProtected(text)))) {
    context.annotated.push({ what: text, note: 'plainText' });
    return {
      content: text === '' ? [] : [{ type: 'text', text: asPlainText(text) }],
      inverse: false,
    };
  }
  const separator = findSeparator(text);
  if (separator) {
    const left = text.slice(0, separator.at).trim();
    const right = text.slice(separator.at + separator.mark.length).trim();
    if (left !== '' && right !== '') {
      const [question, answer] = separator.direction === 'backward' ? [right, left] : [left, right];
      return {
        content: tidyNodes([
          ...inlineNodes(question, context),
          { type: 'text', text: ' >> ' },
          ...inlineNodes(answer, context),
        ]),
        inverse: separator.direction === 'both',
      };
    }
    // Una marca con un lado vacío («Pregunta >>» con la respuesta abajo): todavía no se interpreta.
    context.annotated.push({ what: text, note: 'plainText' });
    return { content: [{ type: 'text', text: asPlainText(text) }], inverse: false };
  }
  return { content: inlineNodes(text, context), inverse: false };
}

// El HTML que se cuele en un renglón: lo peligroso se va con su contenido y las etiquetas se van; el
// Markdown (imágenes, enlaces, huecos) queda para leerlo después.
function htmlToPlainKeepingMarkdown(raw: string): string {
  if (!/[<&]/.test(raw)) {
    return raw.trim();
  }
  const withoutDanger = removeDangerous(raw);
  const withoutTags = withoutDanger.replace(/<\/?[a-z][^>]*>/gi, '');
  return decodeEntities(withoutTags)
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseDocument(doc: RemnoteDocument, context: Context): PackageBlock[] {
  const blocks: PackageBlock[] = [];
  const stack: { indent: number; key: string }[] = [];
  let fence = false;
  const lines = doc.text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  for (const line of lines) {
    if (/^[ \t]*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (line.trim() === '' || /^[ \t]*([-*_][ \t]*){3,}$/.test(line)) {
      continue;
    }
    let indent: number;
    let body: string;
    const item = fence ? null : LIST_ITEM.exec(line);
    const heading = fence ? null : HEADING.exec(line);
    if (item) {
      indent = indentOf(item[1] ?? '');
      body = item[2] ?? '';
    } else if (heading) {
      indent = 0;
      body = heading[1] ?? '';
      stack.length = 0;
    } else {
      const space = /^[ \t]*/.exec(line)?.[0] ?? '';
      indent = indentOf(space);
      body = line.slice(space.length).replace(/^>\s?/, '');
      if (indent === 0) {
        stack.length = 0;
      }
    }
    while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) {
      stack.pop();
    }
    const key = `b${blocks.length + 1}`;
    // Lo que está entre ``` es código: entra tal cual, como texto común, sin tarjetas (objeción 3).
    const { content, inverse } = fence
      ? {
          content:
            body.trim() === ''
              ? []
              : [{ type: 'text' as const, text: asPlainText(body.trimEnd()) }],
          inverse: false,
        }
      : blockOf(body, context);
    blocks.push({ key, parentKey: stack.at(-1)?.key ?? null, content, inverse });
    if (item || indent > 0) {
      stack.push({ indent, key });
    }
  }
  return blocks;
}

const titleOf = (path: string) => baseName(path).replace(/\.(md|markdown)$/i, '');
const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');

export function buildRemnotePackage(
  docs: readonly RemnoteDocument[],
  media: ReadonlyMap<string, PackageMedia>,
): ImportPackage {
  const titles = new Map<string, string>();
  for (const doc of docs) {
    const key = `remnote:${doc.path}`;
    const title = titleOf(doc.path);
    for (const name of [title, doc.path.replace(/\.(md|markdown)$/i, '')]) {
      const folded = name.toLocaleLowerCase('es');
      if (!titles.has(folded)) {
        titles.set(folded, key);
      }
    }
  }
  const notes: PackageNote[] = [];
  const rejected: RejectedItem[] = [];
  const rejectedBy: string[] = [];
  const annotated: AnnotatedItem[] = [];
  const annotatedBy: string[] = [];
  const used = new Map<string, PackageMedia>();
  for (const doc of docs) {
    const key = `remnote:${doc.path}`;
    const folder = folderOf(doc.path);
    const context: Context = {
      title: titleOf(doc.path),
      folder,
      media,
      titles,
      rejected: [],
      annotated: [],
      used,
    };
    const blocks = parseDocument(doc, context);
    notes.push({
      key,
      title: htmlToPlain(context.title).slice(0, 300),
      topic: folder === '' ? null : folder.split('/').join(' › ').slice(0, 300),
      blocks,
    });
    for (const item of context.rejected) {
      rejected.push(item);
      rejectedBy.push(key);
    }
    for (const item of context.annotated) {
      annotated.push(item);
      annotatedBy.push(key);
    }
  }
  return {
    kind: 'remnote',
    cards: [],
    notes,
    media: [...used.values()],
    rejected: rejected.map((item) => ({ ...item, what: excerpt(item.what, MAX_WHAT) })),
    rejectedBy,
    annotated: annotated.map((item) => ({ ...item, what: excerpt(item.what, MAX_WHAT) })),
    annotatedBy,
    skippedReviews: 0,
  };
}
