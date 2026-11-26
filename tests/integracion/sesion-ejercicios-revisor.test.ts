import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openSpace, type Space } from '../apoyo/espacio';
import {
  cardNamed,
  check,
  movableClock,
  open,
  PROCEDURE_TITLE,
  practice,
} from '../apoyo/procedimiento';
import {
  answer,
  currentOf,
  done,
  gradeCard,
  nextReview,
  resultsOf,
  startSession,
  untilExercise,
} from '../apoyo/sesion-ejercicios';

// Las reproducciones de las objeciones del revisor sobre los ejercicios en la sesión de Estudiar
// (segunda revisión de la Fase 18). Cada una se vio en rojo antes del arreglo.

const nextDaySpace = () => openSpace({ withCast: 'tarjetas', clock: demoClock(1) });

// Una materia propia, sin el elenco, con el reloj en la mano.
function ownSpace() {
  const clock = movableClock();
  const space = openSpace({ clock });
  const subject = space.workspace.subjects.create({ name: 'Geografía', makeActive: true });
  const exercise = (question: string, correct: string, type: 'short' | 'open' = 'short') =>
    space.workspace.cards.create({
      question,
      answer: correct,
      subjectId: subject.id,
      activity:
        type === 'short'
          ? { type: 'short' }
          : {
              type: 'open',
              units: [
                { id: 'u1', text: correct },
                { id: 'u2', text: 'Lo forma el agua' },
              ],
            },
    });
  const card = (question: string, correct: string) =>
    space.workspace.cards.create({ question, answer: correct, subjectId: subject.id });
  // Avanza hasta el día en que le toca el repaso.
  const untilDue = (cardId: string) => {
    for (let day = 0; day < 400; day += 1) {
      const overview = space.workspace.study.overview();
      const due = nextReview(space, cardId);
      if (due !== null && overview.dueCount > 0 && due <= todayOf(space)) {
        return;
      }
      clock.advance(1);
    }
    throw new Error('No le tocó el repaso');
  };
  return { space, clock, exercise, card, untilDue };
}

const todayOf = (space: Space) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(space.clock.now().getTime() - 4 * 3_600_000),
  );

const resume = (space: Space, sessionId: string) => space.workspace.study.resume({ sessionId });
const pause = (space: Space, sessionId: string) => space.workspace.study.pause({ sessionId });

describe('objeción 1: «La tarjeta está mal» después de «Enviar»', () => {
  it('[CA-077] el ejercicio queda en revisión y ese intento no cambia su próximo repaso ni cuenta', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    const dueBefore = nextReview(space, exercise.cardId);
    const sent = answer(space, exercise.cardId, { right: false, sessionId, finalize: false });
    space.workspace.study.flag({
      sessionId,
      activityId: exercise.activityId,
      attemptId: randomUUID(),
    });
    // La ventana guarda el resultado al desarmar el ejercicio: no lo vuelve a hacer contar.
    sent.save();
    const card = space.workspace.cards.get({ cardId: exercise.cardId });
    expect(card.sheet.state).toBe('in_review');
    expect(nextReview(space, exercise.cardId)).toBe(dueBefore);
    expect(resultsOf(space, sessionId)).toMatchObject({ again: 0, flagged: 1 });
  });

  it('[CA-077] en un procedimiento, que se anota al enviar, tampoco', () => {
    const clock = movableClock();
    const space = openSpace({ withCast: 'tarjetas', clock });
    const procedure = cardNamed(space, PROCEDURE_TITLE);
    practice(space, procedure.id);
    clock.advance(1);
    practice(space, procedure.id);
    clock.advance(1);
    practice(space, procedure.id);
    clock.advance(30);
    const { sessionId } = startSession(space, 45);
    const current = untilExercise(space, sessionId, procedure.id);
    const dueBefore = nextReview(space, procedure.id);
    const session = open(space, procedure.id);
    const last = session.view.steps.at(-1)?.id ?? '';
    check(space, procedure.id, session, [last], sessionId);
    space.workspace.study.flag({
      sessionId,
      activityId: current.activityId,
      attemptId: randomUUID(),
    });
    expect(nextReview(space, procedure.id)).toBe(dueBefore);
  });
});

