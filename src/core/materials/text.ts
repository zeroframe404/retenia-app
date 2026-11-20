import type { BlockDraft, BlockType } from './blocks';

// Los lectores de texto (H-25, CA-107): un texto común (también lo que se pega con «Pegar texto»)
// y un Markdown. Son reglas puras sobre el texto ya decodificado. El HTML que traiga un archivo no
// se interpreta: es texto.

// Bytes de control que un texto no tiene: todos los menores que el espacio salvo la tabulación,
// el salto de renglón, el salto de página y el retorno; y el de borrar.
function hasControl(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c && code !== 0x0d) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

function decodeWith(encoding: 'utf-8' | 'utf-16le' | 'utf-16be', bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

// Cuántos bytes del final hay que dejar afuera para no cortar una letra de UTF-8 a la mitad.
function incompleteTail(bytes: Uint8Array): number {
  for (let back = 1; back <= Math.min(3, bytes.length); back++) {
    const byte = bytes[bytes.length - back] ?? 0;
    if ((byte & 0xc0) === 0xc0) {
      const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
      return needed > back ? back : 0;
    }
    if ((byte & 0xc0) !== 0x80) {
      return 0;
    }
  }
  return 0;
}

// Un texto en UTF-8 (con o sin marca inicial) o en UTF-16 con marca. Devuelve el texto en forma
// NFC y con saltos «\n», o null si no es texto (bytes inválidos o de control). `partial`: los bytes
// son solo el principio del archivo y la última letra puede estar cortada.
export function decodeText(
  bytes: Uint8Array,
  { partial = false }: { partial?: boolean } = {},
): string | null {
  let text: string | null;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    const body = bytes.subarray(2);
    text = decodeWith(
      'utf-16le',
      partial ? body.subarray(0, body.length - (body.length % 2)) : body,
    );
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2);
    text = decodeWith(
      'utf-16be',
      partial ? body.subarray(0, body.length - (body.length % 2)) : body,
    );
  } else {
    const body =
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
    text = decodeWith(
      'utf-8',
      partial ? body.subarray(0, body.length - incompleteTail(body)) : body,
    );
  }
  if (text === null || hasControl(text)) {
    return null;
  }
  return text.replace(/\r\n?/g, '\n').normalize('NFC');
}

// Un texto tiene marcas de Markdown si tiene un título con «#» o un bloque de código.
export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}[ \t]+\S/m.test(text) || /^```/m.test(text);
}

const draft = (type: BlockType, lines: string[], level = 0): BlockDraft => ({
  type,
  level,
  unit: 1,
  lines: lines.map((text) => ({ text, box: null })),
});

// Un renglón corto, sin puntuación al final, solo entre blancos y con algo después: un título.
const FINAL_PUNCTUATION = /[.!?:;,…»)\]"'”]$/u;
const MAX_TITLE = 80;

export function readPlainText(text: string): BlockDraft[] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((chunk) =>
      chunk
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim() !== ''),
    )
    .filter((lines) => lines.length > 0);
  return paragraphs.map((lines, index) => {
    const only = lines.length === 1 ? (lines[0] ?? '').trim() : null;
    const isTitle =
      only !== null &&
      only.length <= MAX_TITLE &&
      !FINAL_PUNCTUATION.test(only) &&
      index < paragraphs.length - 1;
    return isTitle
      ? draft('section', [only], 1)
      : draft(
          'paragraph',
          lines.map((l) => l.trim()),
        );
  });
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const LIST_ITEM = /^[ \t]{0,3}(?:[-*+]|\d{1,3}[.)])[ \t]+(.*)$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;
const TABLE_ROW = /^[ \t]*\|/;
const TABLE_RULE = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;
const QUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/;

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

export function readMarkdown(text: string): BlockDraft[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BlockDraft[] = [];
  const markdown = (block: BlockDraft): BlockDraft => ({ ...block, markup: 'md' });
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      index++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push(markdown(draft('section', [heading[2] ?? ''], heading[1]?.length ?? 1)));
      index++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const code: string[] = [];
      index++;
      while (
        index < lines.length &&
        !(lines[index] ?? '').trimStart().startsWith(fence[1] ?? '```')
      ) {
        code.push(lines[index] ?? '');
        index++;
      }
      index++;
      blocks.push(draft('code', code.length > 0 ? code : ['']));
      continue;
    }
    if (line.trim().startsWith('$$')) {
      const formula: string[] = [];
      let current = line.trim().slice(2);
      while (true) {
        const end = current.indexOf('$$');
        if (end !== -1) {
          formula.push(current.slice(0, end));
          index++;
          break;
        }
        formula.push(current);
        index++;
        if (index >= lines.length) {
          break;
        }
        current = lines[index] ?? '';
      }
      blocks.push(
        draft(
          'formula',
          formula.map((part) => part.trim()).filter((part) => part !== ''),
        ),
      );
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const rows: string[] = [];
      while (index < lines.length && TABLE_ROW.test(lines[index] ?? '')) {
        const row = lines[index] ?? '';
        if (!TABLE_RULE.test(row)) {
          rows.push(cells(row).join('\t'));
        }
        index++;
      }
      blocks.push(markdown(draft('table', rows)));
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const item = LIST_ITEM.exec(current);
        if (item) {
          items.push((item[1] ?? '').trim());
        } else if (current.trim() !== '' && /^[ \t]{2,}/.test(current) && items.length > 0) {
          items[items.length - 1] = `${items[items.length - 1]} ${current.trim()}`;
        } else {
          break;
        }
        index++;
      }
      blocks.push(markdown(draft('list', items)));
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const current = QUOTE.exec(lines[index] ?? '');
        if (!current) {
          break;
        }
        quoted.push((current[1] ?? '').trim());
        index++;
      }
      blocks.push(
        markdown(
          draft(
            'paragraph',
            quoted.filter((part) => part !== ''),
          ),
        ),
      );
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (
        current.trim() === '' ||
        HEADING.test(current) ||
        FENCE.test(current) ||
        LIST_ITEM.test(current) ||
        TABLE_ROW.test(current) ||
        current.trim().startsWith('$$')
      ) {
        break;
      }
      paragraph.push(current.trim());
      index++;
    }
    blocks.push(markdown(draft('paragraph', paragraph)));
  }
  return blocks;
}
