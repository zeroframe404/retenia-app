import type { Verdict } from '../memory';
import { normalizeShortAnswer } from './short';

// Numérica (CA-132): se acepta coma o punto. Con una sola clase de marca, si aparece una vez es la
// decimal y si aparece varias son de miles (de a tres cifras); un solo punto seguido de exactamente
// tres cifras también es de miles, como se escribe acá («1.500» es mil quinientos). Con las dos, la
// última es la decimal. Margen absoluto e inclusivo; la unidad es opcional y, si se escribe, tiene que ser la
// pedida.

export interface ParsedNumber {
  readonly value: number;
  readonly unit: string | null;
}

const SIGNS = new Set(['+', '-', '−']);
const NUMBER_CHARS = /^[0-9.,]+/;

function groupsAreThousands(integer: string, separator: string): boolean {
  const groups = integer.split(separator);
  const [first, ...rest] = groups;
  return (
    first !== undefined &&
    /^[0-9]{1,3}$/.test(first) &&
    rest.length > 0 &&
    rest.every((group) => /^[0-9]{3}$/.test(group))
  );
}

function readDigits(text: string): number | null {
  const dots = text.split('.').length - 1;
  const commas = text.split(',').length - 1;
  let integer = text;
  let fraction = '';
  if (dots > 0 && commas > 0) {
    const decimal = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    const at = text.lastIndexOf(decimal);
    if (text.split(decimal).length - 1 !== 1) {
      return null;
    }
    integer = text.slice(0, at);
    fraction = text.slice(at + 1);
    if (!groupsAreThousands(integer, thousands)) {
      return null;
    }
    integer = integer.split(thousands).join('');
  } else if (dots + commas === 1) {
    const at = Math.max(text.indexOf('.'), text.indexOf(','));
    integer = text.slice(0, at);
    fraction = text.slice(at + 1);
    if (dots === 1 && fraction.length === 3 && /^[1-9][0-9]{0,2}$/.test(integer)) {
      integer += fraction;
      fraction = '';
    }
  } else if (dots + commas > 1) {
    const separator = dots > 0 ? '.' : ',';
    if (!groupsAreThousands(text, separator)) {
      return null;
    }
    integer = text.split(separator).join('');
  }
  if (!/^[0-9]*$/.test(integer) || !/^[0-9]*$/.test(fraction) || integer + fraction === '') {
    return null;
  }
  return Number(`${integer === '' ? '0' : integer}.${fraction === '' ? '0' : fraction}`);
}

export function parseNumber(raw: string): ParsedNumber | null {
  let text = raw.trim();
  let negative = false;
  const first = text.charAt(0);
  if (SIGNS.has(first)) {
    negative = first !== '+';
    text = text.slice(1);
  }
  const digits = NUMBER_CHARS.exec(text)?.[0];
  if (digits === undefined) {
    return null;
  }
  const value = readDigits(digits);
  const rest = text.slice(digits.length).trim();
  if (value === null || /[0-9]/.test(rest) || SIGNS.has(rest.charAt(0))) {
    return null;
  }
  return { value: negative ? -value : value, unit: rest === '' ? null : rest };
}

const unitKey = (unit: string) => unit.toLocaleLowerCase('es').replace(/\s+/gu, '');

export interface NumericSpec {
  readonly value: number;
  readonly tolerance: number;
  readonly unit: string | null;
}

export interface NumericResult {
  readonly verdict: Verdict;
  // Lo que se leyó (nulo si no se reconoció un número).
  readonly value: number | null;
  readonly unit: string | null;
  // Por qué no: no se reconoció un número, la unidad no es la pedida o está fuera del margen.
  readonly reason: 'unreadable' | 'unit' | 'off' | null;
}

function within(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance + 1e-9 * Math.max(1, Math.abs(target));
}

// `variants`: los valores aceptados además del de la ficha, escritos como texto.
export function evaluateNumeric(
  raw: string,
  spec: NumericSpec,
  variants: readonly string[],
): NumericResult {
  // Una variante aceptada tal cual («Mi respuesta era correcta») vale aunque traiga otra unidad o no
  // sea un número.
  const key = normalizeShortAnswer(raw);
  if (key !== '' && variants.some((variant) => normalizeShortAnswer(variant) === key)) {
    const accepted = parseNumber(raw);
    return {
      verdict: 'correct',
      value: accepted?.value ?? null,
      unit: accepted?.unit ?? null,
      reason: null,
    };
  }
  const parsed = parseNumber(raw);
  if (parsed === null) {
    return { verdict: 'incorrect', value: null, unit: null, reason: 'unreadable' };
  }
  const { value, unit } = parsed;
  if (unit !== null && (spec.unit === null || unitKey(unit) !== unitKey(spec.unit))) {
    return { verdict: 'incorrect', value, unit, reason: 'unit' };
  }
  const targets = [
    spec.value,
    ...variants.flatMap((variant) => {
      const accepted = parseNumber(variant);
      return accepted === null ? [] : [accepted.value];
    }),
  ];
  const ok = targets.some((target) => within(value, target, spec.tolerance));
  return { verdict: ok ? 'correct' : 'incorrect', value, unit, reason: ok ? null : 'off' };
}
