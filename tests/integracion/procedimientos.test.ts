import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import {
  answersFor,
  cardNamed,
  check,
  movableClock,
  open,
  PROCEDURE_TITLE,
  practice,
  rightAnswers,
} from '../apoyo/procedimiento';

// Fase 18 (H-37), con la base real y el elenco: la escalera de apoyo que se recuerda, la corrección
// por pasos y las variantes del procedimiento.

afterEach(() => closeSpaces());

function setup() {
  const clock = movableClock();
  const space = openSpace({ clock, withCast: 'tarjetas' });
  const cardId = cardNamed(space, PROCEDURE_TITLE).id;
  return { clock, space, cardId };
}

const blanksOf = (view: { steps: { position: number; blank: boolean }[] }) =>
  view.steps.filter((step) => step.blank).map((step) => step.position);

describe('el ejemplo completo', () => {
  it('[CA-157] la primera vez muestra los 4 pasos resueltos y pide «¿Por qué este paso?» en el paso clave; la respuesta se guarda y no se califica', () => {
    const { space, cardId } = setup();
    const session = open(space, cardId);
    expect(session.view.rung).toEqual({ kind: 'example', blanks: 0 });
    expect(session.view.steps).toHaveLength(4);
    expect(session.view.steps.every((step) => !step.blank && step.solved !== null)).toBe(true);
    expect(session.view.steps.filter((step) => step.key).map((step) => step.position)).toEqual([1]);
    expect(session.view.previousWhy).toEqual([]);
    space.workspace.procedures.studied({
      cardId,
      openingId: session.openingId,
      why: [{ stepId: 'error-estandar', text: 'Porque achica el desvío según cuántos datos hay.' }],
    });
    const [row] = readRows(
      space.file,
      `SELECT payload FROM observations WHERE kind = 'procedure.studied'`,
    );
    expect(String(row?.payload)).toContain('Porque achica el desvío según cuántos datos hay.');
    // No se califica: no hay intento, evaluación ni cambio en la agenda.
    expect(
      readRows(
        space.file,
        `SELECT id FROM observations WHERE kind = 'attempt.submitted' AND card_id = '${cardId}'`,
      ),
    ).toEqual([]);
    expect(open(space, cardId).view.previousWhy).toEqual([
      { stepId: 'error-estandar', answer: 'Porque achica el desvío según cuántos datos hay.' },
    ]);
    expect(space.workspace.verifyData()).toEqual([]);
  });
});

