import type { Verdict } from '../memory';

// Respuesta corta (CA-131): se comparan sin mayúsculas, tildes, diéresis ni espacios; la ñ es una
// letra y se respeta. Si no coincide, la diferencia letra por letra contra la referencia o la
// variante más parecida.

// Las marcas que se combinan con una letra (tildes, diéresis y demás) ocupan este rango.
const FIRST_MARK = 0x300;
const LAST_MARK = 0x36f;
const TILDE = 0x303;

function withoutMarks(decomposed: string): string {
  let out = '';
  let previous = '';
  for (const char of decomposed) {
    const code = char.codePointAt(0) ?? 0;
    if (code < FIRST_MARK || code > LAST_MARK) {
      out += char;
      previous = char;
    } else if (code === TILDE && previous === 'n') {
      // La ñ es una letra: n con su virgulilla.
      out = `${out.slice(0, -1)}ñ`;
      previous = 'ñ';
    }
  }
  return out;
}

// Una letra o un texto sin lo que no cuenta.
export function normalizeShortAnswer(text: string): string {
  return withoutMarks(text.toLocaleLowerCase('es').normalize('NFD'))
    .replace(/\s+/gu, '')
    .normalize('NFC');
}

export type DiffStep =
  | { readonly op: 'same' | 'changed'; readonly written: string; readonly expected: string }
  | { readonly op: 'extra'; readonly written: string; readonly expected: null }
  | { readonly op: 'missing'; readonly written: null; readonly expected: string };

const lettersOf = (text: string) => Array.from(text.normalize('NFC'));

// Alinea lo escrito con lo esperado con la menor cantidad de cambios: igual, cambiada, sobrante o
// faltante. Sobre las letras originales, para mostrarlas como se escribieron.
export function letterDiff(written: string, expected: string): DiffStep[] {
  const a = lettersOf(written);
  const b = lettersOf(expected);
  const keyA = a.map(normalizeShortAnswer);
  const keyB = b.map(normalizeShortAnswer);
  const rows = a.length + 1;
  const cols = b.length + 1;
  // cost[i][j]: lo que cuesta alinear lo que queda desde i (escrito) y desde j (esperado).
  const cost: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const at = (i: number, j: number) => cost[i]?.[j] ?? 0;
  for (let i = a.length; i >= 0; i -= 1) {
    for (let j = b.length; j >= 0; j -= 1) {
      const row = cost[i] as number[];
      if (i === a.length) {
        row[j] = b.length - j;
      } else if (j === b.length) {
        row[j] = a.length - i;
      } else {
        const same = keyA[i] === keyB[j] ? 0 : 1;
        row[j] = Math.min(at(i + 1, j + 1) + same, at(i + 1, j) + 1, at(i, j + 1) + 1);
      }
    }
  }
  const steps: DiffStep[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const here = at(i, j);
    const letterA = a[i];
    const letterB = b[j];
    if (letterA !== undefined && letterB !== undefined) {
      if (keyA[i] === keyB[j] && here === at(i + 1, j + 1)) {
        steps.push({ op: 'same', written: letterA, expected: letterB });
        i += 1;
        j += 1;
        continue;
      }
      if (here === at(i + 1, j + 1) + 1) {
        steps.push({ op: 'changed', written: letterA, expected: letterB });
        i += 1;
        j += 1;
        continue;
      }
    }
    if (letterA !== undefined && (letterB === undefined || here === at(i + 1, j) + 1)) {
      steps.push({ op: 'extra', written: letterA, expected: null });
      i += 1;
      continue;
    }
    steps.push({ op: 'missing', written: null, expected: letterB ?? '' });
    j += 1;
  }
  return steps;
}

function distance(a: string, b: string): number {
  return letterDiff(a, b).filter((step) => step.op !== 'same').length;
}

export interface ShortResult {
  readonly verdict: Verdict;
  // La referencia o variante con que coincidió (nula si no coincidió).
  readonly matched: string | null;
  // La más parecida, contra la que se muestra la diferencia.
  readonly closest: string;
  readonly diff: readonly DiffStep[];
}

// `accepted`: la respuesta de referencia primero y después las variantes aceptables.
export function evaluateShort(written: string, accepted: readonly string[]): ShortResult {
  const key = normalizeShortAnswer(written);
  const candidates = accepted.filter((text) => normalizeShortAnswer(text) !== '');
  const matched =
    key === '' ? undefined : candidates.find((text) => normalizeShortAnswer(text) === key);
  if (matched !== undefined) {
    return { verdict: 'correct', matched, closest: matched, diff: letterDiff(written, matched) };
  }
  let closest = candidates[0] ?? '';
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const d = distance(normalizeShortAnswer(written), normalizeShortAnswer(candidate));
    if (d < best) {
      best = d;
      closest = candidate;
    }
  }
  return { verdict: 'incorrect', matched: null, closest, diff: letterDiff(written, closest) };
}
