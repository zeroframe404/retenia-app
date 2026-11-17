import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import { inBuenosAires } from '../apoyo/fechas';

// La sesión de estudio de la Fase 10 contra una base real: el armado con el elenco, cerrar y
// retomar, el doble clic, «Deshacer», la vuelta de una fallada (que no llega al motor), las
// hermanas, la tarjeta defectuosa, el borrador, el cierre, la valoración, las dudas y los ajustes.

afterEach(closeSpaces);

let ids = 0;
const id = () => {
  ids += 1;
  return `01969f1e-0000-4000-8000-${String(ids).padStart(12, '0')}`;
};

// Un reloj que se puede adelantar días enteros, como «+1 día» en la demostración.
function movableClock() {
  let offset = 0;
  const clock: Clock = { now: () => demoClock(offset).now() };
  return {
    clock,
    advance: (days: number) => {
      offset += days;
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

// Califica la actividad actual con un identificador de intento nuevo.
function gradeCurrent(
  workspace: Workspace,
  sessionId: string,
  grade: 'again' | 'hard' | 'good',
  extra: { answer?: string | null; attemptId?: string } = {},
) {
  const view = workspace.study.view({ sessionId });
  const current = view.current;
  if (!current) {
    throw new Error('no hay tarjeta actual');
  }
  return workspace.study.grade({
    sessionId,
    activityId: current.activityId,
    attemptId: extra.attemptId ?? id(),
    grade,
    answer: extra.answer ?? null,
    activeMs: 5000,
  });
}

describe('armado de la sesión', () => {
  it('[CA-068] «Empezar» arma 10 vencidas de la materia activa y la primera es «¿Qué mide el desvío estándar?»', () => {
    const { workspace } = seeded();
    expect(workspace.study.overview()).toMatchObject({
      subjectName: 'Estadística básica',
      dueCount: 60,
      resumable: null,
    });
    const view = workspace.study.start({ sessionId: id() });
    expect(view.progress).toEqual({ done: 0, total: 10 });
    expect(view.current?.card.question).toBe('¿Qué mide el desvío estándar?');
    expect(view.current?.card.path).toMatchObject({
      subjectName: 'Estadística básica',
      topicName: 'Media y dispersión',
    });
    expect(view.current?.draft).toEqual({ text: '', answerShown: false });
  });

  it('no entran las pausadas, las nuevas ni la de 4 fallos seguidos', () => {
    const { workspace, file } = seeded();
    const statistics = workspace.subjects
      .list()
      .subjects.find((subject) => subject.name === 'Estadística básica');
    const all = workspace.cards.list({ subjectId: statistics?.id });
    const desvio = all.find((card) => card.question === '¿Qué mide el desvío estándar?');
    workspace.cards.setPaused({ cardId: desvio?.id ?? '', paused: true });
    const view = workspace.study.start({ sessionId: id() });
    const session = workspace.study.view({ sessionId: view.sessionId });
    expect(session.current?.card.question).not.toBe('¿Qué mide el desvío estándar?');
    const chosen = readRows(
      file,
      "SELECT payload FROM observations WHERE kind = 'session.started'",
    ).map((row) =>
      JSON.parse(String(row.payload)).activities.map((a: { cardId: string }) => a.cardId),
    );
    const fails = all.find(
      (card) => card.question === '¿Qué significa el 95 % en un intervalo de confianza del 95 %?',
    );
    expect(chosen[0]).not.toContain(desvio?.id);
    expect(chosen[0]).not.toContain(fails?.id);
    const newOnes = all.filter((card) => card.nextReviewDay === null).map((card) => card.id);
    expect(chosen[0].some((cardId: string) => newOnes.includes(cardId))).toBe(false);
    expect(workspace.study.overview().dueCount).toBe(59);
  });

  it('[CA-068] sin vencidas en la materia activa no hay sesión para empezar', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    expect(workspace.study.overview()).toMatchObject({ dueCount: 0, resumable: null });
    expect(() => workspace.study.start({ sessionId: id() })).toThrow();
  });
});

describe('cerrar y retomar', () => {
  it('[CA-068] con 4 de 10 hechas, al cerrar y abrir Retenia se ofrece continuar y retoma en la quinta', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    for (const grade of ['good', 'hard', 'good', 'good'] as const) {
      gradeCurrent(space.workspace, sessionId, grade);
    }
    const fifth = space.workspace.study.view({ sessionId }).current?.cardId;
    space.workspace.study.pause({ sessionId, activeMs: 1000 });
    const reopened = space.reopen();
    expect(reopened.study.overview().resumable).toEqual({ sessionId, done: 4, total: 10 });
    const view = reopened.study.resume({ sessionId });
    expect(view.status).toBe('active');
    expect(view.progress).toEqual({ done: 4, total: 10 });
    expect(view.current?.cardId).toBe(fifth);
  });

  it('[CA-068] si Retenia se cerró de golpe sin pausar, la sesión igual se puede continuar', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    gradeCurrent(space.workspace, sessionId, 'good');
    const reopened = space.reopen();
    expect(reopened.study.overview().resumable).toEqual({ sessionId, done: 1, total: 10 });
  });

  it('[CA-068] la sesión pausada vale hasta el cambio de día de estudio (04:00): al otro día no se ofrece', () => {
    const { clock, advance } = movableClock();
    const space = seeded(clock);
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    gradeCurrent(space.workspace, sessionId, 'good');
    space.workspace.study.pause({ sessionId });
    advance(1);
    expect(space.reopen().study.overview().resumable).toBeNull();
  });

  it('[CA-068] «Empezar» con una sesión pausada deja la anterior como abandonada (sus repasos quedan)', () => {
    const space = seeded();
    const first = id();
    space.workspace.study.start({ sessionId: first });
    gradeCurrent(space.workspace, first, 'good');
    space.workspace.study.pause({ sessionId: first });
    const second = space.workspace.study.start({ sessionId: id() });
    expect(space.workspace.study.view({ sessionId: first }).status).toBe('abandoned');
    expect(space.workspace.study.overview().resumable).toMatchObject({
      sessionId: second.sessionId,
    });
    expect(observationsOf(space.file, 'review.graded').length).toBeGreaterThan(0);
  });

  it('[CA-068] empezar dos veces con el mismo identificador no arma dos sesiones', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    space.workspace.study.start({ sessionId });
    expect(observationsOf(space.file, 'session.started')).toHaveLength(1);
  });
});

