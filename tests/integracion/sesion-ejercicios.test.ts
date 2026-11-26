import { describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openSpace } from '../apoyo/espacio';
import { cardNamed, movableClock, open, PROCEDURE_TITLE, practice } from '../apoyo/procedimiento';
import {
  answer,
  type Current,
  currentOf,
  done,
  gradeCard,
  startSession,
  untilExercise,
} from '../apoyo/sesion-ejercicios';

// Los ejercicios en la sesión de Estudiar (Fase 18, decisión del 24/11/2026). En la demostración,
// los 4 ejercicios con historial vuelven el 16/03; el 15/03 la propuesta es la de siempre.

const SEEDED = [
  'Cinco amigos juntaron 4, 6, 7, 8 y 10 pesos.',
  'Los sueldos de cinco personas son 560, 500, 2000, 540 y 520.',
  'Una zapatería vendió hoy los talles 38, 40, 40, 41, 40, 39 y 41.',
  'En una empresa, cinco personas ganan entre 500 y 560',
];

const nextDaySpace = () => openSpace({ withCast: 'tarjetas', clock: demoClock(1) });

describe('qué ejercicios entran en Estudiar', () => {
  it('el 15/03 ninguno: la propuesta de la demostración sigue en 60 repasos y 10 nuevas', () => {
    const space = openSpace({ withCast: 'tarjetas', clock: demoClock(0) });
    const { proposal } = space.workspace.study.overview();
    expect([proposal?.reviews, proposal?.newCards]).toEqual([60, 10]);
    const { sessionId } = startSession(space);
    expect(() => untilExercise(space, sessionId)).toThrow();
  });

  it('el 16/03 vuelven los 4 que tienen el repaso vencido, y solo esos: los que nunca practicaste no', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space, 45);
    const seen: string[] = [];
    for (let turn = 0; turn < 200; turn += 1) {
      const { current } = space.workspace.study.view({ sessionId });
      if (!current) {
        break;
      }
      if (current.card.activityType === null) {
        gradeCard(space, sessionId, current);
      } else {
        seen.push(current.card.question);
        answer(space, current.cardId, { sessionId });
        done(space, sessionId, current.activityId);
      }
    }
    expect(seen).toHaveLength(4);
    for (const start of SEEDED) {
      expect(seen.some((question) => question.startsWith(start))).toBe(true);
    }
  });

  it('la sesión empieza con una tarjeta y los ejercicios van repartidos', () => {
    const space = nextDaySpace();
    const { sessionId, view } = startSession(space);
    expect(view.current?.card.activityType).toBeNull();
    const positions: number[] = [];
    for (let position = 1; position <= view.progress.total; position += 1) {
      const current = currentOf(space, sessionId);
      if (current.card.activityType === null) {
        if (!current.retry) {
          gradeCard(space, sessionId, current);
        }
      } else {
        positions.push(position);
        answer(space, current.cardId, { sessionId });
        done(space, sessionId, current.activityId);
      }
    }
    expect(positions).toHaveLength(4);
    // No quedan todos juntos al final: entre el primero y el último hay tarjetas.
    expect((positions.at(-1) ?? 0) - (positions[0] ?? 0)).toBeGreaterThan(8);
  });

  it('uno en pausa no entra', () => {
    const space = nextDaySpace();
    const paused = cardNamed(
      space,
      'Cinco amigos juntaron 4, 6, 7, 8 y 10 pesos. Si repartieran todo en partes iguales, ¿cuántos pesos tendría cada uno?',
    );
    space.workspace.cards.setPaused({ cardId: paused.id, paused: true });
    const { sessionId } = startSession(space, 45);
    const cards: string[] = [];
    for (let turn = 0; turn < 200; turn += 1) {
      const { current } = space.workspace.study.view({ sessionId });
      if (!current) {
        break;
      }
      if (current.card.activityType === null) {
        gradeCard(space, sessionId, current);
      } else {
        cards.push(current.cardId);
        answer(space, current.cardId, { sessionId });
        done(space, sessionId, current.activityId);
      }
    }
    expect(cards).toHaveLength(3);
    expect(cards).not.toContain(paused.id);
  });
});

