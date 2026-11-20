import type { Box } from './blocks';

// La fuente anclada (H-26): una tarjeta guarda la frase que se eligió del material con un poco de
// contexto. Cada vez que se abre, se la vuelve a buscar: primero en su página, después en las
// vecinas. Si aparece una sola vez (o el contexto deja una sola), queda ubicada; si no aparece o
// aparece varias veces sin forma de elegir, queda «Fuente a reubicar». Nunca se resalta algo que
// no es.

export interface UnitText {
  unit: number;
  text: string;
}

export interface Cite {
  unit: number;
  quote: string;
  before: string;
  after: string;
}

export type Located =
  | { status: 'located'; unit: number; start: number; end: number }
  | { status: 'relocate' };

// Cuánto contexto de cada lado se guarda con la cita.
const CONTEXT_LENGTH = 40;

// El texto con los blancos juntados en un espacio, y de dónde salió cada letra.
function collapsed(text: string): { text: string; origin: number[] } {
  let out = '';
  const origin: number[] = [];
  let space = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string;
    if (/\s/u.test(char)) {
      if (!space && out !== '') {
        out += ' ';
        origin.push(index);
      }
      space = true;
    } else {
      out += char;
      origin.push(index);
      space = false;
    }
  }
  return { text: out, origin };
}

const squeeze = (text: string) => text.replace(/\s+/gu, ' ').trim();

function occurrences(text: string, wanted: string): number[] {
  const found: number[] = [];
  if (wanted === '') {
    return found;
  }
  let from = text.indexOf(wanted);
  while (from !== -1) {
    found.push(from);
    from = text.indexOf(wanted, from + 1);
  }
  return found;
}

function locateIn(unit: UnitText, cite: Cite): { start: number; end: number }[] {
  const { text, origin } = collapsed(unit.text);
  const quote = squeeze(cite.quote);
  const all = occurrences(text, quote);
  let chosen = all;
  if (all.length > 1) {
    const before = squeeze(cite.before);
    const after = squeeze(cite.after);
    chosen = all.filter((at) => {
      const head = text.slice(0, at).trimEnd();
      const tail = text.slice(at + quote.length).trimStart();
      return (before === '' || head.endsWith(before)) && (after === '' || tail.startsWith(after));
    });
    if (before === '' && after === '') {
      chosen = all;
    }
  }
  return chosen.map((at) => ({
    start: origin[at] ?? 0,
    end: (origin[at + quote.length - 1] ?? 0) + 1,
  }));
}

export function relocateQuote(units: readonly UnitText[], cite: Cite): Located {
  if (squeeze(cite.quote) === '') {
    return { status: 'relocate' };
  }
  const own = units.find((unit) => unit.unit === cite.unit);
  if (own) {
    const found = locateIn(own, cite);
    if (found.length === 1) {
      return { status: 'located', unit: own.unit, ...(found[0] as { start: number; end: number }) };
    }
    if (found.length > 1) {
      return { status: 'relocate' };
    }
  }
  const neighbors = units.filter((unit) => Math.abs(unit.unit - cite.unit) === 1);
  const found = neighbors.flatMap((unit) =>
    locateIn(unit, cite).map((range) => ({ unit: unit.unit, ...range })),
  );
  if (found.length === 1) {
    const [only] = found as [{ unit: number; start: number; end: number }];
    return { status: 'located', ...only };
  }
  return { status: 'relocate' };
}

// El contexto que se guarda con una cita nueva: hasta 40 letras de cada lado.
export function quoteContext(
  text: string,
  start: number,
  end: number,
): { before: string; after: string } {
  return {
    before: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    after: text.slice(end, end + CONTEXT_LENGTH),
  };
}

export interface Span {
  start: number;
  end: number;
  box: Box | null;
}

export interface BlockForText {
  id: string;
  unit: number;
  type: string;
  normalized: string;
  // Dónde está cada renglón en el texto normalizado del bloque, y su caja en la hoja.
  lines: { norm: [number, number]; box: Box | null }[];
}

const OUTSIDE_TEXT = ['figure', 'header', 'footer'];

// El texto de cada unidad (página) para buscar citas: los bloques con texto de corrido, separados
// por un renglón en blanco, con dónde empieza cada bloque y la caja de cada renglón.
export function unitTexts(blocks: readonly BlockForText[]): (UnitText & {
  spans: Span[];
  blocks: { id: string; start: number; end: number }[];
})[] {
  const byUnit = new Map<
    number,
    { text: string; spans: Span[]; blocks: { id: string; start: number; end: number }[] }
  >();
  for (const block of blocks) {
    if (OUTSIDE_TEXT.includes(block.type) || block.normalized === '') {
      continue;
    }
    const entry = byUnit.get(block.unit) ?? { text: '', spans: [], blocks: [] };
    if (entry.text !== '') {
      entry.text += '\n\n';
    }
    const start = entry.text.length;
    entry.text += block.normalized;
    entry.blocks.push({ id: block.id, start, end: entry.text.length });
    for (const line of block.lines) {
      entry.spans.push({ start: start + line.norm[0], end: start + line.norm[1], box: line.box });
    }
    byUnit.set(block.unit, entry);
  }
  return [...byUnit.entries()]
    .sort(([a], [b]) => a - b)
    .map(([unit, entry]) => ({ unit, ...entry }));
}

// Las cajas de un tramo de texto: el pedazo de cada renglón que toca, en proporción a sus letras
// (como `locatePhrase` en src/core/highlight).
export function boxesFor(spans: readonly Span[], start: number, end: number): Box[] {
  const boxes: Box[] = [];
  for (const span of spans) {
    if (!span.box) {
      continue;
    }
    const first = Math.max(start, span.start);
    const last = Math.min(end, span.end);
    if (first >= last || span.end <= span.start) {
      continue;
    }
    const share = span.box.width / (span.end - span.start);
    const whole = first === span.start && last === span.end;
    boxes.push({
      page: span.box.page,
      x: span.box.x + (first - span.start) * share,
      y: span.box.y,
      width: whole ? span.box.width : (last - first) * share,
      height: span.box.height,
    });
  }
  return boxes;
}
