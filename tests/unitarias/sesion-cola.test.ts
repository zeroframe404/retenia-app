import { describe, expect, it } from 'vitest';
import {
  activeMinutes,
  chooseSessionCards,
  leftOutOfQueue,
  projectSession,
  RETRY_GAP,
  SESSION_SIZE,
  type SessionEvent,
  type SessionState,
  summarizeSession,
} from '../../src/core/session';

// Las reglas puras de la sesión de estudio (Fase 10): qué tarjetas entran, en qué orden, cuándo
// vuelve una fallada, qué hace «Deshacer» y qué dice el cierre.

const candidate = (
  cardId: string,
  recall: number,
  extra: { siblingGroupId?: string | null; dueDay?: string } = {},
) => ({
  cardId,
  recall,
  siblingGroupId: extra.siblingGroupId ?? null,
  dueDay: extra.dueDay ?? '2027-03-15',
});

const started = (cardIds: readonly string[]): SessionEvent => ({
  kind: 'started',
  sessionId: 's1',
  subjectId: 'm1',
  studyDay: '2027-03-15',
  activities: cardIds.map((cardId, index) => ({ activityId: `a${index}`, cardId })),
  deferredSiblingIds: [],
  activeMs: 0,
});

let reviews = 0;
const graded = (
  state: SessionState,
  grade: 'again' | 'hard' | 'good',
  activeMs = 1000,
): SessionEvent => {
  const current = state.pending[0];
  if (!current) {
    throw new Error('no hay actividad actual');
  }
  reviews += 1;
  return {
    kind: 'graded',
    reviewId: `r${reviews}`,
    activityId: current.activityId,
    grade,
    retryActivityId: grade === 'again' && !current.retry ? `vuelta-${reviews}` : null,
    activeMs,
  };
};

// Aplica una serie de calificaciones a la actividad actual y devuelve los eventos y el estado.
function play(cardIds: readonly string[], grades: readonly ('again' | 'hard' | 'good')[]) {
  const events: SessionEvent[] = [started(cardIds)];
  let state = projectSession(events);
  for (const grade of grades) {
    events.push(graded(state, grade));
    state = projectSession(events);
  }
  return { events, state };
}

const ten = Array.from({ length: 10 }, (_, index) => `c${index}`);

describe('armado de la cola', () => {
  it('[CA-068] toma las 10 de menor probabilidad de recordarlas, de la más baja a la más alta', () => {
    const candidates = Array.from({ length: 14 }, (_, index) =>
      candidate(`c${index}`, 0.9 - index * 0.01),
    );
    const { chosen } = chooseSessionCards(candidates);
    expect(SESSION_SIZE).toBe(10);
    expect(chosen).toEqual(['c13', 'c12', 'c11', 'c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4']);
  });

  it('[CA-068] con menos de 10 vencidas toma las que hay; sin ninguna, la sesión está vacía', () => {
    expect(chooseSessionCards([candidate('a', 0.8), candidate('b', 0.7)]).chosen).toEqual([
      'b',
      'a',
    ]);
    expect(chooseSessionCards([]).chosen).toEqual([]);
  });

  it('[CA-068] a igual probabilidad va primero la que venció antes, y después por identificador', () => {
    const { chosen } = chooseSessionCards([
      candidate('z', 0.8, { dueDay: '2027-03-10' }),
      candidate('b', 0.8, { dueDay: '2027-03-12' }),
      candidate('a', 0.8, { dueDay: '2027-03-12' }),
    ]);
    expect(chosen).toEqual(['z', 'a', 'b']);
  });

  it('[CA-071] de dos hermanas que vencen hoy entra una sola, la de menor probabilidad, y la otra pasa a mañana', () => {
    const { chosen, deferred } = chooseSessionCards([
      candidate('hermana-1', 0.85, { siblingGroupId: 'renglon' }),
      candidate('hermana-2', 0.8, { siblingGroupId: 'renglon' }),
      candidate('suelta', 0.82),
    ]);
    expect(chosen).toEqual(['hermana-2', 'suelta']);
    expect(deferred).toEqual(['hermana-1']);
  });

  it('[CA-071] si ya se estudió hoy una tarjeta de la familia, ninguna hermana entra', () => {
    const { chosen, deferred } = chooseSessionCards(
      [
        candidate('hermana-1', 0.85, { siblingGroupId: 'renglon' }),
        candidate('hermana-2', 0.8, { siblingGroupId: 'renglon' }),
        candidate('suelta', 0.82),
      ],
      { studiedGroups: new Set(['renglon']) },
    );
    expect(chosen).toEqual(['suelta']);
    expect(deferred).toEqual(['hermana-2', 'hermana-1']);
  });

  it('[CA-071] una familia de tres deja dos para mañana y las tarjetas sin familia no se agrupan', () => {
    const { chosen, deferred } = chooseSessionCards([
      candidate('a', 0.7, { siblingGroupId: 'g' }),
      candidate('b', 0.6, { siblingGroupId: 'g' }),
      candidate('c', 0.65, { siblingGroupId: 'g' }),
      candidate('x', 0.9),
      candidate('y', 0.9),
    ]);
    expect(chosen).toEqual(['b', 'x', 'y']);
    expect(deferred).toEqual(['c', 'a']);
  });

  it('una tarjeta con sus últimas 4 calificaciones «No la sabía» queda fuera de la cola; con menos de 4, o con un acierto en el medio, no', () => {
    expect(leftOutOfQueue(['again', 'again', 'again', 'again'])).toBe(true);
    expect(leftOutOfQueue(['good', 'again', 'again', 'again', 'again'])).toBe(true);
    expect(leftOutOfQueue(['again', 'again', 'again'])).toBe(false);
    expect(leftOutOfQueue(['again', 'again', 'hard', 'again', 'again'])).toBe(false);
    expect(leftOutOfQueue([])).toBe(false);
  });
});

