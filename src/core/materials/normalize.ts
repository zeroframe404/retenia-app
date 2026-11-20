import { type BlockDraft, type Box, FLOWING_TYPES } from './blocks';

export type { BlockDraft } from './blocks';

// La normalización reversible (H-25). El texto crudo de cada bloque (sus renglones tal como los
// dio el lector, separados por «\n») se arregla un poco para leerlo de corrido:
// - cada letra queda en forma Unicode NFC;
// - un salto de renglón dentro de un párrafo es un espacio;
// - una palabra cortada por guion al final del renglón se une, pero solo si la palabra unida
//   aparece en el propio documento (si no, puede ser una palabra compuesta);
// - un párrafo partido entre dos páginas se une, pero solo si el renglón no termina en
//   puntuación final y el siguiente empieza en minúscula (los encabezados y pies de página del
//   medio no cuentan);
// - en Markdown, las marcas de énfasis («**», «__» y «`») se sacan.
// Cada arreglo queda anotado: deshacerlos todos devuelve exactamente el texto crudo.

export type TransformationKind = 'nfc' | 'hyphen' | 'linebreak' | 'join' | 'markup';

export interface Transformation {
  kind: TransformationKind;
  // El tramo del texto crudo que se reemplazó y el tramo del normalizado que lo reemplaza.
  raw: [number, number];
  norm: [number, number];
  // El texto crudo de ese tramo.
  original: string;
}

export interface NormalizedLine {
  text: string;
  box: Box | null;
  // Dónde quedó el renglón dentro del texto normalizado del bloque.
  norm: [number, number];
}

export interface NormalizedBlock {
  type: BlockDraft['type'];
  level: number;
  unit: number;
  raw: string;
  normalized: string;
  transformations: Transformation[];
  lines: NormalizedLine[];
  // El índice (en la lista que se devuelve) de la sección de la que cuelga.
  parent: number | null;
  // Los títulos de las secciones que lo contienen; en una sección, también el suyo.
  headingPath: string[];
}

