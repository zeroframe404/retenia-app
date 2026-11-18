// La búsqueda (H-23): las reglas que no necesitan base. Cómo se lee lo que escribís («tipo:»,
// «materia:», «tema:» y las palabras), cómo se arman las consultas a los dos índices (uno por
// palabras y otro por pedazos de palabra), cómo se ordenan los resultados y cómo se resalta la
// coincidencia. Solo texto: no hay búsqueda por significado.

export type SearchKind = 'note' | 'block' | 'card' | 'topic' | 'doubt' | 'material' | 'section';

const SEARCH_KINDS: readonly SearchKind[] = [
  'card',
  'topic',
  'note',
  'block',
  'doubt',
  'material',
  'section',
];

// Los cuatro grupos que ve la persona, en este orden.
export type SearchGroup = 'notes' | 'cards' | 'materials' | 'doubts';

export function groupOf(kind: SearchKind): SearchGroup {
  switch (kind) {
    case 'note':
    case 'block':
    case 'topic':
      return 'notes';
    case 'card':
      return 'cards';
    case 'material':
    case 'section':
      return 'materials';
    case 'doubt':
      return 'doubts';
  }
}

// Lo máximo que se lee de lo escrito: más largo que esto no es una búsqueda.
const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 64;
// Un pedazo de menos de tres letras busca solo por palabra entera.
const MIN_PIECE_LENGTH = 3;

const codePoints = (text: string) => [...text];

// Sin tildes y sin mayúsculas, letra por letra: el resultado tiene el mismo largo que el original,
// así un lugar del texto plegado es el mismo lugar del texto de verdad.
export function foldText(text: string): string {
  let folded = '';
  for (const char of text) {
    const base = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (base.length === char.length) {
      folded += base;
      continue;
    }
    const lower = char.toLowerCase();
    folded += lower.length === char.length ? lower : char;
  }
  return folded;
}

export interface ParsedQuery {
  terms: string[];
  // Nulo: todos los tipos. Una lista vacía: un tipo que no existe, no encuentra nada.
  types: SearchKind[] | null;
  subject: string | null;
  topic: string | null;
}

const TYPE_NAMES: Record<string, SearchKind[]> = {
  tarjeta: ['card'],
  tarjetas: ['card'],
  apunte: ['note', 'block'],
  apuntes: ['note', 'block'],
  nota: ['note', 'block'],
  notas: ['note', 'block'],
  tema: ['topic'],
  temas: ['topic'],
  duda: ['doubt'],
  dudas: ['doubt'],
  material: ['material', 'section'],
  materiales: ['material', 'section'],
};

// Un filtro es «clave:valor»; el valor puede ir entre comillas si tiene espacios.
const FILTER = /(?:^|\s)(tipo|materia|tema):("[^"]*"|\S*)/giu;

export function parseSearchQuery(text: string): ParsedQuery {
  // Los caracteres de control no son nada que se pueda buscar: se leen como un espacio.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: justamente los saca.
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ');
  let types: SearchKind[] | null = null;
  let subject: string | null = null;
  let topic: string | null = null;
  const rest = clean.replace(FILTER, (_whole, key: string, raw: string) => {
    const value = raw.replace(/^"/u, '').replace(/"$/u, '').trim();
    if (value !== '') {
      const name = key.toLowerCase();
      if (name === 'tipo') {
        const found = TYPE_NAMES[foldText(value)] ?? [];
        types = [...(types ?? []), ...found.filter((kind) => !(types ?? []).includes(kind))];
      } else if (name === 'materia') {
        subject = value;
      } else {
        topic = value;
      }
    }
    return ' ';
  });
  const terms = rest
    .split(/\s+/u)
    .filter((term) => term !== '')
    .slice(0, MAX_TERMS)
    .map((term) => codePoints(term).slice(0, MAX_TERM_LENGTH).join(''));
  return { terms, types, subject, topic };
}

export interface MatchPlan {
  // La consulta al índice de pedazos de palabra (todas las palabras de tres letras o más).
  pieces: string | null;
  // La consulta al índice de palabras enteras (las de menos de tres letras).
  words: string | null;
  // Había palabras pero ninguna se puede buscar: no hay resultados.
  impossible: boolean;
}

// Una palabra tal como se la entrega al índice: entre comillas, con las comillas duplicadas. Así
// los paréntesis, los asteriscos y las comillas son texto, nunca sintaxis de la consulta.
export function quoteForIndex(term: string): string {
  return `"${term.replaceAll('"', '""')}"`;
}

export function matchPlan(terms: readonly string[]): MatchPlan {
  const pieces: string[] = [];
  const words: string[] = [];
  for (const term of terms) {
    if (codePoints(term).length >= MIN_PIECE_LENGTH) {
      pieces.push(quoteForIndex(term));
    } else if (/[\p{L}\p{N}]/u.test(term)) {
      words.push(quoteForIndex(term));
    }
    // Un pedazo corto sin letras ni números («/», «=») no se puede buscar por palabra: se ignora.
  }
  return {
    pieces: pieces.length === 0 ? null : pieces.join(' AND '),
    words: words.length === 0 ? null : words.join(' AND '),
    impossible: terms.length > 0 && pieces.length === 0 && words.length === 0,
  };
}

export interface TitleMatch {
  // Cuántas de las palabras buscadas están en el título.
  matched: number;
  // Qué parte del título ocupan (0 a 1): en un título corto, la palabra pesa más.
  coverage: number;
}

