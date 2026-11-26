import { seedNumber } from '../evaluation/random';
import { evaluateFormula, FUNCTION_NAMES, NAME_PATTERN } from './formula';

// Una familia de variantes: enunciados con huecos «{dato}», los datos que cambian (cada uno con sus
// valores posibles) y los datos que salen de una cuenta. La variante número N es siempre la misma
// con la misma semilla, y dos números seguidos dan combinaciones distintas hasta agotar la familia.

interface FamilyParameter {
  readonly name: string;
  readonly values: readonly number[];
}

interface FamilyDerived {
  readonly name: string;
  readonly formula: string;
}

export interface VariantFamily {
  // El primero es el de siempre; los demás son los de la variante (el último escalón de apoyo).
  readonly statements: readonly string[];
  readonly parameters: readonly FamilyParameter[];
  readonly derived: readonly FamilyDerived[];
}

export type VariantValues = Readonly<Record<string, number>>;

export interface Variant {
  readonly n: number;
  readonly values: VariantValues;
}

const MAX_COMBINATIONS = 1_000_000_000;
// Cuántas variantes se prueban al validar (todas, si la familia es chica).
const CHECKED_VARIANTS = 500;

export function variantCount(family: VariantFamily): number {
  return family.parameters.reduce((count, parameter) => count * parameter.values.length, 1);
}

function greatestDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestDivisor(b, a % b);
}

// Una permutación de 0..total-1 que sale de la semilla: (paso × n + inicio) mod total, con un paso
// sin divisores comunes con el total (cerca de su proporción áurea, para que varíen varios datos).
function permuted(total: number, seed: string, n: number): number {
  let step = Math.max(1, Math.floor(total * 0.618));
  while (greatestDivisor(step, total) !== 1) {
    step += 1;
  }
  const start = BigInt(seedNumber(seed));
  return Number((BigInt(n % total) * BigInt(step) + start) % BigInt(total));
}

export function generateVariant(family: VariantFamily, seed: string, n: number): Variant {
  let index = permuted(variantCount(family), seed, n);
  const values: Record<string, number> = {};
  for (const parameter of family.parameters) {
    const length = parameter.values.length;
    values[parameter.name] = parameter.values[index % length] as number;
    index = Math.floor(index / length);
  }
  for (const derived of family.derived) {
    values[derived.name] = evaluateFormula(derived.formula, values);
  }
  return { n, values };
}

// Un número como se escribe acá: coma decimal, hasta 4 decimales y sin ceros de más.
export function formatValue(value: number): string {
  const rounded = Number(value.toFixed(4));
  return String(Object.is(rounded, -0) ? 0 : rounded).replace('.', ',');
}

const PLACEHOLDER = /\{([^{}\s]+)\}/gu;

export function renderTemplate(template: string, values: VariantValues): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    return value === undefined ? whole : formatValue(value);
  });
}

function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
}

export type FamilyProblem =
  | 'statement'
  | 'parameters'
  | 'name'
  | 'repeatedName'
  | 'formula'
  | 'unknownName'
  | 'single'
  | 'tooMany';

const isName = (name: string) =>
  NAME_PATTERN.exec(name)?.[0] === name && !FUNCTION_NAMES.has(name) && !/^paso\d+$/u.test(name);

export function validateFamily(family: VariantFamily): FamilyProblem[] {
  const problems = new Set<FamilyProblem>();
  if (family.statements.length === 0 || family.statements.some((text) => text.trim() === '')) {
    problems.add('statement');
  }
  if (
    family.parameters.length === 0 ||
    family.parameters.some(
      (parameter) =>
        parameter.values.length === 0 || parameter.values.some((v) => !Number.isFinite(v)),
    )
  ) {
    problems.add('parameters');
  }
  const names = [...family.parameters, ...family.derived].map((item) => item.name);
  if (!names.every(isName)) {
    problems.add('name');
  }
  if (new Set(names).size !== names.length) {
    problems.add('repeatedName');
  }
  const known = new Set(names);
  if (family.statements.some((text) => placeholdersOf(text).some((name) => !known.has(name)))) {
    problems.add('unknownName');
  }
  if (problems.size > 0) {
    return [...problems];
  }
  const count = variantCount(family);
  if (count < 2) {
    return ['single'];
  }
  if (count > MAX_COMBINATIONS) {
    return ['tooMany'];
  }
  try {
    for (let n = 0; n < Math.min(count, CHECKED_VARIANTS); n += 1) {
      generateVariant(family, 'check', n);
    }
  } catch {
    return ['formula'];
  }
  return [];
}