describe('avance y vuelta de una fallada', () => {
  it('[CA-066] al empezar, la actual es la primera y el progreso es 0/10', () => {
    const { state } = play(ten, []);
    expect(state.pending[0]).toMatchObject({ cardId: 'c0', retry: false });
    expect(state.progress).toEqual({ done: 0, total: 10 });
    expect(state.status).toBe('active');
  });

  it('[CA-069] calificar avanza una sola tarjeta y el progreso sube en uno', () => {
    const { state } = play(ten, ['good']);
    expect(state.pending[0]?.cardId).toBe('c1');
    expect(state.progress).toEqual({ done: 1, total: 10 });
  });

  it('[CA-069] una calificación para una actividad que no es la actual no cambia nada', () => {
    const { events, state } = play(ten, ['good']);
    events.push({
      kind: 'graded',
      reviewId: 'viejo',
      activityId: 'a0',
      grade: 'good',
      retryActivityId: null,
      activeMs: 0,
    });
    expect(projectSession(events)).toEqual(state);
  });

  it('[CA-070] con «No la sabía» la tarjeta vuelve después de otras 3', () => {
    const { state } = play(ten, ['again']);
    expect(RETRY_GAP).toBe(3);
    expect(state.pending.map((activity) => activity.cardId)).toEqual([
      'c1',
      'c2',
      'c3',
      'c0',
      'c4',
      'c5',
      'c6',
      'c7',
      'c8',
      'c9',
    ]);
    expect(state.pending[3]?.retry).toBe(true);
    expect(state.progress).toEqual({ done: 1, total: 10 });
  });

  it('[CA-070] si quedan menos de 3, la fallada vuelve al final', () => {
    const { state } = play(['a', 'b', 'c'], ['good', 'again']);
    expect(state.pending.map((activity) => activity.cardId)).toEqual(['c', 'b']);
    const last = play(['a'], ['again']).state;
    expect(last.pending.map((activity) => activity.cardId)).toEqual(['a']);
    expect(last.pending[0]?.retry).toBe(true);
  });

  it('[CA-070] la vuelta no cambia el progreso y, si se falla otra vez, no vuelve de nuevo', () => {
    const { state } = play(['a'], ['again', 'again']);
    expect(state.pending).toEqual([]);
    expect(state.progress).toEqual({ done: 1, total: 1 });
    expect(state.complete).toBe(true);
  });

  it('[CA-070] la sesión no termina hasta hacer las vueltas', () => {
    const { state } = play(['a', 'b'], ['again', 'good']);
    expect(state.progress).toEqual({ done: 2, total: 2 });
    expect(state.complete).toBe(false);
    expect(state.pending[0]).toMatchObject({ cardId: 'a', retry: true });
  });
});