export function titleMatch(title: string, terms: readonly string[]): TitleMatch {
  if (title === '') {
    return { matched: 0, coverage: 0 };
  }
  const folded = foldText(title);
  let matched = 0;
  for (const term of terms) {
    if (matchRanges(folded, [term]).length > 0) {
      matched += 1;
    }
  }
  const covered = matchRanges(folded, terms).reduce((sum, [start, end]) => sum + (end - start), 0);
  return { matched, coverage: Math.min(1, covered / title.length) };
}

// Una tarjeta pesa algo más que un apunte, un renglón o una duda: es lo que se estudia.
const KIND_WEIGHT: Record<SearchKind, number> = {
  card: 1,
  topic: 0.8,
  material: 0.9,
  doubt: 0.9,
  note: 0.85,
  section: 0.8,
  block: 0.8,
};

// La relevancia: coincidir en el título vale mucho más que en el cuerpo (40 contra 100 o más), y
// entre títulos, el más corto para esa palabra va antes.
export function relevanceOf(kind: SearchKind, match: TitleMatch, termCount: number): number {
  const share = termCount === 0 ? 0 : match.matched / termCount;
  const score = 40 + 60 * share + 40 * share * match.coverage;
  return score * KIND_WEIGHT[kind];
}

export interface RankedHit {
  id: string;
  kind: SearchKind;
  // El texto buscado es el título o uno de los nombres viejos de un tema, entero.
  exact: boolean;
  // Más alta, más relevante; el título pesa más que el cuerpo.
  relevance: number;
  activeSubject: boolean;
  archived: boolean;
  openedAt: string | null;
  touchedAt: string;
}

const KIND_RANK = new Map(SEARCH_KINDS.map((kind, index) => [kind, index]));

// La relevancia casi igual cuenta como igual: así los desempates de abajo llegan a valer algo.
const bucket = (relevance: number) => Math.round(relevance);

// El orden: la coincidencia exacta de título o de nombre viejo; después la relevancia; a igualdad,
// la materia activa antes que las otras, lo abierto hace poco antes que lo viejo y lo archivado al
// final; y después una tarjeta antes que un renglón y lo más nuevo primero.
export function compareHits(a: RankedHit, b: RankedHit): number {
  if (a.exact !== b.exact) {
    return a.exact ? -1 : 1;
  }
  const byRelevance = bucket(b.relevance) - bucket(a.relevance);
  if (byRelevance !== 0) {
    return byRelevance;
  }
  if (a.activeSubject !== b.activeSubject) {
    return a.activeSubject ? -1 : 1;
  }
  if (a.openedAt !== b.openedAt) {
    if (a.openedAt === null) {
      return 1;
    }
    if (b.openedAt === null) {
      return -1;
    }
    return a.openedAt < b.openedAt ? 1 : -1;
  }
  if (a.archived !== b.archived) {
    return a.archived ? 1 : -1;
  }
  const byKind = (KIND_RANK.get(a.kind) ?? 99) - (KIND_RANK.get(b.kind) ?? 99);
  if (byKind !== 0) {
    return byKind;
  }
  if (a.touchedAt !== b.touchedAt) {
    return a.touchedAt < b.touchedAt ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface Segment {
  text: string;
  match: boolean;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

// Dónde cae cada palabra buscada en el texto (plegado): un pedazo de tres letras o más donde
// aparezca, uno más corto solo como palabra entera.
function matchRanges(folded: string, terms: readonly string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const term of terms) {
    const needle = foldText(term);
    if (needle === '') {
      continue;
    }
    const whole = codePoints(needle).length < MIN_PIECE_LENGTH;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) {
        break;
      }
      const end = at + needle.length;
      from = at + 1;
      if (whole) {
        const before = at > 0 ? (folded[at - 1] ?? '') : '';
        const after = folded[end] ?? '';
        if ((before !== '' && WORD_CHAR.test(before)) || (after !== '' && WORD_CHAR.test(after))) {
          continue;
        }
      }
      ranges.push([at, end]);
    }
  }
  ranges.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

// El texto en tramos: lo que coincide con lo buscado va marcado. Nada se pierde ni se inventa.
export function segmentsOf(text: string, terms: readonly string[]): Segment[] {
  if (text === '') {
    return [];
  }
  const ranges = matchRanges(foldText(text), terms);
  const segments: Segment[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) {
      segments.push({ text: text.slice(at, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    at = end;
  }
  if (at < text.length) {
    segments.push({ text: text.slice(at), match: false });
  }
  return segments;
}

const ELLIPSIS = '…';

// Un fragmento de un texto largo, centrado en la primera coincidencia, con «…» donde se cortó.
export function fragmentOf(text: string, terms: readonly string[], max: number): Segment[] {
  if (text.length <= max) {
    return segmentsOf(text, terms);
  }
  const first = matchRanges(foldText(text), terms)[0];
  const start = first ? Math.max(0, first[0] - Math.floor(max / 3)) : 0;
  const end = Math.min(text.length, start + max);
  const segments = segmentsOf(text.slice(start, end), terms);
  return [
    ...(start > 0 ? [{ text: ELLIPSIS, match: false }] : []),
    ...segments,
    ...(end < text.length ? [{ text: ELLIPSIS, match: false }] : []),
  ];
}

// El texto crudo de las fórmulas (entre signos $) y del código (entre comillas invertidas): va en
// una columna aparte del índice de pedazos, para encontrar «sqrt(n» sin que importe la sintaxis.
export function formulaText(text: string): string {
  const found: string[] = [];
  for (const match of text.matchAll(/\$([^$\n]+)\$|`([^`\n]+)`/gu)) {
    found.push(match[1] ?? match[2] ?? '');
  }
  return found.join('\n');
}

// Para comparar un título con lo escrito: sin tildes, sin mayúsculas y sin signos.
export function plainTitle(text: string): string {
  return foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
