import { describe, expect, it } from 'vitest';
import {
  evaluateFormula,
  formatValue,
  generateVariant,
  renderTemplate,
  type VariantFamily,
  validateFamily,
  variantCount,
} from '../../src/core/variants';

// Las familias de variantes (Fase 18, H-39): una plantilla con parámetros y una fórmula para la
// respuesta. La respuesta de cada variante se calcula, no se escribe a mano.

const FAMILY: VariantFamily = {
  statements: ['Una muestra de {n} datos tiene media {media} y desvío {s}.'],
  parameters: [
    { name: 'media', values: [40, 50, 60] },
    { name: 'n', values: [16, 25, 36, 64] },
    { name: 'ee', values: [0.5, 1, 2] },
  ],
  derived: [{ name: 's', formula: 'ee * raiz(n)' }],
};

describe('las fórmulas', () => {
  it('[CA-164] calcula con las cuatro operaciones, potencias, paréntesis, la raíz y coma o punto decimal', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateFormula('-2 ^ 2', {})).toBe(-4);
    expect(evaluateFormula('2 ^ 3 ^ 2', {})).toBe(512);
    expect(evaluateFormula('1,96 * s / raiz(n)', { s: 8, n: 16 })).toBeCloseTo(3.92, 10);
    expect(evaluateFormula('1.96 × 2', {})).toBeCloseTo(3.92, 10);
    expect(evaluateFormula('sqrt(81) − 1', {})).toBe(8);
    expect(evaluateFormula('redondear(2,456; 1)', {})).toBe(2.5);
    expect(evaluateFormula('max(1; 7; 3) + min(4; 2) + abs(-1)', {})).toBe(10);
  });

  it('una fórmula mal escrita, con un nombre desconocido o sin resultado finito se rechaza', () => {
    expect(() => evaluateFormula('2 +', {})).toThrow();
    expect(() => evaluateFormula('media + 1', {})).toThrow();
    expect(() => evaluateFormula('1 / 0', {})).toThrow();
    expect(() => evaluateFormula('raiz(-1)', {})).toThrow();
    expect(() => evaluateFormula('process.exit(1)', {})).toThrow();
    expect(() => evaluateFormula('constructor', {})).toThrow();
    expect(() => evaluateFormula('toString(1)', {})).toThrow();
  });
});

describe('las variantes', () => {
  it('[CA-164] con la misma semilla y el mismo número sale siempre la misma variante, con sus datos calculados', () => {
    const first = generateVariant(FAMILY, 'semilla', 0);
    expect(generateVariant(FAMILY, 'semilla', 0)).toEqual(first);
    expect(first.values.s).toBeCloseTo((first.values.ee ?? 0) * Math.sqrt(first.values.n ?? 0), 10);
  });

  it('[CA-164] los números de variante seguidos dan combinaciones distintas hasta agotar la familia', () => {
    expect(variantCount(FAMILY)).toBe(36);
    const seen = new Set(
      Array.from({ length: 36 }, (_, n) =>
        JSON.stringify(generateVariant(FAMILY, 'otra', n).values),
      ),
    );
    expect(seen.size).toBe(36);
    // Agotada la familia, vuelve a empezar.
    expect(generateVariant(FAMILY, 'otra', 36).values).toEqual(
      generateVariant(FAMILY, 'otra', 0).values,
    );
  });

  it('el enunciado se arma con los números de la variante, con coma decimal', () => {
    expect(renderTemplate('n = {n}, media {media} y {x}', { n: 16, media: 51.96 })).toBe(
      'n = 16, media 51,96 y {x}',
    );
    expect(formatValue(3.9200000000000004)).toBe('3,92');
    expect(formatValue(1000)).toBe('1000');
    expect(formatValue(-0.5)).toBe('-0,5');
    expect(formatValue(1 / 3)).toBe('0,3333');
  });

  it('una familia con un nombre que no existe, repetido o sin valores no vale', () => {
    expect(validateFamily(FAMILY)).toEqual([]);
    expect(validateFamily({ ...FAMILY, statements: [] })).toContain('statement');
    expect(validateFamily({ ...FAMILY, statements: ['Dato {zz}'] })).toContain('unknownName');
    expect(validateFamily({ ...FAMILY, parameters: [] })).toContain('parameters');
    expect(validateFamily({ ...FAMILY, parameters: [{ name: 'n', values: [] }] })).toContain(
      'parameters',
    );
    expect(
      validateFamily({
        ...FAMILY,
        derived: [{ name: 'n', formula: '1' }],
      }),
    ).toContain('repeatedName');
    expect(validateFamily({ ...FAMILY, derived: [{ name: 's', formula: 'zz * 2' }] })).toContain(
      'formula',
    );
    // Una familia que da una sola combinación no es una familia.
    expect(
      validateFamily({
        statements: ['{n}'],
        parameters: [{ name: 'n', values: [1] }],
        derived: [],
      }),
    ).toContain('single');
  });
});
