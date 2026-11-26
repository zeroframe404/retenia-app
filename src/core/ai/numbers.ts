import { parseNumber } from '../evaluation/numeric';

// Los números citados (Fase 19, CA-177): lo que la IA dice «según tu material» no puede traer un
// número que no esté en el fragmento. Se leen como los lee Retenia en los ejercicios: coma o punto,
// «1.500» es mil quinientos; el «%» y las unidades no cuentan.

const CANDIDATE = /[+\-−]?\d[\d.,]*/gu;

export function numbersIn(text: string): number[] {
  const found: number[] = [];
  for (const [raw] of text.matchAll(CANDIDATE)) {
    // El punto o la coma del final son de la oración, no del número.
    const parsed = parseNumber(raw.replace(/[.,]+$/u, ''));
    if (parsed !== null) {
      found.push(parsed.value);
    }
  }
  return found;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

// Cada número de la afirmación está en el texto de origen.
export function numbersAgree(claim: string, source: string): boolean {
  const available = numbersIn(source);
  return numbersIn(claim).every((value) => available.some((other) => same(value, other)));
}