describe('objeción 2: contestar un ejercicio reinicia sus aplazamientos', () => {
  it('pospuesto para más adelante y fallado con «Practicar ahora», vuelve cuando le toca de verdad', () => {
    const { space, clock, exercise, untilDue } = ownSpace();
    const card = exercise('La capital de Italia', 'Roma');
    answer(space, card.id);
    untilDue(card.id);
    space.workspace.study.postpone({ requestId: randomUUID(), when: 'day', day: '2027-12-30' });
    answer(space, card.id, { right: false });
    const due = nextReview(space, card.id) ?? '';
    for (let day = 0; day < 10 && todayOf(space) < due; day += 1) {
      clock.advance(1);
    }
    expect(todayOf(space)).toBe(due);
    expect(space.workspace.study.overview().dueCount).toBe(1);
    const { sessionId } = startSession(space);
    expect(currentOf(space, sessionId).cardId).toBe(card.id);
  });

  it('después de contestarlo, la cuenta de los tres aplazamientos empieza de cero', () => {
    const { space, clock, exercise, untilDue } = ownSpace();
    const card = exercise('La capital de Italia', 'Roma');
    answer(space, card.id);
    untilDue(card.id);
    for (let time = 0; time < 3; time += 1) {
      space.workspace.study.postpone({ requestId: randomUUID(), when: 'tomorrow' });
      clock.advance(1);
    }
    answer(space, card.id);
    untilDue(card.id);
    const again = space.workspace.study.postpone({ requestId: randomUUID(), when: 'tomorrow' });
    expect(again).toMatchObject({ postponed: 1, forced: 0 });
  });
});

describe('objeción 3: un procedimiento solo, con 5 minutos', () => {
  it('la propuesta dice que hay algo vencido aunque no entre', () => {
    const clock = movableClock();
    const space = openSpace({ clock });
    const subject = space.workspace.subjects.create({ name: 'Cuentas', makeActive: true });
    const created = space.workspace.cards.create({
      question: 'Sumar y duplicar',
      answer: 'x',
      subjectId: subject.id,
      activity: {
        type: 'procedure',
        family: null,
        steps: [
          {
            id: 'a',
            prompt: 'Sumá 2 y 3.',
            expected: { type: 'number', formula: '2 + 3', tolerance: 0, unit: null },
            explanation: 'Dos más tres.',
            key: true,
          },
          {
            id: 'b',
            prompt: 'Duplicá el resultado.',
            expected: { type: 'number', formula: 'paso1 * 2', tolerance: 0, unit: null },
            explanation: 'Por dos.',
            key: false,
          },
        ],
      },
    });
    practice(space, created.id);
    clock.advance(1);
    practice(space, created.id);
    clock.advance(1);
    practice(space, created.id);
    clock.advance(30);
    const overview = space.workspace.study.overview({ minutes: 5 });
    expect(overview.dueCount).toBe(1);
    expect(overview.proposal).toMatchObject({ reviews: 0, forTomorrow: 1 });
  });
});

describe('objeciones 5 y 14: después de «Enviar», ni «Saltar» ni «Deshacer»', () => {
  it('«Saltar» no lo manda al final: se sigue con «Siguiente»', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    answer(space, exercise.cardId, { sessionId });
    const view = space.workspace.study.skip({ sessionId, activityId: exercise.activityId });
    expect(view.current?.activityId).toBe(exercise.activityId);
  });

  it('un pedido de «Deshacer» la tarjeta de antes se ignora', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    const undoable = space.workspace.study.view({ sessionId }).undoable;
    answer(space, exercise.cardId, { sessionId });
    const view = space.workspace.study.undo({
      sessionId,
      activityId: undoable?.activityId ?? randomUUID(),
    });
    expect(view.current?.activityId).toBe(exercise.activityId);
  });
});

