import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  brakeFor,
  composeSession,
  estimateSeconds,
  maintenanceQuotaMinutes,
  type ReviewCandidate,
} from '../../src/core/load';

// Invariantes de la carga en minutos (Fase 11) con cientos de casos generados con semilla.

const SEED = 20270315;
const RUNS = { seed: SEED, numRuns: 300 };

const minutesArbitrary = fc.constantFrom(5, 10, 25, 45);
const countsArbitrary = fc.record({
  due: fc.integer({ min: 0, max: 400 }),
  fresh: fc.integer({ min: 0, max: 120 }),
  reviewSeconds: fc.integer({ min: 3, max: 60 }),
  newCardSeconds: fc.integer({ min: 20, max: 300 }),
});

function reviews(count: number, postponements = 0): ReviewCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    cardId: `r${String(index).padStart(4, '0')}`,
    recall: 0.4 + (index % 50) * 0.01,
    dueDay: '2027-03-15',
    siblingGroupId: null,
    postponements,
  }));
}

const newIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `n${String(index).padStart(4, '0')}`);

describe('composición de la sesión', () => {
  it('[CA-082] los minutos estimados nunca superan el tiempo elegido más la tolerancia (el cupo de mantenimiento)', () => {
    fc.assert(
      fc.property(
        minutesArbitrary,
        countsArbitrary,
        fc.double({ min: 0, max: 12, noNaN: true }),
        (minutes, counts, backlog) => {
          const plan = composeSession({
            minutes,
            reviews: reviews(counts.due),
            newCards: newIds(counts.fresh),
            brake: brakeFor(backlog),
            reviewSeconds: counts.reviewSeconds,
            newCardSeconds: counts.newCardSeconds,
          });
          expect(plan.estimatedSeconds / 60).toBeLessThanOrEqual(
            minutes + maintenanceQuotaMinutes(minutes) + 1e-9,
          );
        },
      ),
      RUNS,
    );
  });

  it('[CA-085] más atraso nunca da más contenido nuevo', () => {
    fc.assert(
      fc.property(
        minutesArbitrary,
        countsArbitrary,
        fc.double({ min: 0, max: 12, noNaN: true }),
        fc.double({ min: 0, max: 12, noNaN: true }),
        (minutes, counts, a, b) => {
          const [less, more] = a <= b ? [a, b] : [b, a];
          const compose = (backlog: number) =>
            composeSession({
              minutes,
              reviews: reviews(counts.due),
              newCards: newIds(counts.fresh),
              brake: brakeFor(backlog),
              reviewSeconds: counts.reviewSeconds,
              newCardSeconds: counts.newCardSeconds,
            }).newCards.length;
          expect(compose(more)).toBeLessThanOrEqual(compose(less));
        },
      ),
      RUNS,
    );
  });

  it('[CA-080] todo repaso vencido está en la sesión o queda para mañana: ninguno se pierde ni se repite', () => {
    fc.assert(
      fc.property(minutesArbitrary, countsArbitrary, (minutes, counts) => {
        const due = reviews(counts.due);
        const plan = composeSession({
          minutes,
          reviews: due,
          newCards: newIds(counts.fresh),
          brake: brakeFor(0),
          reviewSeconds: counts.reviewSeconds,
          newCardSeconds: counts.newCardSeconds,
        });
        const seen = [...plan.reviews, ...plan.postponed.map((entry) => entry.cardId)];
        expect(new Set(seen).size).toBe(seen.length);
        expect([...seen].sort()).toEqual(due.map((card) => card.cardId).sort());
      }),
      RUNS,
    );
  });

  it('[CA-093] las que ya se aplazaron 3 veces entran siempre, y primero', () => {
    fc.assert(
      fc.property(
        minutesArbitrary,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 200 }),
        (minutes, forcedCount, others) => {
          const forced = reviews(forcedCount, 3).map((card) => ({
            ...card,
            cardId: `f${card.cardId}`,
            recall: 0.99,
          }));
          const plan = composeSession({
            minutes,
            reviews: [...reviews(others), ...forced],
            newCards: [],
            brake: brakeFor(0),
            reviewSeconds: 12,
            newCardSeconds: 60,
          });
          expect(plan.forced.sort()).toEqual(forced.map((card) => card.cardId).sort());
          expect(plan.reviews.slice(0, forcedCount).sort()).toEqual(plan.forced.sort());
        },
      ),
      RUNS,
    );
  });
});

describe('tiempo que tarda un repaso', () => {
  it('[CA-088] la estimación queda siempre entre lo propio y el valor inicial', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.double({ min: 1, max: 120, noNaN: true }),
        fc.double({ min: 1, max: 120, noNaN: true }),
        (count, median, initial) => {
          const estimate = estimateSeconds({ count, medianSeconds: median }, initial);
          const low = Math.min(median, initial);
          const high = Math.max(median, initial);
          expect(estimate).toBeGreaterThanOrEqual(low - 1e-9);
          expect(estimate).toBeLessThanOrEqual(high + 1e-9);
        },
      ),
      RUNS,
    );
  });

  it('[CA-088] con más repasos propios la estimación se acerca a lo propio, nunca se aleja', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 300 }),
        fc.double({ min: 1, max: 120, noNaN: true }),
        (a, b, median) => {
          const [few, many] = a <= b ? [a, b] : [b, a];
          const distance = (n: number) =>
            Math.abs(estimateSeconds({ count: n, medianSeconds: median }, 12) - median);
          expect(distance(many)).toBeLessThanOrEqual(distance(few) + 1e-9);
        },
      ),
      RUNS,
    );
  });
});
