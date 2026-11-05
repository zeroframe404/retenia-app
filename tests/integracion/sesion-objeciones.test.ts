import { afterEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../src/core/clock';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import { inBuenosAires } from '../apoyo/fechas';

// Lo que encontró el revisor independiente de la Fase 10, contra una base real: la vuelta de una
// fallada después de las 04:00, la regla de los 4 fallos con vueltas, repasar una «En revisión»,
// deshacer la última, deshacer repetido y continuar una sesión de ayer.

afterEach(closeSpaces);

let ids = 0;
const id = () => {
  ids += 1;
  return `01969f1e-0000-4000-8000-${String(ids).padStart(12, '0')}`;
};

// Un reloj que se pone en cualquier instante (para cruzar el corte de las 04:00).
function settableClock(start: Date) {
  let now = start;
  const clock: Clock = { now: () => new Date(now.getTime()) };
  return {
    clock,
    set: (instant: Date) => {
      now = instant;
    },
  };
}

function seeded(clock?: Clock) {
  const space = openSpace(clock ? { clock } : {});
  seedDemoOrganization(space.workspace);
  seedDemoCardCast(space.workspace);
  return space;
}

const observationsOf = (file: string, kind: string) =>
  readRows(file, 'SELECT * FROM observations WHERE kind = ? ORDER BY seq', kind);

const scheduleOf = (file: string, cardId: string) =>
  readRows(file, 'SELECT * FROM card_schedule WHERE card_id = ?', cardId)[0];

function gradeCurrent(workspace: Workspace, sessionId: string, grade: 'again' | 'hard' | 'good') {
  const current = workspace.study.view({ sessionId }).current;
  if (!current) {
    throw new Error('no hay tarjeta actual');
  }
  return workspace.study.grade({
    sessionId,
    activityId: current.activityId,
    attemptId: id(),
    grade,
    answer: null,
  });
}

describe('sesión de estudio: lo que encontró el revisor', () => {
  it('[CA-070] la vuelta de una fallada no llega al motor aunque se califique después de las 04:00', () => {
    const { clock, set } = settableClock(inBuenosAires('16/03/2027 03:50'));
    const space = seeded(clock);
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    const failed = space.workspace.study.view({ sessionId }).current?.cardId ?? '';
    gradeCurrent(space.workspace, sessionId, 'again');
    for (let step = 0; step < 3; step += 1) {
      gradeCurrent(space.workspace, sessionId, 'good');
    }
    const afterFail = scheduleOf(space.file, failed);
    set(inBuenosAires('16/03/2027 04:05'));
    expect(space.workspace.study.view({ sessionId }).current).toMatchObject({
      cardId: failed,
      retry: true,
    });
    gradeCurrent(space.workspace, sessionId, 'good');
    expect(scheduleOf(space.file, failed)).toEqual(afterFail);
  });

  it('[CA-070] para la regla de los 4 fallos seguidos solo cuentan los repasos que llegan al motor (no las vueltas)', () => {
    const { clock, set } = settableClock(inBuenosAires('15/03/2027 10:00'));
    const space = openSpace({ clock });
    const subject = space.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    const cards = ['A', 'B', 'C', 'D', 'E'].map((name) =>
      space.workspace.cards.create({ question: `¿${name}?`, answer: name, subjectId: subject.id }),
    );
    space.workspace.cards.plantHistory(
      cards.map((card, index) => ({
        cardId: card.id,
        createdAt: inBuenosAires('01/03/2027 10:00'),
        // La primera es la más atrasada: sale primera.
        reviews: [
          {
            at: inBuenosAires(index === 0 ? '05/03/2027 10:00' : '12/03/2027 10:00'),
            grade: 'good' as const,
          },
        ],
      })),
    );
    const first = cards[0]?.id ?? '';
    // Día 15: falla la primera y también su vuelta.
    const today = space.workspace.study.start({ sessionId: id() });
    expect(today.current?.cardId).toBe(first);
    gradeCurrent(space.workspace, today.sessionId, 'again');
    for (let step = 0; step < 3; step += 1) {
      gradeCurrent(space.workspace, today.sessionId, 'good');
    }
    expect(space.workspace.study.view({ sessionId: today.sessionId }).current?.cardId).toBe(first);
    gradeCurrent(space.workspace, today.sessionId, 'again');
    // Día 16: lo mismo, la primera y su vuelta con «No la sabía» (las demás, «La sabía»).
    set(inBuenosAires('16/03/2027 10:00'));
    const next = space.workspace.study.start({ sessionId: id() });
    let failsOfFirst = 0;
    for (let view = next; view.current; ) {
      const isFirst = view.current.cardId === first;
      failsOfFirst += isFirst ? 1 : 0;
      view = gradeCurrent(space.workspace, next.sessionId, isFirst ? 'again' : 'good');
    }
    expect(failsOfFirst).toBe(2);
    // Día 17: tiene 2 fallos que contaron, no 4: sigue entrando en la sesión.
    set(inBuenosAires('17/03/2027 10:00'));
    space.workspace.study.start({ sessionId: id() });
    const started = observationsOf(space.file, 'session.started').at(-1);
    const chosen = JSON.parse(String(started?.payload)).activities.map(
      (activity: { cardId: string }) => activity.cardId,
    );
    expect(chosen).toContain(first);
  });

  it('[CA-077] una tarjeta «En revisión» no se puede repasar desde «Tarjetas»: su próximo repaso no cambia', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const cardId = view.current?.cardId ?? '';
    space.workspace.study.flag({
      sessionId,
      activityId: view.current?.activityId ?? '',
      attemptId: id(),
    });
    const before = scheduleOf(space.file, cardId);
    expect(() =>
      space.workspace.cards.review({ cardId, grade: 'good', attemptId: id() }),
    ).toThrow();
    expect(scheduleOf(space.file, cardId)).toEqual(before);
  });

  it('[CA-067] la última calificación de la sesión también se deshace: la sesión vuelve a esa tarjeta y, al calificarla otra vez, termina de nuevo', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    let view = space.workspace.study.view({ sessionId });
    for (let step = 0; step < 10; step += 1) {
      view = gradeCurrent(space.workspace, sessionId, 'good');
    }
    expect(view.status).toBe('finished');
    const undone = space.workspace.study.undo({
      sessionId,
      activityId: view.undoable?.activityId ?? '',
    });
    expect(undone.status).toBe('active');
    expect(undone.progress).toEqual({ done: 9, total: 10 });
    expect(undone.current).not.toBeNull();
    const again = gradeCurrent(space.workspace, sessionId, 'hard');
    expect(again.status).toBe('finished');
    expect(observationsOf(space.file, 'session.finished')).toHaveLength(2);
    expect(space.workspace.study.summary({ sessionId }).results).toEqual({
      good: 9,
      hard: 1,
      again: 0,
      flagged: 0,
    });
  });

  it('[CA-067] el mismo pedido de «Deshacer» dos veces deshace una sola calificación', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    gradeCurrent(space.workspace, sessionId, 'good');
    gradeCurrent(space.workspace, sessionId, 'good');
    const view = gradeCurrent(space.workspace, sessionId, 'good');
    const request = { sessionId, activityId: view.undoable?.activityId ?? '' };
    space.workspace.study.undo(request);
    const twice = space.workspace.study.undo(request);
    expect(twice.progress.done).toBe(2);
    expect(observationsOf(space.file, 'review.annulled')).toHaveLength(1);
  });

  it('[CA-068] una sesión pausada de ayer no se puede continuar después de las 04:00', () => {
    const { clock, set } = settableClock(inBuenosAires('15/03/2027 22:00'));
    const space = seeded(clock);
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    gradeCurrent(space.workspace, sessionId, 'good');
    space.workspace.study.pause({ sessionId });
    set(inBuenosAires('16/03/2027 04:10'));
    expect(space.workspace.study.overview().resumable).toBeNull();
    expect(() => space.workspace.study.resume({ sessionId })).toThrow();
    expect(space.workspace.study.view({ sessionId }).status).toBe('paused');
  });
});
