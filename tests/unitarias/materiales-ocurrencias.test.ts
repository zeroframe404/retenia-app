import { describe, expect, it } from 'vitest';
import { applyCorrections, blockKey, occurrenceKeys } from '../../src/core/materials/corrections';

// Dos bloques con el mismo texto en una página (revisión independiente de la Fase 14): cada
// corrección tiene que ir al bloque que se corrigió, no a otro igual.

describe('bloques con el mismo texto', () => {
  it('[CA-116] la clave suma el número de aparición: la primera es la de siempre y la segunda es otra', () => {
    const keys = occurrenceKeys([
      { unit: 1, type: 'paragraph', base: 'igual' },
      { unit: 1, type: 'paragraph', base: 'otro' },
      { unit: 1, type: 'paragraph', base: 'igual' },
      { unit: 2, type: 'paragraph', base: 'igual' },
    ]);
    expect(keys[0]).toBe(blockKey('paragraph', 'igual'));
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).toBe(blockKey('paragraph', 'igual'));
  });

  it('[CA-116] cada corrección va al bloque de su aparición, aunque se corrija primero la segunda', () => {
    const twins = [
      { unit: 1, type: 'paragraph', base: 'igual' },
      { unit: 1, type: 'paragraph', base: 'igual' },
    ] as const;
    const keys = occurrenceKeys(twins);
    const result = applyCorrections(twins, [
      { id: 'b', unit: 1, key: keys[1] as string, before: 'igual', after: 'dos' },
    ]);
    expect(result.texts).toEqual(['igual', 'dos']);
    expect(result.outcomes).toEqual({ b: 'applied' });
  });

  it('[CA-116] las dos juntas conviven', () => {
    const twins = [
      { unit: 1, type: 'paragraph', base: 'igual' },
      { unit: 1, type: 'paragraph', base: 'igual' },
    ] as const;
    const keys = occurrenceKeys(twins);
    const result = applyCorrections(twins, [
      { id: 'a', unit: 1, key: keys[0] as string, before: 'igual', after: 'uno' },
      { id: 'b', unit: 1, key: keys[1] as string, before: 'igual', after: 'dos' },
    ]);
    expect(result.texts).toEqual(['uno', 'dos']);
  });
});
