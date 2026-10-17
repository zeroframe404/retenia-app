import fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  DEFAULT_RETENTION,
  type Grade,
  type MemoryEvent,
  newCardMemory,
  projectCardMemory,
  reviewCard,
} from '../../src/core/memory';

const SEED = 20270315;
const HOUR_MS = 3_600_000;
const START = new Date('2027-03-15T10:00:00-03:00').getTime();
const CONFIG = { retention: DEFAULT_RETENTION };

// Repasos registrados uno detrás de otro. La hora puede ir para atrás (reloj de la PC atrasado,
// «Restablecer fecha»): el orden lo da el número de secuencia.
const stepsArbitrary = fc.array(
  fc.record({
    grade: fc.constantFrom<Grade>('again', 'hard', 'good'),
    hours: fc.integer({ min: -24 * 10, max: 24 * 60 }),
  }),
  { minLength: 1, maxLength: 25 },
);

function eventsOf(steps: { grade: Grade; hours: number }[]): MemoryEvent[] {
  let at = START;
  return steps.map((step, index) => {
    at += step.hours * HOUR_MS;
    return {
      kind: 'review',
      id: `r${String(index).padStart(3, '0')}`,
      seq: index + 1,
      occurredAt: new Date(at),
      grade: step.grade,
    };
  });
}

const sameMemory = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe('proyección: recalcular desde el historial', () => {
  it('[CA-016] reconstruir con los eventos en cualquier orden de entrada da el mismo estado', () => {
    fc.assert(
      fc.property(
        stepsArbitrary.chain((steps) => {
          const events = eventsOf(steps);
          return fc.tuple(
            fc.constant(events),
            fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }),
          );
        }),
        ([events, shuffled]) => {
          const created = new Date(START);
          return sameMemory(
            projectCardMemory({ createdAt: created, events }, CONFIG, 1),
            projectCardMemory({ createdAt: created, events: shuffled }, CONFIG, 1),
          );
        },
      ),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('[CA-016] recalcular de cero da lo mismo que haber repasado uno por uno en el momento', () => {
    fc.assert(
      fc.property(stepsArbitrary, (steps) => {
        const created = new Date(START);
        const events = eventsOf(steps);
        let live = newCardMemory(created);
        for (const event of events) {
          if (event.kind === 'review') {
            live = reviewCard(live, event.grade, event.occurredAt, CONFIG.retention);
          }
        }
        return sameMemory(live, projectCardMemory({ createdAt: created, events }, CONFIG, 1));
      }),
      { seed: SEED, numRuns: 300 },
    );
  });
});