// Lo que no deja unir un párrafo con el de la página siguiente.
const FINAL_PUNCTUATION = /[.!?…:;»"”)\]]\s*$/u;
const STARTS_LOWERCASE = /^\s*\p{Ll}/u;
const BETWEEN_PAGES: readonly BlockDraft['type'][] = ['header', 'footer', 'figure'];

const lastLineText = (block: BlockDraft) => block.lines.at(-1)?.text ?? '';
const firstLineText = (block: BlockDraft) => block.lines[0]?.text ?? '';

// Une los párrafos partidos entre páginas. Devuelve los bloques y, por bloque unido, en qué
// renglones empieza cada página nueva (esos saltos son una unión, no un salto común).
function joinAcrossPages(drafts: readonly BlockDraft[]): {
  blocks: BlockDraft[];
  joins: Set<number>[];
} {
  const blocks: BlockDraft[] = [];
  const joins: Set<number>[] = [];
  for (const draft of drafts) {
    if (draft.type === 'paragraph') {
      let back = blocks.length - 1;
      while (back >= 0 && BETWEEN_PAGES.includes((blocks[back] as BlockDraft).type)) {
        back--;
      }
      const previous = blocks[back];
      if (
        previous &&
        previous.type === 'paragraph' &&
        previous.unit < draft.unit &&
        !FINAL_PUNCTUATION.test(lastLineText(previous)) &&
        STARTS_LOWERCASE.test(firstLineText(draft))
      ) {
        joins[back]?.add(previous.lines.length);
        previous.lines = [...previous.lines, ...draft.lines];
        continue;
      }
    }
    blocks.push({ ...draft, lines: [...draft.lines] });
    joins.push(new Set());
  }
  return { blocks, joins };
}

const WORD = /\p{L}+/gu;

// Las palabras del documento, en minúscula y en NFC, para decidir si una palabra cortada existe.
function vocabularyOf(blocks: readonly BlockDraft[]): Set<string> {
  const words = new Set<string>();
  for (const block of blocks) {
    for (const line of block.lines) {
      for (const word of line.text.normalize('NFC').matchAll(WORD)) {
        words.add(word[0].toLowerCase());
      }
    }
  }
  return words;
}

interface Edit {
  kind: TransformationKind;
  start: number;
  end: number;
  replacement: string;
}

// Los arreglos dentro de un renglón: las letras que no están en NFC y, en Markdown, las marcas.
function lineEdits(text: string, markup: boolean): Edit[] {
  const edits: Edit[] = [];
  if (markup) {
    for (const match of text.matchAll(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/gu)) {
      const start = match.index ?? 0;
      const marker = match[1] ?? '';
      edits.push({ kind: 'markup', start, end: start + marker.length, replacement: '' });
      const close = start + match[0].length - marker.length;
      edits.push({ kind: 'markup', start: close, end: close + marker.length, replacement: '' });
    }
    for (const match of text.matchAll(/`([^`]+)`/gu)) {
      const start = match.index ?? 0;
      edits.push({ kind: 'markup', start, end: start + 1, replacement: '' });
      const close = start + match[0].length - 1;
      edits.push({ kind: 'markup', start: close, end: close + 1, replacement: '' });
    }
  }
  for (const match of text.matchAll(/\p{M}+|\P{M}\p{M}*/gu)) {
    const cluster = match[0];
    const composed = cluster.normalize('NFC');
    if (composed !== cluster) {
      const start = match.index ?? 0;
      edits.push({ kind: 'nfc', start, end: start + cluster.length, replacement: composed });
    }
  }
  edits.sort((a, b) => a.start - b.start);
  return edits.filter((edit, index) => index === 0 || edit.start >= (edits[index - 1] as Edit).end);
}

function normalizeBlock(
  draft: BlockDraft,
  joins: Set<number>,
  vocabulary: Set<string>,
): Omit<NormalizedBlock, 'parent' | 'headingPath'> {
  const flowing = FLOWING_TYPES.includes(draft.type);
  const transformations: Transformation[] = [];
  const lines: NormalizedLine[] = [];
  let raw = '';
  let normalized = '';
  const push = (kind: TransformationKind, original: string, replacement: string) => {
    transformations.push({
      kind,
      raw: [raw.length, raw.length + original.length],
      norm: [normalized.length, normalized.length + replacement.length],
      original,
    });
    raw += original;
    normalized += replacement;
  };
  const keep = (text: string) => {
    raw += text;
    normalized += text;
  };
  let hyphenated = false;
  draft.lines.forEach((line, index) => {
    if (index > 0) {
      const previous = draft.lines[index - 1]?.text ?? '';
      if (!flowing) {
        keep('\n');
      } else if (hyphenated) {
        // El guion ya se sacó junto con el salto (ver abajo).
      } else if (/\s$/u.test(previous) || /^\s/u.test(line.text)) {
        push(joins.has(index) ? 'join' : 'linebreak', '\n', '');
      } else {
        push(joins.has(index) ? 'join' : 'linebreak', '\n', ' ');
      }
    }
    hyphenated = false;
    let text = line.text;
    const next = draft.lines[index + 1]?.text;
    // ¿Termina en una palabra cortada que existe unida en el documento?
    let hyphen = false;
    if (flowing && next !== undefined) {
      const tail = /(\p{L}+)-$/u.exec(text);
      const head = /^(\p{Ll}\p{L}*)/u.exec(next);
      if (tail && head) {
        const joined = `${tail[1]}${head[1]}`.normalize('NFC').toLowerCase();
        hyphen = vocabulary.has(joined);
      }
    }
    if (hyphen) {
      text = text.slice(0, -1);
    }
    const start = normalized.length;
    let cursor = 0;
    for (const edit of lineEdits(text, draft.markup === 'md')) {
      keep(text.slice(cursor, edit.start));
      push(edit.kind, text.slice(edit.start, edit.end), edit.replacement);
      cursor = edit.end;
    }
    keep(text.slice(cursor));
    lines.push({ text: line.text, box: line.box, norm: [start, normalized.length] });
    if (hyphen) {
      push('hyphen', next === undefined ? '-' : '-\n', '');
      hyphenated = true;
    }
  });
  // Si quedó algo fuera de NFC entre renglones (letras que se combinan con la del otro lado), el
  // bloque entero se recompone con un solo arreglo.
  if (normalized !== normalized.normalize('NFC')) {
    const composed = normalized.normalize('NFC');
    return {
      type: draft.type,
      level: draft.level,
      unit: draft.unit,
      raw,
      normalized: composed,
      transformations: [
        { kind: 'nfc', raw: [0, raw.length], norm: [0, composed.length], original: raw },
      ],
      lines: lines.map((line) => ({ ...line, norm: [0, composed.length] })),
    };
  }
  return {
    type: draft.type,
    level: draft.level,
    unit: draft.unit,
    raw,
    normalized,
    transformations,
    lines,
  };
}

export function normalizeDocument(drafts: readonly BlockDraft[]): NormalizedBlock[] {
  const { blocks, joins } = joinAcrossPages(drafts);
  const vocabulary = vocabularyOf(blocks);
  const stack: { index: number; level: number; title: string }[] = [];
  return blocks.map((draft, index) => {
    const block = normalizeBlock(draft, joins[index] ?? new Set(), vocabulary);
    if (block.type === 'section') {
      while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= block.level) {
        stack.pop();
      }
      const parent = stack.at(-1)?.index ?? null;
      const headingPath = [...stack.map((entry) => entry.title), block.normalized];
      stack.push({ index, level: block.level, title: block.normalized });
      return { ...block, parent, headingPath };
    }
    return {
      ...block,
      parent: stack.at(-1)?.index ?? null,
      headingPath: stack.map((entry) => entry.title),
    };
  });
}

// Deshace las transformaciones: vuelve al texto crudo.
export function revertText(normalized: string, transformations: readonly Transformation[]): string {
  let text = normalized;
  // De atrás para adelante; dos que empiezan en el mismo lugar, primero la que vino después en el
  // texto crudo (una que no ocupa lugar en el normalizado queda antes que la de al lado).
  const ordered = [...transformations].sort((a, b) => b.norm[0] - a.norm[0] || b.raw[0] - a.raw[0]);
  for (const transformation of ordered) {
    text =
      text.slice(0, transformation.norm[0]) +
      transformation.original +
      text.slice(transformation.norm[1]);
  }
  return text;
}

// Un tramo del texto normalizado, llevado al texto crudo (para la cita y las cajas).
export function toRawRange(
  [start, end]: [number, number],
  transformations: readonly Transformation[],
): [number, number] {
  const map = (position: number, side: 'start' | 'end') => {
    let delta = 0;
    for (const t of transformations) {
      const rawLength = t.raw[1] - t.raw[0];
      const normLength = t.norm[1] - t.norm[0];
      const before =
        side === 'start'
          ? t.norm[1] <= position
          : t.norm[1] < position || (normLength > 0 && t.norm[1] <= position);
      if (before) {
        delta += rawLength - normLength;
      } else if (t.norm[0] < position && position < t.norm[1]) {
        return side === 'start' ? t.raw[0] : t.raw[1];
      }
    }
    return position + delta;
  };
  return [map(start, 'start'), map(end, 'end')];
}