describe('calificar sin duplicar', () => {
  it('[CA-069] el mismo intento dos veces es un solo repaso, una sola evaluación y un solo avance', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const activityId = view.current?.activityId ?? '';
    const attemptId = id();
    const input = { sessionId, activityId, attemptId, grade: 'good' as const, answer: null };
    space.workspace.study.grade(input);
    const again = space.workspace.study.grade(input);
    expect(again.progress).toEqual({ done: 1, total: 10 });
    expect(observationsOf(space.file, 'review.graded').filter(isSession(sessionId))).toHaveLength(
      1,
    );
    const evaluations = readRows(
      space.file,
      `SELECT e.id FROM evaluations e JOIN observations o ON o.id = e.attempt_id
        WHERE o.idempotency_key = ?`,
      `review:${attemptId}`,
    );
    expect(evaluations).toHaveLength(1);
  });

  it('[CA-069] una calificación con la actividad anterior (un pedido viejo) no hace nada', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const first = view.current?.activityId ?? '';
    gradeCurrent(space.workspace, sessionId, 'good');
    const stale = space.workspace.study.grade({
      sessionId,
      activityId: first,
      attemptId: id(),
      grade: 'again',
      answer: null,
    });
    expect(stale.progress.done).toBe(1);
    expect(observationsOf(space.file, 'review.graded').filter(isSession(sessionId))).toHaveLength(
      1,
    );
  });

  it('[CA-069] guarda con el repaso la sesión, lo escrito y los tiempos', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    space.workspace.study.grade({
      sessionId,
      activityId: view.current?.activityId ?? '',
      attemptId: id(),
      grade: 'hard',
      answer: 'cuánto se alejan',
      marks: {
        shownAt: inBuenosAires('15/03/2027 10:00'),
        firstInteractionMs: 1200,
        answerRequestedMs: 8000,
        gradedMs: 9500,
      },
      activeMs: 9500,
    });
    const [row] = observationsOf(space.file, 'review.graded').filter(isSession(sessionId));
    expect(row?.schema_version).toBe(3);
    expect(JSON.parse(String(row?.payload))).toMatchObject({
      sessionId,
      activityId: view.current?.activityId,
      retry: false,
      answer: 'cuánto se alejan',
      shownAt: '2027-03-15T13:00:00.000Z',
      firstInteractionMs: 1200,
      answerRequestedMs: 8000,
      gradedMs: 9500,
      activeMs: 9500,
      rule: 'due',
    });
  });
});

