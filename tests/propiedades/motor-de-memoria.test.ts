import fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  type CardMemory,
  type Grade,
  type HelpLevel,
  MEMORY_ENGINE_VERSION,
  type MemoryEvent,
  projectCardMemory,
  traceCardMemory,
} from '../../src/core/memory';

// Invariantes del motor de memoria (Fase 09) con cientos de historiales generados con semilla.

const SEED = 20270315;
const DAY_MS = 86_400_000;
const CARD = '01969f1e-0000-7000-8000-00000000beef';
const START = new Date('2027-03-15T10:00:00-03:00').getTime();
const created = new Date(START);

const gradeArbitrary = fc.constantFrom<Grade>('again', 'hard', 'good');
const helpArbitrary = fc.oneof(
  { weight: 6, arbitrary: fc.constant<HelpLevel>('A0') },
  { weight: 1, arbitrary: fc.constantFrom<HelpLevel>('A1', 'A2', 'A3', 'A4') },
);
// Un paso: cuántos días después del anterior (0 = el mismo día), a qué hora (cualquiera: cruza el
// corte de las 04:00 y las 21:00, cuando cambia el día en UTC) y cómo salió.
const stepArbitrary = fc.record({
  gapDays: fc.integer({ min: 0, max: 45 }),
  minutes: fc.integer({ min: 0, max: 24 * 60 - 1 }),
  grade: gradeArbitrary,
  helpLevel: helpArbitrary,
  interrupted: fc.oneof(
    { weight: 12, arbitrary: fc.constant(false) },
    { weight: 1, arbitrary: fc.constant(true) },
  ),
});
type Step = typeof stepArbitrary extends fc.Arbitrary<infer T> ? T : never;

// Los pasos empiezan el 15/03/2027 a las 00:00 de Buenos Aires.
const MIDNIGHT = new Date('2027-03-15T00:00:00-03:00').getTime();
function eventsOf(steps: readonly Step[], fuzz = false): MemoryEvent[] {
  let day = 0;
  return steps.map((step, index) => {
    day += step.gapDays;
    return {
      kind: 'review',
      id: `r${String(index).padStart(3, '0')}`,
      seq: index + 1,
      occurredAt: new Date(MIDNIGHT + day * DAY_MS + step.minutes * 60_000),
      grade: step.grade,
      helpLevel: step.helpLevel,
      interrupted: step.interrupted,
      fuzz,
    };
  });
}

function project(events: readonly MemoryEvent[], retention = 0.9): CardMemory {
  return projectCardMemory(
    { cardId: CARD, createdAt: created, events },
    { retention },
    MEMORY_ENGINE_VERSION,
  );
}

const same = (a: CardMemory, b: CardMemory) => JSON.stringify(a) === JSON.stringify(b);

// Un repaso más, el día `day` (en días desde el 15/03/2027) a las 10:00.
function reviewAt(events: readonly MemoryEvent[], day: number, grade: Grade, fuzz = false) {
  const seq = events.length + 1;
  return {
    kind: 'review' as const,
    id: `x${String(seq).padStart(3, '0')}`,
    seq,
    occurredAt: new Date(START + day * DAY_MS),
    grade,
    helpLevel: 'A0' as const,
    fuzz,
  };
}
const dayOf = (instant: Date) => Math.round((instant.getTime() - START) / DAY_MS);

