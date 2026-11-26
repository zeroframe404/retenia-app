import { describe, expect, it } from 'vitest';
import {
  activitySeconds,
  type ComposeInput,
  composeSession,
  type ReviewCandidate,
} from '../../src/core/load';
import { projectSession, type SessionEvent, summarizeSession } from '../../src/core/session';

// Los ejercicios en la sesión de Estudiar (Fase 18, decisión del 24/11/2026): vuelven cuando les
// toca el repaso, cuentan su tiempo y van repartidos entre las tarjetas.

const candidate = (cardId: string, recall: number, exercise = false): ReviewCandidate => ({
  cardId,
  recall,
  dueDay: '2027-03-15',
  siblingGroupId: null,
  postponements: 0,
  ...(exercise ? { exercise: true, seconds: 120 } : {}),
});

const input = (reviews: ReviewCandidate[], minutes = 25): ComposeInput => ({
  minutes,
  reviews,
  newCards: [],
  brake: { band: 'full', factor: 1, maxCards: null },
  reviewSeconds: 12,
  newCardSeconds: 60,
});

describe('cuánto tarda cada actividad', () => {
  it('una tarjeta, lo que se aprendió de tus repasos; un ejercicio, 2 minutos; un procedimiento, 8', () => {
    expect(activitySeconds(null, 9)).toBe(9);
    for (const type of ['short', 'numeric', 'options', 'order', 'open', 'decision']) {
      expect(activitySeconds(type, 9)).toBe(120);
    }
    expect(activitySeconds('procedure', 9)).toBe(480);
  });

  it('la sesión cuenta el tiempo de cada ejercicio: en 5 minutos entran 1 ejercicio y 10 tarjetas', () => {
    // 5 minutos menos 1 de preparación: 240 segundos. Primero lo que más riesgo corre.
    const cards = Array.from({ length: 20 }, (_, n) => candidate(`t${n}`, 0.5 + n / 100));
    const plan = composeSession(
      input([candidate('e1', 0.1, true), candidate('e2', 0.99, true), ...cards], 5),
    );
    expect(plan.reviews).toHaveLength(11);
    expect(plan.reviews).toContain('e1');
    expect(plan.reviews).not.toContain('e2');
    expect(plan.postponed.map((item) => item.cardId)).toContain('e2');
    expect(plan.estimatedSeconds).toBe(60 + 120 + 10 * 12);
  });
});

describe('el orden de la sesión con ejercicios', () => {
  it('empieza con una tarjeta y los ejercicios van repartidos, sin cambiar el orden de las tarjetas ni el de los ejercicios', () => {
    // Los ejercicios son lo que más riesgo corre: igual no abren la sesión.
    const plan = composeSession(
      input([
        candidate('e1', 0.1, true),
        candidate('e2', 0.2, true),
        ...Array.from({ length: 6 }, (_, n) => candidate(`t${n + 1}`, 0.5 + n / 100)),
      ]),
    );
    expect(plan.reviews).toEqual(['t1', 't2', 'e1', 't3', 't4', 'e2', 't5', 't6']);
  });

  it('con una sola tarjeta, la tarjeta va primero', () => {
    const plan = composeSession(
      input([candidate('e1', 0.1, true), candidate('e2', 0.2, true), candidate('t1', 0.5)]),
    );
    expect(plan.reviews).toEqual(['t1', 'e1', 'e2']);
  });

  it('sin tarjetas, van los ejercicios en su orden; sin ejercicios, nada cambia', () => {
    expect(
      composeSession(input([candidate('e2', 0.2, true), candidate('e1', 0.1, true)])).reviews,
    ).toEqual(['e1', 'e2']);
    expect(composeSession(input([candidate('t2', 0.2), candidate('t1', 0.1)])).reviews).toEqual([
      't1',
      't2',
    ]);
  });
});

const started: SessionEvent = {
  kind: 'started',
  sessionId: 's',
  subjectId: 'm',
  studyDay: '2027-03-16',
  activities: [
    { activityId: 'a1', cardId: 't1' },
    { activityId: 'a2', cardId: 'e1' },
    { activityId: 'a3', cardId: 'e2' },
    { activityId: 'a4', cardId: 'e3' },
  ],
  deferredSiblingIds: [],
  activeMs: 0,
};
const graded: SessionEvent = {
  kind: 'graded',
  reviewId: 'r1',
  activityId: 'a1',
  grade: 'good',
  retryActivityId: null,
  activeMs: 1000,
};
const exercise = (activityId: string, outcome: 'good' | 'again' | 'seen'): SessionEvent => ({
  kind: 'exercise',
  activityId,
  outcome,
  activeMs: 2000,
});

describe('un ejercicio hecho en la sesión', () => {
  it('pasa a la actividad siguiente, suma al progreso y no vuelve en la misma sesión aunque salga mal', () => {
    const state = projectSession([started, graded, exercise('a2', 'again')]);
    expect(state.pending.map((item) => item.cardId)).toEqual(['e2', 'e3']);
    expect(state.progress).toEqual({ done: 2, total: 4 });
    expect(state.activeMs).toBe(3000);
  });

  it('no se deshace, y tampoco la calificación de antes', () => {
    expect(projectSession([started, graded]).undoable).not.toBeNull();
    expect(projectSession([started, graded, exercise('a2', 'good')]).undoable).toBeNull();
    // Un pedido viejo para deshacer la tarjeta ya no cambia nada.
    const state = projectSession([
      started,
      graded,
      exercise('a2', 'good'),
      { kind: 'annulled', reviewId: 'r1', activeMs: 0 },
    ]);
    expect(state.progress.done).toBe(2);
  });

  it('un pedido que no es de la actividad actual no cambia nada', () => {
    const state = projectSession([started, exercise('a2', 'good')]);
    expect(state.progress.done).toBe(0);
  });

  it('el cierre lo cuenta como las tarjetas; el ejemplo visto no cuenta como resultado', () => {
    const state = projectSession([
      started,
      graded,
      exercise('a2', 'again'),
      exercise('a3', 'good'),
      exercise('a4', 'seen'),
    ]);
    expect(state.complete).toBe(true);
    const summary = summarizeSession(
      state,
      new Map(
        ['t1', 'e1', 'e2', 'e3'].map((id) => [
          id,
          { question: `Pregunta ${id}`, topicName: 'Media' },
        ]),
      ),
    );
    expect(summary.results).toEqual({ good: 2, hard: 0, again: 1, flagged: 0 });
    expect(summary.difficulties).toEqual([
      { topicName: 'Media', cardIds: ['e1'], questions: ['Pregunta e1'] },
    ]);
  });
});