describe('contestar un ejercicio dentro de la sesión', () => {
  it('«Siguiente» pasa a lo que sigue, cuenta en el progreso, no se puede deshacer y repetirlo no suma', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    const before = space.workspace.study.view({ sessionId }).progress.done;
    answer(space, exercise.cardId, { sessionId });
    const after = done(space, sessionId, exercise.activityId);
    expect(after.progress.done).toBe(before + 1);
    expect(after.current?.cardId).not.toBe(exercise.cardId);
    expect(after.undoable).toBeNull();
    expect(done(space, sessionId, exercise.activityId).progress.done).toBe(before + 1);
  });

  it('sin haber enviado nada, «Siguiente» no lo da por hecho', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    expect(done(space, sessionId, exercise.activityId).current?.activityId).toBe(
      exercise.activityId,
    );
  });

  it('uno mal contestado queda en el cierre como dificultad y su próximo repaso cambia', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    const dueBefore = space.workspace.cards.get({ cardId: exercise.cardId }).nextReviewDay;
    answer(space, exercise.cardId, { right: false, sessionId });
    done(space, sessionId, exercise.activityId);
    const summary = space.workspace.study.summary({ sessionId });
    expect(summary.results.again).toBe(1);
    expect(summary.difficulties.flatMap((item) => item.cardIds)).toContain(exercise.cardId);
    expect(space.workspace.cards.get({ cardId: exercise.cardId }).nextReviewDay).not.toBe(
      dueBefore,
    );
  });

  it('si pausás después de enviar y antes de «Siguiente», al retomar no te lo vuelve a pedir', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    answer(space, exercise.cardId, { sessionId });
    space.workspace.study.pause({ sessionId });
    const resumed = space.workspace.study.resume({ sessionId });
    expect(resumed.current?.activityId).not.toBe(exercise.activityId);
    expect(space.workspace.study.summary({ sessionId }).results.good).toBeGreaterThan(0);
  });

  it('si pausás sin haber enviado, al retomar sigue en ese ejercicio', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    space.workspace.study.pause({ sessionId });
    expect(space.workspace.study.resume({ sessionId }).current?.activityId).toBe(
      exercise.activityId,
    );
  });

  it('con «La pregunta era ambigua», queda marcada y no como acierto ni fallo', () => {
    const space = nextDaySpace();
    const { sessionId } = startSession(space);
    const exercise = untilExercise(space, sessionId);
    const { attemptId } = answer(space, exercise.cardId, { right: false, sessionId });
    space.workspace.activities.appeal({
      attemptId,
      reason: 'ambiguous',
      verdict: 'incorrect',
      marked: [],
    });
    done(space, sessionId, exercise.activityId);
    const { results } = space.workspace.study.summary({ sessionId });
    expect([results.again, results.flagged]).toEqual([0, 1]);
  });
});

describe('un procedimiento en la sesión', () => {
  it('vuelve cuando le toca el repaso, y si toca el ejemplo, verlo lo da por hecho sin contarlo como resultado', () => {
    const clock = movableClock();
    const space = openSpace({ withCast: 'tarjetas', clock });
    const procedure = cardNamed(space, PROCEDURE_TITLE);
    // Dos días con el ejemplo, y después dos fallos seguidos en el último paso: vuelve el ejemplo.
    practice(space, procedure.id);
    clock.advance(1);
    practice(space, procedure.id);
    clock.advance(1);
    const first = open(space, procedure.id);
    const last = first.view.steps.at(-1)?.id ?? '';
    practice(space, procedure.id, [last]);
    clock.advance(1);
    practice(space, procedure.id, [last]);
    const due = space.workspace.cards.get({ cardId: procedure.id }).nextReviewDay;
    expect(due).not.toBeNull();
    clock.advance(10);
    const { sessionId } = startSession(space, 45);
    let found: Current | null = null;
    for (let turn = 0; turn < 300 && found === null; turn += 1) {
      const current = currentOf(space, sessionId);
      if (current.card.activityType === null) {
        gradeCard(space, sessionId, current);
      } else if (current.cardId === procedure.id) {
        found = current;
      } else {
        answer(space, current.cardId, { sessionId });
        done(space, sessionId, current.activityId);
      }
    }
    if (found === null) {
      throw new Error('No apareció el procedimiento');
    }
    const before = space.workspace.study.summary({ sessionId }).results;
    const session = open(space, procedure.id);
    expect(session.view.rung.kind).toBe('example');
    space.workspace.procedures.studied({
      cardId: procedure.id,
      openingId: session.openingId,
      studySessionId: sessionId,
      why: session.view.steps
        .filter((step) => step.key)
        .map((step) => ({ stepId: step.id, text: 'Porque achica el error.' })),
    });
    expect(done(space, sessionId, found.activityId).current?.activityId).not.toBe(found.activityId);
    expect(space.workspace.study.summary({ sessionId }).results).toEqual(before);
  });
});