describe('objeción 6: pausar a mitad de un procedimiento', () => {
  it('al continuar sigue en esa práctica, con la corrección pendiente, y recién al terminarla cuenta', () => {
    const clock = movableClock();
    const space = openSpace({ withCast: 'tarjetas', clock });
    const procedure = cardNamed(space, PROCEDURE_TITLE);
    practice(space, procedure.id);
    clock.advance(1);
    practice(space, procedure.id);
    clock.advance(1);
    practice(space, procedure.id);
    clock.advance(30);
    const { sessionId } = startSession(space, 45);
    const current = untilExercise(space, sessionId, procedure.id);
    const session = open(space, procedure.id);
    const last = session.view.steps.at(-1)?.id ?? '';
    expect(check(space, procedure.id, session, [last], sessionId).kind).toBe('error');
    pause(space, sessionId);
    const resumed = resume(space, sessionId);
    expect(resumed.current?.activityId).toBe(current.activityId);
    const pending = resumed.current?.resume;
    expect(pending?.openingId).toBe(session.openingId);
    // Volver a pedir la corrección de ese mismo envío no lo repite: sigue el error.
    const again = space.workspace.procedures.check({
      cardId: procedure.id,
      openingId: pending?.openingId ?? '',
      attemptId: pending?.requestId ?? '',
      answers: [],
      help: [],
      noIdea: false,
      shownAt: space.clock.now().toISOString(),
      firstInputMs: null,
      submittedMs: null,
      studySessionId: sessionId,
    });
    expect(again.kind).toBe('error');
    const attemptId = again.kind === 'error' ? again.attemptId : '';
    space.workspace.procedures.correction({ attemptId });
    space.workspace.procedures.finish({ attemptId, self: [] });
    expect(done(space, sessionId, current.activityId).current?.activityId).not.toBe(
      current.activityId,
    );
    expect(resultsOf(space, sessionId).again).toBe(1);
  });
});

describe('objeción 7: un corte entre «Enviar» y «Siguiente»', () => {
  it('lo que el programa corrige solo queda anotado: no se vuelve a pedir y vale ese intento', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    answer(space, exercise.cardId, { right: false, sessionId, finalize: false });
    const resumed = resume(space, sessionId);
    expect(resumed.current?.activityId).not.toBe(exercise.activityId);
    expect(resultsOf(space, sessionId)).toMatchObject({ again: 1 });
  });

  it('una respuesta abierta sin comparar no se vuelve a pedir ni cuenta, y vuelve otro día', () => {
    const { space, clock, exercise, card, untilDue } = ownSpace();
    const open_ = exercise('Contá qué es un meandro', 'Una curva del río', 'open');
    card('¿Qué es un delta?', 'La desembocadura en brazos');
    answer(space, open_.id);
    untilDue(open_.id);
    const due = nextReview(space, open_.id);
    const { sessionId } = startSession(space);
    const current = untilExercise(space, sessionId, open_.id);
    // Lo calificado antes (la tarjeta) queda como estaba: el ejercicio no suma ningún resultado.
    const before = resultsOf(space, sessionId);
    answer(space, open_.id, { sessionId, finalize: false });
    const resumed = resume(space, sessionId);
    expect(resumed.current?.activityId).not.toBe(current.activityId);
    expect(resultsOf(space, sessionId)).toEqual(before);
    expect(nextReview(space, open_.id)).toBe(due);
    // El mismo día no vuelve a entrar; al otro, sí.
    expect(space.workspace.study.overview().dueCount).toBe(0);
    clock.advance(1);
    expect(space.workspace.study.overview().dueCount).toBeGreaterThan(0);
  });
});

describe('objeción 8: «Discrepo» ambiguo y después «Saltar»', () => {
  it('cuenta como «En revisión»', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    const sent = answer(space, exercise.cardId, { right: false, sessionId });
    space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'ambiguous',
      verdict: 'incorrect',
      marked: [],
    });
    space.workspace.study.skip({ sessionId, activityId: exercise.activityId });
    expect(resultsOf(space, sessionId).flagged).toBe(1);
  });
});

