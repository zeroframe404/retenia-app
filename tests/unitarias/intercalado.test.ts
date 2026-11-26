import { describe, expect, it } from 'vitest';
import {
  buildInterleavedSet,
  eligibleTypes,
  type ProblemType,
  setProblems,
  statementNamesType,
} from '../../src/core/interleave';

// El conjunto intercalado (Fase 18, CA-162): de 2 a 5 tipos que se confunden, nunca dos seguidos del
// mismo tipo, sin enunciados que nombren el tipo, solo con tipos ya practicados por separado y sin
// mezclar materias.

const TYPES: ProblemType[] = [
  { id: 'media', name: 'Media', cardIds: ['m1', 'm2', 'm3'] },
  { id: 'mediana', name: 'Mediana', cardIds: ['d1', 'd2', 'd3'] },
  { id: 'moda', name: 'Moda', cardIds: ['o1', 'o2', 'o3'] },
];

const typeOf = (cardId: string) => TYPES.find((type) => type.cardIds.includes(cardId))?.id ?? '';

describe('el conjunto intercalado', () => {
  it('[CA-162] con media, mediana y moda salen 9 problemas, 3 de cada tipo, sin dos seguidos del mismo tipo', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const set = buildInterleavedSet(TYPES, seed);
      expect(set).toHaveLength(9);
      expect(new Set(set.map((item) => item.cardId)).size).toBe(9);
      for (const item of set) {
        expect(item.typeId).toBe(typeOf(item.cardId));
      }
      set.slice(1).forEach((item, index) => {
        expect(item.typeId).not.toBe(set[index]?.typeId);
      });
      for (const type of TYPES) {
        expect(set.filter((item) => item.typeId === type.id)).toHaveLength(3);
      }
    }
  });

  it('[CA-162] la misma semilla arma el mismo conjunto y otra semilla, otro orden', () => {
    expect(buildInterleavedSet(TYPES, 'x')).toEqual(buildInterleavedSet(TYPES, 'x'));
    const orders = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) =>
        JSON.stringify(buildInterleavedSet(TYPES, seed)),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('si un tipo tiene muchos más problemas que los demás, entran menos para no dejar dos seguidos', () => {
    const set = buildInterleavedSet(
      [
        { id: 'a', name: 'A', cardIds: ['a1', 'a2', 'a3'] },
        { id: 'b', name: 'B', cardIds: ['b1'] },
      ],
      's',
    );
    expect(set.map((item) => item.typeId)).toEqual(['a', 'b', 'a']);
  });

  it('[CA-162] reconoce un enunciado que nombra un tipo, sin mayúsculas ni tildes y como palabra entera', () => {
    const names = ['Media', 'Mediana', 'Moda'];
    expect(statementNamesType('Calculá la MEDIA de estos datos', names)).toBe('Media');
    expect(statementNamesType('¿Cuál es la médiana?', names)).toBe('Mediana');
    expect(statementNamesType('El sueldo del medio, a medias', names)).toBeNull();
    expect(statementNamesType('¿Qué talle se pidió más?', names)).toBeNull();
    // Un nombre de varias palabras se busca entero.
    expect(statementNamesType('Hacé una prueba t de una muestra', ['Prueba t'])).toBe('Prueba t');
  });

  it('solo entran los tipos que ya practicaste por separado', () => {
    expect(eligibleTypes(TYPES, new Set(['m2', 'o1'])).map((type) => type.id)).toEqual([
      'media',
      'moda',
    ]);
  });

  it('un conjunto necesita de 2 a 5 tipos con problemas, todos de la misma materia y sin enunciados que nombren el tipo', () => {
    const subjects = new Map(TYPES.flatMap((t) => t.cardIds).map((id) => [id, 'est']));
    const statements = new Map(TYPES.flatMap((t) => t.cardIds).map((id) => [id, `¿Cuánto? ${id}`]));
    expect(setProblems(TYPES, { subjects, statements })).toEqual([]);
    expect(setProblems(TYPES.slice(0, 1), { subjects, statements })).toContain('typeCount');
    expect(
      setProblems([...TYPES, ...['x', 'y', 'z'].map((id) => ({ id, name: id, cardIds: [id] }))], {
        subjects,
        statements,
      }),
    ).toContain('typeCount');
    expect(
      setProblems([{ ...(TYPES[0] as ProblemType), cardIds: [] }, TYPES[1] as ProblemType], {
        subjects,
        statements,
      }),
    ).toContain('emptyType');
    expect(
      setProblems(TYPES, {
        subjects: new Map([...subjects, ['o1', 'historia']]),
        statements,
      }),
    ).toContain('subjects');
    expect(
      setProblems(TYPES, {
        subjects,
        statements: new Map([...statements, ['d2', 'Calculá la mediana']]),
      }),
    ).toContain('namesType');
    expect(
      setProblems([TYPES[0] as ProblemType, { id: 'otra', name: ' media ', cardIds: ['d1'] }], {
        subjects,
        statements,
      }),
    ).toContain('repeatedName');
  });
});