const isSession = (sessionId: string) => (row: Record<string, unknown>) =>
  JSON.parse(String(row.payload)).sessionId === sessionId;

describe('deshacer', () => {
  it('[CA-067] deshacer la cuarta vuelve a esa tarjeta sin calificar, el progreso pasa a 3/10 y su próximo repaso es el de antes', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    for (const grade of ['good', 'hard', 'good'] as const) {
      gradeCurrent(space.workspace, sessionId, grade);
    }
    const fourth = space.workspace.study.view({ sessionId }).current?.cardId ?? '';
    const before = scheduleOf(space.file, fourth);
    space.workspace.study.saveDraft({
      sessionId,
      activityId: space.workspace.study.view({ sessionId }).current?.activityId ?? '',
      text: 'algo',
      answerShown: true,
    });
    const graded = gradeCurrent(space.workspace, sessionId, 'good');
    expect(graded.progress.done).toBe(4);
    expect(graded.undoable).toEqual({ activityId: expect.any(String), grade: 'good' });
    const undone = space.workspace.study.undo({
      sessionId,
      activityId: graded.undoable?.activityId ?? '',
    });
    expect(undone.progress).toEqual({ done: 3, total: 10 });
    expect(undone.current?.cardId).toBe(fourth);
    expect(undone.current?.draft).toEqual({ text: 'algo', answerShown: false });
    expect(scheduleOf(space.file, fourth)).toEqual(before);
    expect(observationsOf(space.file, 'review.annulled')).toHaveLength(1);
  });

  it('[CA-067] deshacer sin nada para deshacer no agrega nada', () => {
    const space = seeded();
    const sessionId = id();
    const started = space.workspace.study.start({ sessionId });
    const view = space.workspace.study.undo({
      sessionId,
      activityId: started.current?.activityId ?? '',
    });
    expect(view.progress.done).toBe(0);
    expect(observationsOf(space.file, 'review.annulled')).toHaveLength(0);
  });
});

describe('vuelta de una fallada', () => {
  it('[CA-070] la fallada vuelve después de otras 3 y esa vuelta se registra pero no mueve su próximo repaso', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    const failed = space.workspace.study.view({ sessionId }).current?.cardId ?? '';
    gradeCurrent(space.workspace, sessionId, 'again');
    const afterFail = scheduleOf(space.file, failed);
    const seen: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      const view = gradeCurrent(space.workspace, sessionId, 'good');
      seen.push(view.current?.cardId ?? '');
    }
    expect(seen.slice(0, 2)).not.toContain(failed);
    expect(seen[2]).toBe(failed);
    const retry = space.workspace.study.view({ sessionId });
    expect(retry.current?.retry).toBe(true);
    expect(retry.progress.done).toBe(4);
    gradeCurrent(space.workspace, sessionId, 'good');
    expect(scheduleOf(space.file, failed)).toEqual(afterFail);
    const rows = observationsOf(space.file, 'review.graded').filter(
      (row) => row.card_id === failed && isSession(sessionId)(row),
    );
    expect(rows.map((row) => JSON.parse(String(row.payload)).retry)).toEqual([false, true]);
  });
});