describe('motor de memoria: invariantes con cualquier historial', () => {
  it('[CA-062] recalcular desde cero con los eventos cargados en cualquier orden da lo mismo', () => {
    fc.assert(
      fc.property(
        fc
          .array(stepArbitrary, { minLength: 1, maxLength: 25 })
          .chain((steps) => {
            const events = eventsOf(steps);
            // Algunos repasos se anulan después.
            return fc.subarray(events.map((event) => event.id)).map((annulled) => [
              ...events,
              ...annulled.map(
                (reviewId, index): MemoryEvent => ({
                  kind: 'annulled',
                  id: `a${String(index).padStart(3, '0')}`,
                  seq: events.length + index + 1,
                  reviewId,
                }),
              ),
            ]);
          })
          .chain((events) =>
            fc.tuple(
              fc.constant(events),
              fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }),
            ),
          ),
        ([events, shuffled]) => same(project(events), project(shuffled)),
      ),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('la estabilidad nunca baja después de un acierto sin ayuda', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { minLength: 1, maxLength: 30 }), (steps) => {
        const trace = traceCardMemory(
          { cardId: CARD, createdAt: created, events: eventsOf(steps) },
          { retention: 0.9 },
        );
        let previous: number | null = null;
        for (const step of trace.steps) {
          if (!step.counted) {
            continue;
          }
          if (
            previous !== null &&
            step.engineGrade === 'good' &&
            step.helpLevel === 'A0' &&
            step.stability < previous
          ) {
            return false;
          }
          previous = step.stability;
        }
        return true;
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('[CA-061] un repaso tardío acertado nunca programa antes que uno acertado en su fecha', () => {
    fc.assert(
      fc.property(
        fc.array(stepArbitrary, { minLength: 1, maxLength: 15 }),
        fc.integer({ min: 1, max: 60 }),
        fc.constantFrom<Grade>('good', 'hard'),
        (steps, delay, grade) => {
          const events = eventsOf(steps);
          const memory = project(events);
          if (memory.lastReviewAt === null) {
            return true;
          }
          const due = dayOf(memory.dueAt);
          const onTime = project([...events, reviewAt(events, due, grade)]);
          const late = project([...events, reviewAt(events, due + delay, grade)]);
          return late.dueAt.getTime() >= onTime.dueAt.getTime() && late.lapses === onTime.lapses;
        },
      ),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('[CA-063] anular un repaso y rehacerlo igual deja el estado idéntico, con o sin variación al azar', () => {
    fc.assert(
      fc.property(
        fc.array(stepArbitrary, { maxLength: 15 }),
        fc.integer({ min: 0, max: 40 }),
        gradeArbitrary,
        fc.boolean(),
        (steps, wait, grade, fuzz) => {
          const events = eventsOf(steps, fuzz);
          const last = events.at(-1);
          const day = (last ? dayOf(last.kind === 'review' ? last.occurredAt : created) : 0) + wait;
          const done = reviewAt(events, day, grade, fuzz);
          const withReview = [...events, done];
          const annulled: MemoryEvent = {
            kind: 'annulled',
            id: 'z-anula',
            seq: withReview.length + 1,
            reviewId: done.id,
          };
          const redone = {
            ...done,
            id: 'z-rehace',
            seq: withReview.length + 2,
          };
          return (
            same(project([...events, done, annulled]), project(events)) &&
            same(project([...events, done, annulled, redone]), project(withReview))
          );
        },
      ),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('[CA-060] a menor retención objetivo, intervalo mayor o igual', () => {
    fc.assert(
      fc.property(
        fc.array(stepArbitrary, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 70, max: 96 }),
        fc.integer({ min: 1, max: 20 }),
        (steps, lowPercent, step) => {
          const low = lowPercent / 100;
          const high = Math.min(0.97, (lowPercent + step) / 100);
          const events = eventsOf(steps);
          return project(events, low).dueAt.getTime() >= project(events, high).dueAt.getTime();
        },
      ),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('después de cualquier historial la tarjeta vuelve al menos un día después de su último repaso', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { minLength: 1, maxLength: 30 }), (steps) => {
        const memory = project(eventsOf(steps));
        if (memory.lastReviewAt === null) {
          return true;
        }
        return (
          memory.dueAt.getTime() - memory.lastReviewAt.getTime() >= DAY_MS &&
          memory.stability > 0 &&
          memory.difficulty >= 1 &&
          memory.difficulty <= 10
        );
      }),
      { seed: SEED, numRuns: 400 },
    );
  });
});
