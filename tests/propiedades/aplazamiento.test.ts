import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// Aplazar no cambia la memoria (Fase 11, H-22): con una base real y el elenco, cualquier secuencia
// de «Posponer» (más tarde hoy, mañana o un día elegido, con cualquiera de los cuatro tiempos) deja
// igual la agenda de cada tarjeta y no agrega ni un repaso calificado.

afterEach(closeSpaces);

const SEED = 20270315;
let turn = 0;
const requestId = () => {
  turn += 1;
  return `01969f1e-0000-4000-8000-${String(turn + 9000).padStart(12, '0')}`;
};

const stepArbitrary = fc.record({
  minutes: fc.constantFrom(5, 10, 25, 45),
  when: fc.constantFrom('later', 'tomorrow', 'day'),
});

describe('aplazar', () => {
  it('[CA-091] no cambia la memoria: la agenda de cada tarjeta y los repasos calificados quedan iguales', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { minLength: 1, maxLength: 4 }), (steps) => {
        // El elenco sembrado con el reloj de la demostración: una copia del que se sembró una vez
        // (lo mismo que sembrar acá las materias y las tarjetas).
        const { workspace, file } = openSpace({ withCast: 'tarjetas' });
        const schedule = () => readRows(file, 'SELECT * FROM card_schedule ORDER BY card_id');
        const graded = () =>
          readRows(file, "SELECT id FROM observations WHERE kind = 'review.graded' ORDER BY seq");
        const before = { schedule: schedule(), graded: graded() };
        for (const step of steps) {
          workspace.study.postpone({
            requestId: requestId(),
            minutes: step.minutes,
            when: step.when,
            ...(step.when === 'day' ? { day: '2027-03-22' } : {}),
          });
        }
        expect(schedule()).toEqual(before.schedule);
        expect(graded()).toEqual(before.graded);
        closeSpaces();
      }),
      { seed: SEED, numRuns: 8 },
    );
  }, 120_000);
});