describe('hermanas', () => {
  it('[CA-071] de dos hermanas que vencen hoy entra una sola; la otra entra al día siguiente', () => {
    const { clock, advance } = movableClock();
    const space = openSpace({ clock });
    const subject = space.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    const card = space.workspace.cards.create({
      question: '¿Qué es un alcano?',
      answer: 'Un hidrocarburo saturado',
      subjectId: subject.id,
    });
    const inverse = space.workspace.cards.createInverse({ cardId: card.id }).card;
    space.workspace.cards.plantHistory(
      [card.id, inverse.id].map((cardId) => ({
        cardId,
        createdAt: inBuenosAires('01/03/2027 10:00'),
        reviews: [{ at: inBuenosAires('13/03/2027 10:00'), grade: 'good' as const }],
      })),
    );
    const first = space.workspace.study.start({ sessionId: id() });
    expect(first.progress.total).toBe(1);
    const firstCard = first.current?.cardId;
    gradeCurrent(space.workspace, first.sessionId, 'good');
    expect(space.workspace.study.overview().dueCount).toBe(0);
    advance(1);
    const next = space.workspace.study.start({ sessionId: id() });
    expect(next.progress.total).toBe(1);
    expect(next.current?.cardId).not.toBe(firstCard);
  });
});

describe('la tarjeta está mal', () => {
  it('[CA-077] pasa a «En revisión», sigue la próxima, el intento no cambia su próximo repaso y no vuelve a entrar en una sesión', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const flaggedId = view.current?.cardId ?? '';
    const before = scheduleOf(space.file, flaggedId);
    const attemptId = id();
    const input = { sessionId, activityId: view.current?.activityId ?? '', attemptId };
    const after = space.workspace.study.flag(input);
    space.workspace.study.flag(input);
    expect(after.progress).toEqual({ done: 1, total: 10 });
    expect(after.current?.cardId).not.toBe(flaggedId);
    expect(after.undoable).toBeNull();
    expect(space.workspace.cards.get({ cardId: flaggedId }).sheetState).toBe('in_review');
    expect(scheduleOf(space.file, flaggedId)).toEqual(before);
    expect(observationsOf(space.file, 'card.flagged')).toHaveLength(1);
    space.workspace.study.pause({ sessionId });
    const next = space.workspace.study.start({ sessionId: id() });
    const started = observationsOf(space.file, 'session.started').at(-1);
    expect(
      JSON.parse(String(started?.payload)).activities.map((a: { cardId: string }) => a.cardId),
    ).not.toContain(flaggedId);
    expect(next.progress.total).toBe(10);
  });
});

describe('borrador', () => {
  it('[CA-073] lo escrito en «Tu respuesta…» sigue ahí al cerrar y volver, con la respuesta todavía oculta', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const activityId = view.current?.activityId ?? '';
    space.workspace.study.saveDraft({ sessionId, activityId, text: 'cuánto', answerShown: false });
    space.workspace.study.saveDraft({
      sessionId,
      activityId,
      text: 'cuánto se alejan',
      answerShown: false,
    });
    const reopened = space.reopen();
    expect(reopened.study.resume({ sessionId }).current?.draft).toEqual({
      text: 'cuánto se alejan',
      answerShown: false,
    });
  });

  it('[CA-073] si ya se había pedido la respuesta, al volver sigue a la vista', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    space.workspace.study.saveDraft({
      sessionId,
      activityId: view.current?.activityId ?? '',
      text: '',
      answerShown: true,
    });
    expect(space.reopen().study.view({ sessionId }).current?.draft.answerShown).toBe(true);
  });
});

describe('saltar y sacar', () => {
  it('«Saltar» la deja para el final sin progreso', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const skipped = view.current?.cardId;
    const after = space.workspace.study.skip({
      sessionId,
      activityId: view.current?.activityId ?? '',
    });
    expect(after.progress.done).toBe(0);
    expect(after.current?.cardId).not.toBe(skipped);
    expect(observationsOf(space.file, 'session.skipped')).toHaveLength(1);
  });

  it('una tarjeta que se pausó desde «Editar» sale de la sesión como hecha al volver a mirarla', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    space.workspace.cards.setPaused({ cardId: view.current?.cardId ?? '', paused: true });
    const after = space.workspace.study.view({ sessionId });
    expect(after.progress.done).toBe(1);
    expect(after.current?.cardId).not.toBe(view.current?.cardId);
  });
});