describe('objeción 9: lo de afuera de la sesión no entra en la sesión', () => {
  it('practicado con la sesión en pausa, igual se pide en la sesión y vale lo de la sesión', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    pause(space, sessionId);
    answer(space, exercise.cardId, { right: true });
    const resumed = resume(space, sessionId);
    expect(resumed.current?.activityId).toBe(exercise.activityId);
    answer(space, exercise.cardId, { right: false, sessionId });
    done(space, sessionId, exercise.activityId);
    expect(resultsOf(space, sessionId)).toMatchObject({ again: 1 });
  });

  it('un envío que dice venir de la sesión, de una actividad que no es la actual, se rechaza', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const decision = cardNamed(
      space,
      'Una tienda quiere saber qué talle de remera reponer primero, con la lista de los talles que vendió el mes pasado.',
    );
    expect(() => answer(space, decision.id, { sessionId })).toThrow();
  });
});

describe('objeción 10: un ejemplo visto no vuelve el mismo día', () => {
  it('sigue vencido, pero entra recién al otro día', () => {
    const clock = movableClock();
    const space = openSpace({ withCast: 'tarjetas', clock });
    const procedure = cardNamed(space, PROCEDURE_TITLE);
    practice(space, procedure.id);
    clock.advance(1);
    practice(space, procedure.id);
    clock.advance(1);
    const last = open(space, procedure.id).view.steps.at(-1)?.id ?? '';
    practice(space, procedure.id, [last]);
    clock.advance(1);
    practice(space, procedure.id, [last]);
    clock.advance(30);
    const first = startSession(space, 45);
    const current = untilExercise(space, first.sessionId, procedure.id);
    const session = open(space, procedure.id);
    expect(session.view.rung.kind).toBe('example');
    space.workspace.procedures.studied({
      cardId: procedure.id,
      openingId: session.openingId,
      studySessionId: first.sessionId,
      why: session.view.steps
        .filter((step) => step.key)
        .map((step) => ({ stepId: step.id, text: 'Porque achica el error.' })),
    });
    done(space, first.sessionId, current.activityId);
    const again = startSession(space, 45);
    for (let turn = 0; turn < 200; turn += 1) {
      const { current: now } = space.workspace.study.view({ sessionId: again.sessionId });
      if (!now) {
        break;
      }
      expect(now.cardId).not.toBe(procedure.id);
      if (now.card.activityType === null) {
        gradeCard(space, again.sessionId, now);
      } else {
        space.workspace.study.skip({ sessionId: again.sessionId, activityId: now.activityId });
        break;
      }
    }
    clock.advance(1);
    const tomorrow = startSession(space, 45);
    expect(untilExercise(space, tomorrow.sessionId, procedure.id).cardId).toBe(procedure.id);
  });
});

describe('objeción 11: la sesión empieza con una tarjeta', () => {
  it('también cuando las únicas tarjetas son nuevas', () => {
    const { space, exercise, card, untilDue } = ownSpace();
    const due = exercise('La capital de Italia', 'Roma');
    answer(space, due.id);
    untilDue(due.id);
    for (const [question, correct] of [
      ['¿Qué es un río?', 'Una corriente de agua'],
      ['¿Qué es un lago?', 'Agua quieta'],
      ['¿Qué es una isla?', 'Tierra rodeada de agua'],
    ] as const) {
      card(question, correct);
    }
    const { view } = startSession(space, 45);
    expect(view.current?.card.activityType).toBeNull();
    expect(view.progress.total).toBeGreaterThan(1);
  });
});

describe('objeción 12: el tope de un paso quieto', () => {
  it('en un ejercicio es de 2 minutos, no el de una tarjeta', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const card = space.workspace.study.inactivityCapMs(sessionId);
    expect(card).toBeLessThan(120_000);
    untilExercise(space, sessionId);
    expect(space.workspace.study.inactivityCapMs(sessionId)).toBe(120_000);
  });
});
