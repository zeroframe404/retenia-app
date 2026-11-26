import { normalizeShortAnswer } from '../evaluation';

// La tarjeta de contraste (CA-163): «¿En qué se diferencian la media y la mediana?». Los dos
// conceptos salen de lo que contestaste y de la respuesta correcta, si los dos son cortos; si no,
// no se adivinan: los escribís vos.

const MAX_CONCEPT = 60;
const ARTICLE = /^(?:La|El|Los|Las|Un|Una)\s/u;

export function conceptName(text: string): string | null {
  const clean = text
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.!;:]+$/u, '')
    .trim();
  if (clean === '' || Array.from(clean).length > MAX_CONCEPT) {
    return null;
  }
  return ARTICLE.test(clean)
    ? `${clean.charAt(0).toLocaleLowerCase('es')}${clean.slice(1)}`
    : clean;
}

export function conceptPair(written: string, correct: string): [string, string] | null {
  const first = conceptName(written);
  const second = conceptName(correct);
  if (first === null || second === null) {
    return null;
  }
  return normalizeShortAnswer(first) === normalizeShortAnswer(second) ? null : [first, second];
}