describe('la escalera de apoyo', () => {
  it('[CA-158] bien en dos días distintos, el tercero trae el último paso vacío con otros números; dos veces el mismo día no cuentan', () => {
    const { clock, space, cardId } = setup();
    const first = practice(space, cardId);
    // El mismo día no se retira apoyo, aunque lo veas otra vez.
    const again = practice(space, cardId);
    expect(again.view.rung.kind).toBe('example');
    clock.advance(1);
    const second = practice(space, cardId);
    expect(second.view.rung.kind).toBe('example');
    expect(second.ladder).toMatchObject({ change: 'less', next: { kind: 'blanks', blanks: 1 } });
    // «El apoyo no se retira en la misma sesión»: hoy sigue el ejemplo.
    expect(open(space, cardId).view.rung.kind).toBe('example');
    clock.advance(1);
    const third = open(space, cardId);
    expect(third.view.rung).toEqual({ kind: 'blanks', blanks: 1 });
    expect(blanksOf(third.view)).toEqual([4]);
    // El paso vacío no trae el resultado; los demás sí.
    expect(third.view.steps.map((step) => step.solved === null)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    const statements = new Set([first.view.statement, second.view.statement, third.view.statement]);
    expect(statements.size).toBe(3);
  });

  it('[CA-158] y después los dos últimos', () => {
    const { clock, space, cardId } = setup();
    for (let n = 0; n < 4; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    expect(blanksOf(open(space, cardId).view)).toEqual([3, 4]);
  });

  it('[CA-159] el escalón se recuerda al cerrar y abrir Retenia', () => {
    const { clock, space, cardId } = setup();
    practice(space, cardId);
    clock.advance(1);
    practice(space, cardId);
    clock.advance(1);
    practice(space, cardId);
    space.reopen();
    expect(open(space, cardId).view.rung).toEqual({ kind: 'blanks', blanks: 1 });
  });

  it('[CA-159] si la fecha vuelve atrás («Restablecer fecha» o el reloj de Windows), el escalón no retrocede', () => {
    const { clock, space, cardId } = setup();
    practice(space, cardId);
    clock.advance(1);
    practice(space, cardId);
    clock.advance(1);
    practice(space, cardId, ['limite-superior']);
    clock.advance(-2);
    expect(open(space, cardId).view.rung).toEqual({ kind: 'blanks', blanks: 1 });
  });

  it('[CA-159] un fallo aislado repite el escalón con otro problema; dos fallos seguidos del mismo paso traen más apoyo', () => {
    const { clock, space, cardId } = setup();
    for (let n = 0; n < 2; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    const failed = practice(space, cardId, ['limite-superior']);
    expect(failed.verdict).toBe('incorrect');
    expect(failed.ladder).toMatchObject({ change: null, next: { kind: 'blanks', blanks: 1 } });
    clock.advance(1);
    const repeated = practice(space, cardId, ['limite-superior']);
    expect(repeated.view.rung).toEqual({ kind: 'blanks', blanks: 1 });
    expect(repeated.view.statement).not.toBe(failed.view.statement);
    expect(repeated.ladder).toMatchObject({ change: 'more', next: { kind: 'example' } });
    clock.advance(1);
    expect(open(space, cardId).view.rung.kind).toBe('example');
  });
});

describe('la corrección por pasos', () => {
  function atWholeProblem() {
    const { clock, space, cardId } = setup();
    // Ejemplo (2 días) y los tres escalones de pasos vacíos (2 días cada uno).
    for (let n = 0; n < 8; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    return { clock, space, cardId };
  }

  it('[CA-160] con un error en el paso 3, lo dice antes de mostrar la corrección y deja reintentar ese paso', () => {
    const { space, cardId } = atWholeProblem();
    const session = open(space, cardId);
    expect(session.view.rung.kind).toBe('whole');
    expect(blanksOf(session.view)).toEqual([1, 2, 3, 4]);
    const response = check(space, cardId, session, ['margen']);
    expect(response).toMatchObject({ kind: 'error', step: { stepId: 'margen', position: 3 } });
    // Todavía no se ve la corrección: ni los resultados ni las explicaciones.
    expect(JSON.stringify(response)).not.toContain('explanation');
    const attemptId = response.kind === 'error' ? response.attemptId : '';
    expect(
      space.workspace.procedures.retry({
        attemptId,
        stepId: 'margen',
        retryId: randomUUID(),
        written: '1',
      }),
    ).toEqual({ ok: false, next: { stepId: 'margen', position: 3 } });
    const right = rightAnswers(space, cardId, session.openingId).get('margen') ?? '';
    expect(
      space.workspace.procedures.retry({
        attemptId,
        stepId: 'margen',
        retryId: randomUUID(),
        written: right,
      }),
    ).toEqual({ ok: true, next: null });
    const correction = space.workspace.procedures.correction({ attemptId });
    expect(correction.steps.map((step) => step.state)).toEqual(['ok', 'ok', 'fixed', 'ok']);
    expect(correction.steps[2]).toMatchObject({
      written: '999999',
      retried: right,
      expected: right,
    });
    // Con la corrección a la vista ya no se reintenta.
    expect(() =>
      space.workspace.procedures.retry({
        attemptId,
        stepId: 'margen',
        retryId: randomUUID(),
        written: right,
      }),
    ).toThrow();
    const result = space.workspace.procedures.finish({ attemptId, self: [] });
    expect(result.verdict).toBe('partial');
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('[CA-160] sin errores va directo a la corrección y queda «Correcto.»; terminarla dos veces no agrega nada', () => {
    const { space, cardId } = atWholeProblem();
    const session = open(space, cardId);
    const response = check(space, cardId, session);
    expect(response.kind).toBe('correction');
    const attemptId = response.kind === 'correction' ? response.correction.attemptId : '';
    const result = space.workspace.procedures.finish({ attemptId, self: [] });
    expect(result.verdict).toBe('correct');
    expect(space.workspace.procedures.finish({ attemptId, self: [] })).toEqual(result);
    expect(
      readRows(space.file, `SELECT id FROM evaluations WHERE attempt_id = '${attemptId}'`),
    ).toHaveLength(1);
  });

  it('con pasos resueltos a la vista el acierto es con ayuda: llega al motor como «Con dudas»', () => {
    const { clock, space, cardId } = setup();
    for (let n = 0; n < 2; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    practice(space, cardId);
    const [row] = readRows(
      space.file,
      `SELECT e.engine_signal AS signal, json_extract(o.payload, '$.helpLevel') AS level
         FROM evaluations e JOIN observations o ON o.id = e.attempt_id
        WHERE o.card_id = '${cardId}'`,
    );
    expect(row).toEqual({ signal: 'hard', level: 'A3' });
  });

  it('el envío necesita pasos para completar: el ejemplo no se califica', () => {
    const { space, cardId } = setup();
    const session = open(space, cardId);
    expect(() =>
      space.workspace.procedures.check({
        cardId,
        openingId: session.openingId,
        attemptId: randomUUID(),
        answers: answersFor(space, cardId, session),
        help: [],
        noIdea: false,
        shownAt: '2027-03-15T13:00:00.000Z',
        firstInputMs: null,
        submittedMs: null,
      }),
    ).toThrow();
  });
});

describe('las variantes del procedimiento', () => {
  it('[CA-164] sin contestar, el mismo día vuelve la misma; contestada, o al otro día, otros números', () => {
    const { clock, space, cardId } = setup();
    const first = open(space, cardId);
    expect(open(space, cardId).view.statement).toBe(first.view.statement);
    space.workspace.procedures.studied({
      cardId,
      openingId: first.openingId,
      why: [{ stepId: 'error-estandar', text: 'x' }],
    });
    const second = open(space, cardId);
    expect(second.view.statement).not.toBe(first.view.statement);
    clock.advance(1);
    const third = open(space, cardId);
    expect(third.view.statement).not.toBe(second.view.statement);
  });

  it('[CA-164] en un mismo día solo cuenta la primera: dos fallos del mismo paso hoy no cambian el escalón', () => {
    const { clock, space, cardId } = setup();
    for (let n = 0; n < 2; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    practice(space, cardId, ['limite-superior']);
    const second = practice(space, cardId, ['limite-superior']);
    expect(second.ladder).toMatchObject({ counted: false, change: null });
    clock.advance(1);
    expect(open(space, cardId).view.rung).toEqual({ kind: 'blanks', blanks: 1 });
  });
});
