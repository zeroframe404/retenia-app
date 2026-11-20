import type { BlockType } from './blocks';

// La capa de correcciones de un material (H-27): lo que corregís no toca el texto de base de cada
// bloque. Vive aparte, por bloque, y se vuelve a aplicar cuando se reprocesa la página; si el texto
// de base ya no es el mismo, queda «En conflicto» para que decidas vos.

// Una huella corta del tipo y el texto de base de un bloque (cyrb53). No es un secreto: sirve para
// reconocer el mismo bloque después de volver a leer la página.
export function blockKey(type: BlockType | string, base: string): string {
  const source = `${type}\u0000${base}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

// La clave de cada bloque de una lista: la huella de su tipo y su texto de base y, si ya hubo otro
// igual antes en la misma página, el número de aparición. El primero lleva la clave de siempre, así
// lo guardado antes de esto sigue valiendo.
export function occurrenceKeys(blocks: readonly BaseBlock[]): string[] {
  const seen = new Map<string, number>();
  return blocks.map((block) => {
    const key = blockKey(block.type, block.base);
    const where = `${block.unit}:${key}`;
    const count = seen.get(where) ?? 0;
    seen.set(where, count + 1);
    return count === 0 ? key : `${key}~${count}`;
  });
}

export interface BaseBlock {
  unit: number;
  type: BlockType | string;
  base: string;
}

export interface StoredCorrection {
  id: string;
  unit: number;
  key: string;
  before: string;
  after: string;
}

export type CorrectionOutcome = 'applied' | 'conflict';

// El texto final de cada bloque y qué pasó con cada corrección. Una corrección se aplica al primer
// bloque de su página con la misma huella que todavía no tiene otra; si no hay ninguno, el texto
// de base cambió y queda en conflicto (sin aplicarse y sin perderse).
export function applyCorrections(
  blocks: readonly BaseBlock[],
  corrections: readonly StoredCorrection[],
): { texts: string[]; outcomes: Record<string, CorrectionOutcome> } {
  const texts = blocks.map((block) => block.base);
  const keys = occurrenceKeys(blocks);
  const plain = blocks.map((block) => blockKey(block.type, block.base));
  const taken = new Set<number>();
  const outcomes: Record<string, CorrectionOutcome> = {};
  for (const correction of corrections) {
    const exact = blocks.findIndex(
      (block, at) =>
        !taken.has(at) && block.unit === correction.unit && keys[at] === correction.key,
    );
    // Una clave sin número de aparición (de antes) vale para el primer bloque igual que esté libre.
    const index =
      exact >= 0
        ? exact
        : blocks.findIndex(
            (block, at) =>
              !taken.has(at) &&
              block.unit === correction.unit &&
              plain[at] === correction.key.split('~')[0],
          );
    if (index < 0) {
      outcomes[correction.id] = 'conflict';
      continue;
    }
    taken.add(index);
    texts[index] = correction.after;
    outcomes[correction.id] = 'applied';
  }
  return { texts, outcomes };
}

type DiffKind = 'figure' | 'sign' | 'unit' | 'text';

export interface DiffSegment {
  text: string;
  changed: boolean;
  kind?: DiffKind;
}

const TOKEN = /\d+(?:[.,]\d+)*|[−+±=<>≤≥≠–-]|\p{L}+|\s+|[^\s\p{L}\d]/gu;
const SIGNS = /^[−+±=<>≤≥≠–-]$/u;
const UNITS = new Set([
  'mm',
  'cm',
  'm',
  'km',
  'mg',
  'g',
  'kg',
  'ml',
  'l',
  's',
  'seg',
  'min',
  'h',
  'hs',
  'segundo',
  'segundos',
  'minuto',
  'minutos',
  'hora',
  'horas',
  'dia',
  'día',
  'dias',
  'días',
  'semana',
  'semanas',
  'mes',
  'meses',
  'año',
  'años',
  'metro',
  'metros',
  'gramo',
  'gramos',
  'litro',
  'litros',
  'grado',
  'grados',
]);
const MAX_TOKENS = 4000;

function kindOf(token: string): DiffKind {
  if (/\d/u.test(token)) {
    return 'figure';
  }
  if (SIGNS.test(token)) {
    return 'sign';
  }
  if (UNITS.has(token.toLowerCase())) {
    return 'unit';
  }
  return 'text';
}

// Las partes del texto nuevo que cambiaron respecto del de antes. Las cifras, los signos y las
// unidades se distinguen del resto para resaltarlas: una cifra cambiada es lo que más importa.
export function diffSegments(before: string, after: string): DiffSegment[] {
  const a = before.match(TOKEN) ?? [];
  const b = after.match(TOKEN) ?? [];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return after === before
      ? [{ text: after, changed: false }]
      : [{ text: after, changed: true, kind: 'text' }];
  }
  // El largo de la subsecuencia común más larga, de atrás para adelante.
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const kept = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      kept.add(j);
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  const segments: DiffSegment[] = [];
  b.forEach((token, index) => {
    if (kept.has(index) || /^\s+$/u.test(token)) {
      const last = segments.at(-1);
      if (last && !last.changed) {
        last.text += token;
      } else {
        segments.push({ text: token, changed: false });
      }
    } else {
      segments.push({ text: token, changed: true, kind: kindOf(token) });
    }
  });
  return segments;
}

// Dónde queda una frase citada (de `start` a `end` en el texto de antes) cuando el bloque pasa a
// ser el texto de después: lo que está antes o después de lo cambiado se mueve junto, y lo que
// toca lo cambiado se estira hasta cubrir el texto nuevo.
export function remapQuote(
  before: string,
  after: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const delta = after.length - before.length;
  const changedFrom = prefix;
  const changedTo = before.length - suffix;
  const map = (position: number, edge: 'start' | 'end') => {
    if (position <= changedFrom) {
      return position;
    }
    if (position >= changedTo) {
      return position + delta;
    }
    return edge === 'start' ? changedFrom : after.length - suffix;
  };
  const from = Math.min(Math.max(map(start, 'start'), 0), after.length);
  const to = Math.min(Math.max(map(end, 'end'), from), after.length);
  return { start: from, end: to };
}
