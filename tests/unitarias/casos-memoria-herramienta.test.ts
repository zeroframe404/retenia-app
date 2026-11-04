import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  appendCase,
  casesFile,
  computeCase,
  parseSequence,
  readCases,
  SequenceError,
} from '../../tools/lib/casos-memoria.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

// «Agregá un caso:» (Fase 09, tarea 10): la secuencia en castellano se lee, se calcula con la
// biblioteca, se revisa contra la fórmula publicada y se suma al final de la tabla congelada. Acá
// sobre una copia de la tabla, en una carpeta temporal.

const root = mkdtempSync(join(tmpdir(), 'retenia-casos-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'docs', 'especificacion'), { recursive: true });
copyFileSync(casesFile(ROOT), casesFile(root));

describe('«Agregá un caso:»', () => {
  it('[CA-059] suma la secuencia como un renglón nuevo, con el número que sigue y las fechas calculadas', () => {
    const before = readCases(readFileSync(casesFile(root), 'utf8'));
    const added = appendCase(
      root,
      'tarjeta nueva, La sabía el 15/03, La sabía en su fecha, No la sabía en su fecha',
    );
    const after = readCases(readFileSync(casesFile(root), 'utf8'));
    expect(after).toHaveLength(before.length + 1);
    expect(added.id).toBe(`C${String(before.length + 1).padStart(2, '0')}`);
    expect(after.at(-1)).toEqual({
      id: added.id,
      sequence: 'tarjeta nueva, La sabía el 15/03, La sabía en su fecha, No la sabía en su fecha',
      expected: ['17/03/2027', '28/03/2027', '30/03/2027'],
      memory: '1,5383 · 7,3922',
    });
    // Los renglones de antes no cambian.
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('el mismo caso escrito igual no se agrega dos veces', () => {
    appendCase(root, 'tarjeta nueva, Con dudas el 16/03, La sabía 1 día tarde');
    expect(() =>
      appendCase(root, 'Tarjeta nueva, Con dudas el 16/03, La sabía 1 día tarde.'),
    ).toThrow(SequenceError);
  });
});

describe('lectura de una secuencia en castellano', () => {
  it('entiende los botones, las fechas, los días tarde o antes, el mismo día, la ayuda, «deshacer» y la materia en mantenimiento', () => {
    expect(
      parseSequence(
        'Tarjeta nueva de una materia en mantenimiento, La sabía el 15/03, Con dudas 5 días después de su fecha, No la sabía un día antes con pista de concepto y deshacer',
      ),
    ).toEqual({
      maintenance: true,
      steps: [
        {
          kind: 'review',
          grade: 'good',
          when: { kind: 'date', day: '2027-03-15' },
          help: 'A0',
          defective: false,
        },
        {
          kind: 'review',
          grade: 'hard',
          when: { kind: 'late', days: 5 },
          help: 'A0',
          defective: false,
        },
        {
          kind: 'review',
          grade: 'again',
          when: { kind: 'early', days: 1 },
          help: 'A2',
          defective: false,
        },
        { kind: 'undo' },
      ],
    });
    expect(parseSequence('La sabía, La sabía el mismo día').steps[1]).toMatchObject({
      when: { kind: 'sameDay' },
    });
  });

  it('si no entiende una parte lo dice con esas palabras, sin inventar nada', () => {
    expect(() => parseSequence('tarjeta nueva, La supe el 15/03')).toThrow(
      /No entendí «La supe el 15\/03»/,
    );
    expect(() => parseSequence('tarjeta nueva, La sabía rapidísimo')).toThrow(
      /No entendí «rapidísimo»/,
    );
    expect(() => parseSequence('tarjeta nueva')).toThrow('La secuencia no tiene ningún repaso');
    expect(() => parseSequence('tarjeta nueva, La sabía el 31/02')).toThrow(
      'La fecha «el 31/02» no existe',
    );
    expect(() => computeCase('tarjeta nueva, deshacer, La sabía el 15/03')).toThrow(
      '«Deshacer» sin un repaso antes',
    );
  });
});
