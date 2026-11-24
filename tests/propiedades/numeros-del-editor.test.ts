import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseNumber } from '../../src/core/evaluation';
import { readEditorNumber } from '../../src/renderer/practice/numbers';

// El editor de la ficha (ventana) no puede importar el núcleo: tiene su copia de cómo se lee un
// número. Esta prueba la ata a la regla del núcleo, así el valor que escribís en «Valor» se lee igual
// que una respuesta.

const SEED = 20270315;
const numberLike = fc
  .tuple(
    fc.constantFrom('', '-', '+'),
    fc.array(fc.constantFrom('0', '1', '2', '5', '9', '.', ','), { minLength: 1, maxLength: 12 }),
  )
  .map(([sign, chars]) => `${sign}${chars.join('')}`);

describe('los números del editor', () => {
  it('se leen igual que una respuesta numérica', () => {
    fc.assert(
      fc.property(numberLike, (text) => {
        const parsed = parseNumber(text);
        const expected = parsed === null || parsed.unit !== null ? null : parsed.value;
        expect(readEditorNumber(text)).toBe(expected);
      }),
      { seed: SEED, numRuns: 2000 },
    );
  });

  it('«1.234,5», «1.500», «4,2» y «0.05» se leen como se escriben acá', () => {
    expect(readEditorNumber('1.234,5')).toBe(1234.5);
    expect(readEditorNumber('1.500')).toBe(1500);
    expect(readEditorNumber('4,2')).toBe(4.2);
    expect(readEditorNumber('0.05')).toBe(0.05);
    expect(readEditorNumber('5 kg')).toBeNull();
    expect(readEditorNumber('')).toBeNull();
  });
});
