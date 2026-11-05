import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { projectSession, RETRY_GAP, type SessionEvent } from '../../src/core/session';

// Invariantes de la sesión de estudio (Fase 10) con cientos de sesiones generadas con semilla:
// cada paso es una calificación, saltar, marcar la tarjeta como defectuosa o deshacer.

const SEED = 20270315;

const actionArbitrary = fc.constantFrom('again', 'hard', 'good', 'skip', 'flag', 'undo');
const sessionArbitrary = fc.record({
  size: fc.integer({ min: 1, max: 12 }),
  actions: fc.array(actionArbitrary, { minLength: 0, maxLength: 40 }),
});

function run(size: number, actions: readonly string[], check: (step: Step) => void) {
  const events: SessionEvent[] = [
    {
      kind: 'started',
      sessionId: 's',
      subjectId: 'm',
      studyDay: '2027-03-15',
      activities: Array.from({ length: size }, (_, index) => ({
        activityId: `a${index}`,
        cardId: `c${index}`,
      })),
      deferredSiblingIds: [],
      activeMs: 0,
    },
  ];
  let state = projectSession(events);
  let counter = 0;
  for (const action of actions) {
    const current = state.pending[0];
    let event: SessionEvent | null = null;
    counter += 1;
    if (action === 'undo') {
      event = state.undoable
        ? { kind: 'annulled', reviewId: state.undoable.reviewId, activeMs: 0 }
        : null;
    } else if (!current) {
      event = null;
    } else if (action === 'skip') {
      event = { kind: 'skipped', activityId: current.activityId, activeMs: 0 };
    } else if (action === 'flag') {
      event = { kind: 'flagged', activityId: current.activityId, activeMs: 0 };
    } else {
      const grade = action as 'again' | 'hard' | 'good';
      event = {
        kind: 'graded',
        reviewId: `r${counter}`,
        activityId: current.activityId,
        grade,
        retryActivityId: grade === 'again' && !current.retry ? `v${counter}` : null,
        activeMs: 0,
      };
    }
    if (event === null) {
      continue;
    }
    const before = state;
    events.push(event);
    state = projectSession(events);
    check({ before, after: state, event, size });
  }
}

interface Step {
  before: ReturnType<typeof projectSession>;
  after: ReturnType<typeof projectSession>;
  event: SessionEvent;
  size: number;
}

describe('sesión de estudio: invariantes', () => {
  it('[CA-070] la vuelta de una fallada queda después de al menos otras 3, o al final si quedan menos', () => {
    fc.assert(
      fc.property(sessionArbitrary, ({ size, actions }) => {
        run(size, actions, ({ after, event }) => {
          if (event.kind === 'graded' && event.retryActivityId) {
            const index = after.pending.findIndex(
              (activity) => activity.activityId === event.retryActivityId,
            );
            expect(index).toBe(Math.min(RETRY_GAP, after.pending.length - 1));
          }
        });
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('[CA-070] ninguna tarjeta tiene más de una vuelta y el progreso nunca pasa del total', () => {
    fc.assert(
      fc.property(sessionArbitrary, ({ size, actions }) => {
        run(size, actions, ({ after }) => {
          const all = [...after.pending, ...after.done];
          for (let index = 0; index < size; index += 1) {
            const retries = all.filter(
              (activity) => activity.cardId === `c${index}` && activity.retry,
            );
            expect(retries.length).toBeLessThanOrEqual(1);
          }
          expect(after.progress.total).toBe(size);
          expect(after.progress.done).toBeLessThanOrEqual(size);
          expect(after.progress.done).toBe(after.done.filter((entry) => !entry.retry).length);
        });
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('[CA-067] deshacer la última calificación deja la sesión idéntica a antes de calificar', () => {
    fc.assert(
      fc.property(sessionArbitrary, ({ size, actions }) => {
        const history: ReturnType<typeof projectSession>[] = [];
        run(size, actions, ({ before, after, event }) => {
          if (event.kind === 'graded') {
            history.push(before);
          } else if (event.kind === 'annulled') {
            const previous = history.pop();
            if (previous) {
              expect(after).toEqual(previous);
            }
          } else {
            // Saltar o marcar cortan la pila de deshacer: lo anterior ya no se deshace (y no hay
            // nada para deshacer hasta la próxima calificación).
            expect(after.undoable).toBeNull();
            history.length = 0;
          }
        });
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('[CA-069] cada tarjeta original termina hecha una sola vez cuando la sesión se completa', () => {
    fc.assert(
      fc.property(sessionArbitrary, ({ size, actions }) => {
        run(size, actions, ({ after }) => {
          if (after.complete) {
            const originals = after.done
              .filter((entry) => !entry.retry)
              .map((entry) => entry.cardId);
            expect(new Set(originals).size).toBe(size);
            expect(originals).toHaveLength(size);
          }
        });
      }),
      { seed: SEED, numRuns: 400 },
    );
  });
});