describe('deshacer, saltar, marcar y pausar', () => {
  it('[CA-067] deshacer la cuarta vuelve a esa tarjeta sin calificar y el progreso pasa de 4/10 a 3/10', () => {
    const { events, state } = play(ten, ['good', 'hard', 'good', 'good']);
    expect(state.progress.done).toBe(4);
    expect(state.undoable).toMatchObject({ cardId: 'c3', grade: 'good' });
    events.push({ kind: 'annulled', reviewId: state.undoable?.reviewId ?? '', activeMs: 0 });
    const after = projectSession(events);
    expect(after.pending[0]?.cardId).toBe('c3');
    expect(after.progress).toEqual({ done: 3, total: 10 });
    expect(after.undoable).toMatchObject({ cardId: 'c2' });
  });

  it('[CA-067] deshacer un «No la sabía» saca su vuelta de la cola', () => {
    const { events, state } = play(ten, ['again']);
    events.push({ kind: 'annulled', reviewId: state.undoable?.reviewId ?? '', activeMs: 0 });
    const after = projectSession(events);
    expect(after.pending.map((activity) => activity.cardId)).toEqual(ten);
    expect(after.pending.some((activity) => activity.retry)).toBe(false);
  });

  it('[CA-067] anular un repaso que no es la última calificación no cambia nada', () => {
    const { events, state } = play(ten, ['good', 'good']);
    const first = state.done[0]?.reviewId ?? '';
    events.push({ kind: 'annulled', reviewId: first, activeMs: 0 });
    expect(projectSession(events).pending).toEqual(state.pending);
  });

  it('«Saltar» deja la tarjeta para el final, sin progreso; si es la única, sigue ahí', () => {
    const events: SessionEvent[] = [started(['a', 'b', 'c'])];
    events.push({ kind: 'skipped', activityId: 'a0', activeMs: 0 });
    const state = projectSession(events);
    expect(state.pending.map((activity) => activity.cardId)).toEqual(['b', 'c', 'a']);
    expect(state.progress.done).toBe(0);
    const alone: SessionEvent[] = [
      started(['a']),
      { kind: 'skipped', activityId: 'a0', activeMs: 0 },
    ];
    expect(projectSession(alone).pending.map((activity) => activity.cardId)).toEqual(['a']);
  });

  it('[CA-077] «La tarjeta está mal» la saca de la sesión, cuenta como hecha y no se deshace', () => {
    const { events, state } = play(['a', 'b'], ['good']);
    events.push({ kind: 'flagged', activityId: state.pending[0]?.activityId ?? '', activeMs: 0 });
    const after = projectSession(events);
    expect(after.pending).toEqual([]);
    expect(after.progress).toEqual({ done: 2, total: 2 });
    expect(after.done.at(-1)).toMatchObject({ cardId: 'b', outcome: 'flagged' });
    expect(after.undoable).toBeNull();
  });

  it('una tarjeta que se pausó o se sacó desde «Editar» deja la sesión como hecha', () => {
    const events: SessionEvent[] = [started(['a', 'b'])];
    events.push({ kind: 'dropped', activityId: 'a0', activeMs: 0 });
    const state = projectSession(events);
    expect(state.pending.map((activity) => activity.cardId)).toEqual(['b']);
    expect(state.done[0]).toMatchObject({ cardId: 'a', outcome: 'dropped' });
    expect(state.progress.done).toBe(1);
  });

  it('[CA-068] pausar, retomar, terminar y abandonar cambian el estado y suman los minutos activos', () => {
    const events: SessionEvent[] = [started(['a', 'b'])];
    events.push({ kind: 'paused', activeMs: 60_000 });
    expect(projectSession(events).status).toBe('paused');
    events.push({ kind: 'resumed', activeMs: 0 });
    expect(projectSession(events).status).toBe('active');
    events.push({ kind: 'abandoned', activeMs: 0 });
    expect(projectSession(events).status).toBe('abandoned');
    events.push({ kind: 'finished', activeMs: 30_000 });
    const state = projectSession(events);
    expect(state.status).toBe('finished');
    expect(state.activeMs).toBe(90_000);
  });

  it('[CA-074] los minutos activos se redondean y nunca bajan de 1', () => {
    expect(activeMinutes(0)).toBe(1);
    expect(activeMinutes(89_000)).toBe(1);
    expect(activeMinutes(91_000)).toBe(2);
    expect(activeMinutes(13 * 60_000)).toBe(13);
  });

  it('sin el evento de inicio no hay sesión', () => {
    expect(() => projectSession([])).toThrow();
  });
});