describe('cierre', () => {
  it('[CA-074] al calificar la última la sesión termina y el cierre trae minutos, resultados, dificultades y el próximo paso', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    const grades = [
      'again',
      'good',
      'good',
      'hard',
      'good',
      'good',
      'good',
      'good',
      'good',
      'good',
      'good',
    ] as const;
    let view = space.workspace.study.view({ sessionId });
    for (const grade of grades) {
      view = gradeCurrent(space.workspace, sessionId, grade);
    }
    expect(view.complete).toBe(true);
    expect(view.status).toBe('finished');
    expect(observationsOf(space.file, 'session.finished')).toHaveLength(1);
    const summary = space.workspace.study.summary({ sessionId });
    expect(summary.results).toEqual({ good: 8, hard: 1, again: 1, flagged: 0 });
    expect(summary.minutes).toBe(1);
    expect(summary.difficulties).toEqual([
      {
        topicName: 'Media y dispersión',
        cardIds: [expect.any(String)],
        questions: ['¿Qué mide el desvío estándar?'],
      },
    ]);
    expect(summary.remainingDueToday).toBe(50);
    expect(summary.cards).toHaveLength(10);
    expect(summary.cards[0]?.question).toBe('¿Qué mide el desvío estándar?');
    expect(summary.focusTopic?.name).toBe('Media y dispersión');
    expect(summary.rating).toBeNull();
  });

  it('[CA-075] un toque en «¿Cómo estuvo?» queda registrado; sin toque, nada', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    expect(observationsOf(space.file, 'session.rated')).toHaveLength(0);
    space.workspace.study.rate({ sessionId, rating: 'fair', ratingId: id() });
    expect(observationsOf(space.file, 'session.rated')).toHaveLength(1);
    expect(space.workspace.study.summary({ sessionId }).rating).toBe('fair');
    space.workspace.study.rate({ sessionId, rating: 'hard', ratingId: id() });
    expect(space.workspace.study.summary({ sessionId }).rating).toBe('hard');
  });

  it('«Ajustar el plan» guarda la preferencia', () => {
    const space = seeded();
    const sessionId = id();
    space.workspace.study.start({ sessionId });
    space.workspace.study.adjustPlan({ sessionId, option: 'shorter' });
    space.workspace.study.adjustPlan({ sessionId, option: 'pauseTopic' });
    expect(space.reopen().study.planPreferences()).toEqual({
      shorter: true,
      morePracticeTopicIds: [],
      pausedTopicIds: [expect.any(String)],
    });
  });

  it('[CA-072] la ayuda de teclas se ofrece hasta que se la cierra', () => {
    const space = seeded();
    const view = space.workspace.study.start({ sessionId: id() });
    expect(view.showShortcuts).toBe(true);
    space.workspace.study.dismissShortcuts();
    expect(space.reopen().study.view({ sessionId: view.sessionId }).showShortcuts).toBe(false);
  });
});

describe('dudas y revisiones', () => {
  it('[CA-076] una duda guardada desde el cierre aparece en «Dudas y revisiones» con la tarjeta como contexto, una sola vez', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    const cardId = view.current?.cardId ?? '';
    const doubt = {
      doubtId: id(),
      text: 'No entiendo por qué se divide por n−1',
      cardId,
      sessionId,
    };
    space.workspace.doubts.create(doubt);
    space.workspace.doubts.create(doubt);
    const reviews = space.reopen().doubts.reviews();
    expect(reviews.doubts).toEqual([
      {
        id: doubt.doubtId,
        text: 'No entiendo por qué se divide por n−1',
        createdAt: expect.any(String),
        day: '2027-03-15',
        card: {
          id: cardId,
          question: '¿Qué mide el desvío estándar?',
          subjectId: expect.any(String),
        },
      },
    ]);
  });

  it('[CA-077] las tarjetas «En revisión» aparecen en «Dudas y revisiones»', () => {
    const space = seeded();
    const sessionId = id();
    const view = space.workspace.study.start({ sessionId });
    space.workspace.study.flag({
      sessionId,
      activityId: view.current?.activityId ?? '',
      attemptId: id(),
    });
    expect(space.workspace.doubts.reviews().inReview).toEqual([
      {
        cardId: view.current?.cardId,
        question: '¿Qué mide el desvío estándar?',
        subjectId: expect.any(String),
        subjectName: 'Estadística básica',
      },
    ]);
  });
});
