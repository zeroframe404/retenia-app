import fc from 'fast-check';
import { describe, it } from 'vitest';
import { type Grade, newCardMemory, reviewCard } from '../../src/core/memory';

const SEED = 20270315;
const DAY_MS = 86_400_000;
const START = new Date('2027-03-15T10:00:00-03:00').getTime();

const gradeArbitrary = fc.constantFrom<Grade>('again', 'hard', 'good');
const stepArbitrary = fc.record({
  grade: gradeArbitrary,
  waitHours: fc.integer({ min: 1, max: 24 * 120 }),
});

describe('memoria: invariantes con cualquier historial de repasos', () => {
  it('después de cualquier repaso la tarjeta vuelve al menos un día más tarde y cuenta un repaso más', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { minLength: 1, maxLength: 40 }), (steps) => {
        let now = START;
        let card = newCardMemory(new Date(now));
        for (const [index, step] of steps.entries()) {
          now += step.waitHours * 3_600_000;
          card = reviewCard(card, step.grade, new Date(now));
          if (card.dueAt.getTime() - now < DAY_MS) return false;
          if (card.reps !== index + 1) return false;
          if (!(card.stability > 0) || !(card.difficulty >= 1 && card.difficulty <= 10)) {
            return false;
          }
        }
        return true;
      }),
      { seed: SEED, numRuns: 500 },
    );
  });

  it('el mismo historial da siempre el mismo estado (sin azar)', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { minLength: 1, maxLength: 20 }), (steps) => {
        const replay = () => {
          let now = START;
          let card = newCardMemory(new Date(now));
          for (const step of steps) {
            now += step.waitHours * 3_600_000;
            card = reviewCard(card, step.grade, new Date(now));
          }
          return JSON.stringify(card);
        };
        const first = replay();
        const second = replay();
        return first === second;
      }),
      { seed: SEED, numRuns: 200 },
    );
  });

  it('«La sabía» repetida, esperando hasta el vencimiento, nunca acorta el intervalo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 12 }), (rounds) => {
        let card = newCardMemory(new Date(START));
        let now = START;
        let previousInterval = 0;
        for (let round = 0; round < rounds; round++) {
          card = reviewCard(card, 'good', new Date(now));
          const interval = card.dueAt.getTime() - now;
          if (interval < previousInterval) return false;
          previousInterval = interval;
          now = card.dueAt.getTime();
        }
        return true;
      }),
      { seed: SEED, numRuns: 50 },
    );
  });
});
