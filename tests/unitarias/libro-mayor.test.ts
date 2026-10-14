import { describe, expect, it } from 'vitest';
import {
  compareCanonical,
  currentEvaluation,
  inCanonicalOrder,
  nextEvaluation,
} from '../../src/core/ledger';

// El libro mayor (docs/modelo-de-datos.md, sección 1): el orden en que se recalcula todo y cuál
// es la evaluación vigente de un intento.

describe('libro mayor: orden canónico de los eventos', () => {
  it('ordena por número de secuencia, no por cómo llegan', () => {
    const events = [
      { id: 'c', seq: 3 },
      { id: 'a', seq: 1 },
      { id: 'b', seq: 2 },
    ];
    expect(inCanonicalOrder(events).map((event) => event.id)).toEqual(['a', 'b', 'c']);
  });

  it('no cambia la lista que recibe', () => {
    const events = [
      { id: 'b', seq: 2 },
      { id: 'a', seq: 1 },
    ];
    inCanonicalOrder(events);
    expect(events.map((event) => event.id)).toEqual(['b', 'a']);
  });

  it('con el mismo número de secuencia desempata por identificador', () => {
    expect(compareCanonical({ id: 'a', seq: 5 }, { id: 'b', seq: 5 })).toBeLessThan(0);
    expect(compareCanonical({ id: 'b', seq: 5 }, { id: 'a', seq: 5 })).toBeGreaterThan(0);
    expect(compareCanonical({ id: 'a', seq: 5 }, { id: 'a', seq: 5 })).toBe(0);
  });
});

describe('libro mayor: evaluaciones versionadas', () => {
  it('sin evaluaciones no hay vigente y la primera es la versión 1, sin enmendar nada', () => {
    expect(currentEvaluation([])).toBeNull();
    expect(nextEvaluation(null)).toEqual({ version: 1, supersedesId: null });
  });

  it('la vigente es la de mayor versión, en cualquier orden', () => {
    const versions = [
      { id: 'v2', version: 2, verdict: 'partial' },
      { id: 'v1', version: 1, verdict: 'correct' },
      { id: 'v3', version: 3, verdict: 'incorrect' },
    ];
    expect(currentEvaluation(versions)?.id).toBe('v3');
  });

  it('enmendar agrega la versión siguiente apuntando a la vigente', () => {
    expect(nextEvaluation({ id: 'v1', version: 1 })).toEqual({ version: 2, supersedesId: 'v1' });
    expect(nextEvaluation({ id: 'v7', version: 7 })).toEqual({ version: 8, supersedesId: 'v7' });
  });
});