describe('cierre', () => {
  const cards = new Map([
    ['c0', { question: '¿Qué mide el desvío estándar?', topicName: 'Media y dispersión' }],
    ['c1', { question: '¿Qué es la mediana?', topicName: 'Media y dispersión' }],
    ['c2', { question: '¿Qué es un intervalo?', topicName: 'Intervalos de confianza' }],
    ['c3', { question: '¿Qué es una prueba?', topicName: 'Pruebas de hipótesis' }],
    ['c4', { question: '¿Sin tema?', topicName: null }],
  ]);

  it('[CA-074] cuenta cada tarjeta por su primera calificación (las vueltas no suman) y las marcadas como «En revisión»', () => {
    const { events, state } = play(['c0', 'c1', 'c2', 'c3', 'c4'], ['again', 'good', 'hard']);
    events.push({ kind: 'flagged', activityId: state.pending[0]?.activityId ?? '', activeMs: 0 });
    let next = projectSession(events);
    events.push(graded(next, 'good'));
    next = projectSession(events);
    events.push(graded(next, 'good'));
    next = projectSession(events);
    const summary = summarizeSession(next, cards);
    // c0 «No la sabía» (y su vuelta, «La sabía», no suma), c1 y c4 «La sabía», c2 «Con dudas», c3
    // marcada.
    expect(summary.results).toEqual({ good: 2, hard: 1, again: 1, flagged: 1 });
  });

  it('[CA-074] las dificultades son las falladas agrupadas por tema, como máximo 2, primero el tema con más', () => {
    const { state } = play(
      ['c0', 'c1', 'c2', 'c3', 'c4'],
      ['good', 'again', 'again', 'again', 'again'],
    );
    const summary = summarizeSession(state, cards);
    // Cuatro temas con una fallada cada uno: a igual cantidad, el orden en que aparecieron.
    expect(summary.difficulties).toEqual([
      { topicName: 'Media y dispersión', cardIds: ['c1'], questions: ['¿Qué es la mediana?'] },
      {
        topicName: 'Intervalos de confianza',
        cardIds: ['c2'],
        questions: ['¿Qué es un intervalo?'],
      },
    ]);
    const twoOfOne = summarizeSession(
      play(['c0', 'c1', 'c2'], ['again', 'again', 'again']).state,
      cards,
    );
    expect(twoOfOne.difficulties[0]).toMatchObject({
      topicName: 'Media y dispersión',
      cardIds: ['c0', 'c1'],
    });
    expect(twoOfOne.difficulties).toHaveLength(2);
  });

  it('[CA-074] sin falladas no hay dificultades; una tarjeta sin tema se agrupa como «sin tema»', () => {
    expect(summarizeSession(play(['c0'], ['good']).state, cards).difficulties).toEqual([]);
    const loose = summarizeSession(play(['c4'], ['again']).state, cards);
    expect(loose.difficulties).toEqual([
      { topicName: null, cardIds: ['c4'], questions: ['¿Sin tema?'] },
    ]);
  });

  it('[CA-074] el tema para «Ajustar el plan» es el de la primera dificultad o, sin dificultades, el que más tarjetas tuvo', () => {
    const failed = summarizeSession(
      play(['c2', 'c0', 'c1'], ['good', 'again', 'good']).state,
      cards,
    );
    expect(failed.focusTopicName).toBe('Media y dispersión');
    const clean = summarizeSession(play(['c2', 'c0', 'c1'], ['good', 'good', 'good']).state, cards);
    expect(clean.focusTopicName).toBe('Media y dispersión');
  });
});
