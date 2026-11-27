import { parseNumber } from '../evaluation/numeric';

// Los números citados (Fase 19, CA-177): lo que la IA dice «según tu material» no puede traer un
// número que no esté en el fragmento. Se leen como los lee Retenia en los ejercicios: coma o punto,
// «1.500» es mil quinientos; el «%» y las unidades no cuentan. Antes se pasa todo a NFKC (los
// dígitos de ancho completo, «３００», son 300; un exponente, «10⁶», queda «106» y no se confunde
// con 10). Un número que no se sabe leer («2.1.3», «1,5,7») solo pasa si está igual en el pasaje.

const CANDIDATE = /[+\-−]?\p{Nd}[\p{Nd}.,]*/gu;

// Cada número escrito en el texto, sin el punto o la coma del final (son de la oración).
function numberTokens(text: string): string[] {
  return [...text.normalize('NFKC').matchAll(CANDIDATE)].map(([raw]) => raw.replace(/[.,]+$/u, ''));
}

export function numbersIn(text: string): number[] {
  return numberTokens(text).flatMap((token) => {
    const parsed = parseNumber(token);
    return parsed === null ? [] : [parsed.value];
  });
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

// Cada número de la afirmación está en el texto de origen: escrito igual o, si se sabe leer, con el
// mismo valor.
export function numbersAgree(claim: string, source: string): boolean {
  const written = new Set(numberTokens(source));
  const available = numbersIn(source);
  return numberTokens(claim).every((token) => {
    if (written.has(token)) {
      return true;
    }
    const parsed = parseNumber(token);
    return parsed !== null && available.some((other) => same(parsed.value, other));
  });
}
