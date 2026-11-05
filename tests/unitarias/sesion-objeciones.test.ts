import { describe, expect, it } from 'vitest';
import { engineGradeOf } from '../../src/core/memory/engine';
import { projectSession, type SessionEvent } from '../../src/core/session';

// Lo que encontró el revisor independiente de la Fase 10, en las reglas puras.

const started = (cardIds: readonly string[]): SessionEvent => ({
  kind: 'started',
  sessionId: 's1',
  subjectId: 'm1',
  studyDay: '2027-03-15',
  activities: cardIds.map((cardId, index) => ({ activityId: `a${index}`, cardId })),
  deferredSiblingIds: [],
  activeMs: 0,
});

const graded = (activityId: string, reviewId: string): SessionEvent => ({
  kind: 'graded',
  reviewId,
  activityId,
  grade: 'good',
  retryActivityId: null,
  activeMs: 0,
});

describe('sesión de estudio: lo que encontró el revisor', () => {
  it('[CA-070] la vuelta de una fallada no le llega al motor, sea el día que sea', () => {
    expect(engineGradeOf({ grade: 'good', retry: true })).toBeNull();
    expect(engineGradeOf({ grade: 'again', retry: true })).toBeNull();
    expect(engineGradeOf({ grade: 'good', retry: false })).toBe('good');
  });

  it('[CA-067] «Saltar» también corta la pila de deshacer: «Calificaste la anterior» no habla de otra tarjeta', () => {
    const events: SessionEvent[] = [started(['a', 'b', 'c']), graded('a0', 'r1')];
    events.push({ kind: 'skipped', activityId: 'a1', activeMs: 0 });
    expect(projectSession(events).undoable).toBeNull();
    events.push(graded('a2', 'r2'));
    expect(projectSession(events).undoable).toMatchObject({ cardId: 'c' });
  });

  it('[CA-067] deshacer la calificación que terminó la sesión la vuelve a abrir en esa tarjeta', () => {
    const events: SessionEvent[] = [started(['a', 'b']), graded('a0', 'r1'), graded('a1', 'r2')];
    events.push({ kind: 'finished', activeMs: 0 });
    expect(projectSession(events).status).toBe('finished');
    events.push({ kind: 'annulled', reviewId: 'r2', activeMs: 0 });
    const reopened = projectSession(events);
    expect(reopened.status).toBe('active');
    expect(reopened.pending.map((activity) => activity.cardId)).toEqual(['b']);
    expect(reopened.complete).toBe(false);
    expect(reopened.undoable).toMatchObject({ reviewId: 'r1' });
  });

  it('[CA-067] lo que se puede deshacer dice de qué actividad es', () => {
    const state = projectSession([started(['a', 'b']), graded('a0', 'r1')]);
    expect(state.undoable).toMatchObject({ activityId: 'a0', cardId: 'a', grade: 'good' });
  });
});
