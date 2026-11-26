import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import type { Activity } from '../../src/core/evaluation';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';

// Fase 16 (H-31 a H-33), con la base real: cada intento queda en el libro mayor, su evaluación se
// enmienda agregando versiones y la agenda se recalcula desde el historial; «Deshacer» agrega otra
// versión y nunca borra nada.

afterEach(() => closeSpaces());

// Un reloj que se puede adelantar de a días, como «+1 día».
function movableClock(): Clock & { advance: (days: number) => void } {
  let offset = 0;
  return {
    now: () => demoClock(offset).now(),
    advance: (days) => {
      offset += days;
    },
  };
}

const OPEN: Activity = {
  type: 'open',
  units: [
    { id: 'u1', text: 'El 95 % habla del procedimiento, no de este intervalo en particular.' },
    {
      id: 'u2',
      text: 'Si se repitiera el muestreo, cerca del 95 % de los intervalos contendría la media.',
    },
    { id: 'u3', text: 'No es la probabilidad de que la media esté en [4,2; 5,8].' },
  ],
};

function exercise(space: Space, question: string, answer: string, activity: Activity) {
  return space.workspace.cards.create({
    question,
    answer,
    activity,
    sheet: { hints: ['¿Orientadora?', 'Concepto.', 'Paso.'], explanation: 'Porque sí.' },
  });
}

// Abre la actividad, manda una respuesta y devuelve lo que propone Retenia.
function practice(
  space: Space,
  cardId: string,
  answer: Parameters<Space['workspace']['activities']['submit']>[0]['answer'],
  options: {
    help?: Parameters<Space['workspace']['activities']['submit']>[0]['help'];
    attemptNo?: number;
    openingId?: string;
  } = {},
) {
  const openingId = options.openingId ?? randomUUID();
  space.workspace.activities.start({ cardId, openingId });
  return space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: options.attemptNo ?? 1,
    answer,
    help: options.help ?? [],
    noIdea: false,
    shownAt: space.clock.now().toISOString(),
    firstInputMs: 1500,
    submittedMs: 9000,
  });
}

const dueOf = (space: Space, cardId: string) => space.workspace.cards.get({ cardId }).nextReviewDay;

const evaluationsOf = (space: Space, attemptId: string) =>
  readRows(
    space.file,
    `SELECT version, verdict, proposed_verdict, source, cause, appeal_reason, affected, engine_signal
       FROM evaluations WHERE attempt_id = '${attemptId}' ORDER BY version`,
  );

describe('el registro de un intento', () => {
  it('«Practicar ahora» guarda el intento con lo escrito, la regla «elegida por mí» y el propósito', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const sent = practice(space, card.id, { type: 'short', text: 'paris' });
    expect(sent.proposed).toBe('correct');
    const [row] = readRows(
      space.file,
      `SELECT kind, payload FROM observations WHERE id = '${sent.attemptId}'`,
    );
    expect(row?.kind).toBe('attempt.submitted');
    const payload = JSON.parse(String(row?.payload));
    expect(payload).toMatchObject({
      cardId: card.id,
      activityType: 'short',
      rule: 'chosen',
      purpose: 'autonomous',
      attemptNo: 1,
      answer: { type: 'short', text: 'paris' },
      helpLevel: 'A0',
      optionsQuestion: false,
      confidence: null,
    });
    expect(payload.sessionId).toBeUndefined();
    // Hasta salir del resultado es una propuesta: todavía no hay evaluación.
    expect(evaluationsOf(space, sent.attemptId)).toEqual([]);
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'correct' });
    expect(evaluationsOf(space, sent.attemptId)).toEqual([
      {
        version: 1,
        verdict: 'correct',
        proposed_verdict: 'correct',
        source: 'rule',
        cause: 'graded',
        appeal_reason: null,
        affected: 0,
        engine_signal: 'good',
      },
    ]);
    expect(dueOf(space, card.id)).toBe('2027-03-17');
  });

  it('un intento sin evaluar queda en el historial y no mueve la agenda', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    practice(space, card.id, { type: 'short', text: 'paris' });
    expect(dueOf(space, card.id)).toBeNull();
    const [entry] = space.workspace.cards.history({ cardId: card.id }).entries;
    expect(entry?.evaluation).toMatchObject({ current: null, activity: 'short' });
  });

  it('un reintento se evalúa y se anota, pero no mueve la agenda', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const openingId = randomUUID();
    const first = practice(space, card.id, { type: 'short', text: 'Paría' }, { openingId });
    space.workspace.activities.finalize({ attemptId: first.attemptId, verdict: 'incorrect' });
    const second = practice(
      space,
      card.id,
      { type: 'short', text: 'París' },
      { openingId, attemptNo: 2 },
    );
    space.workspace.activities.finalize({ attemptId: second.attemptId, verdict: 'correct' });
    expect(dueOf(space, card.id)).toBe('2027-03-16');
    const entries = space.workspace.cards.history({ cardId: card.id }).entries;
    expect(entries.map((entry) => entry.counted)).toEqual([true, false]);
  });

  it('[CA-130] no se puede guardar un resultado más alto que el propuesto; más bajo, sí', () => {
    const space = openSpace();
    const card = exercise(space, 'Un intervalo', 'Tres ideas', OPEN);
    const sent = practice(space, card.id, { type: 'open', text: 'Habla del método.' });
    const proposal = space.workspace.activities.propose({
      attemptId: sent.attemptId,
      marked: ['u1', 'u2'],
    });
    expect(proposal.proposed).toBe('partial');
    expect(proposal.allowed).toEqual(['partial', 'incorrect']);
    expect(() =>
      space.workspace.activities.finalize({
        attemptId: sent.attemptId,
        verdict: 'correct',
        marked: ['u1', 'u2'],
      }),
    ).toThrow();
    space.workspace.activities.finalize({
      attemptId: sent.attemptId,
      verdict: 'incorrect',
      marked: ['u1', 'u2'],
    });
    expect(evaluationsOf(space, sent.attemptId)).toMatchObject([
      { version: 1, verdict: 'incorrect', proposed_verdict: 'partial', source: 'user' },
    ]);
  });

  it('[CA-129] con 3 de 3 unidades marcadas Retenia propone «Correcto.»; con 0, «Todavía no.»', () => {
    const space = openSpace();
    const card = exercise(space, 'Un intervalo', 'Tres ideas', OPEN);
    const sent = practice(space, card.id, { type: 'open', text: 'Algo' });
    expect(sent.proposed).toBe('incorrect');
    expect(sent.detail).toMatchObject({
      type: 'open',
      units: OPEN.type === 'open' ? OPEN.units : [],
    });
    expect(
      space.workspace.activities.propose({ attemptId: sent.attemptId, marked: ['u1', 'u2', 'u3'] })
        .proposed,
    ).toBe('correct');
  });
});

describe('el efecto de la ayuda', () => {
  it('[CA-137] un acierto con pista de concepto llega al motor como «Con dudas» y deja una comprobación sin ayuda para otro día', () => {
    const clock = movableClock();
    const space = openSpace({ clock });
    const card = exercise(space, 'Un intervalo', 'Tres ideas', OPEN);
    const help = [
      { kind: 'hint' as const, level: 'A1' as const, index: 0, atMs: 2000 },
      { kind: 'hint' as const, level: 'A2' as const, index: 1, atMs: 4000 },
    ];
    const sent = practice(space, card.id, { type: 'open', text: 'El método' }, { help });
    const done = space.workspace.activities.finalize({
      attemptId: sent.attemptId,
      verdict: 'correct',
      marked: ['u1', 'u2', 'u3'],
    });
    expect(done.parts.verdict).toBe('hintConcept');
    expect(done.pendingCheck).toBe(true);
    expect(done.checkDay).toBe('2027-03-16');
    expect(evaluationsOf(space, sent.attemptId)).toMatchObject([{ engine_signal: 'hard' }]);
    expect(space.workspace.cards.get({ cardId: card.id }).pendingCheck).toBe(true);
    const [row] = readRows(
      space.file,
      `SELECT payload FROM observations WHERE id = '${sent.attemptId}'`,
    );
    expect(JSON.parse(String(row?.payload))).toMatchObject({ purpose: 'assisted', help });

    clock.advance(1);
    const check = practice(space, card.id, { type: 'open', text: 'El método, sin ayuda' });
    space.workspace.activities.finalize({
      attemptId: check.attemptId,
      verdict: 'correct',
      marked: ['u1', 'u2', 'u3'],
    });
    expect(space.workspace.cards.get({ cardId: card.id }).pendingCheck).toBe(false);
  });

  it('[CA-133] un acierto en opciones se guarda como pregunta de opciones y llega como «Con dudas»', () => {
    const space = openSpace();
    const card = exercise(space, '¿Qué medida cambia menos?', 'La mediana', {
      type: 'options',
      options: [
        { id: 'a', text: 'La mediana', correct: true, explanation: '' },
        { id: 'b', text: 'La media', correct: false, explanation: 'La arrastra el extremo.' },
        {
          id: 'c',
          text: 'El punto medio',
          correct: false,
          explanation: 'Depende de los extremos.',
        },
      ],
    });
    const opened = space.workspace.activities.start({ cardId: card.id, openingId: randomUUID() });
    expect(opened.input).toMatchObject({ type: 'options' });
    const shown = opened.input.type === 'options' ? opened.input.options : [];
    expect(shown).toHaveLength(3);
    expect(shown.every((option) => !('correct' in option))).toBe(true);
    const wrong = practice(space, card.id, {
      type: 'options',
      optionId: 'b',
      shown: shown.map((option) => option.id),
    });
    expect(wrong.detail).toMatchObject({ type: 'options', explanation: 'La arrastra el extremo.' });
    const right = practice(space, card.id, {
      type: 'options',
      optionId: 'a',
      shown: shown.map((option) => option.id),
    });
    space.workspace.activities.finalize({ attemptId: right.attemptId, verdict: 'correct' });
    expect(evaluationsOf(space, right.attemptId)).toMatchObject([{ engine_signal: 'hard' }]);
    expect(dueOf(space, card.id)).toBe('2027-03-16');
  });

  it('[CA-137] una tarjeta de siempre calificada «La sabía» con pista de concepto llega como «Con dudas» y anota la ayuda', () => {
    const space = openSpace();
    const card = space.workspace.cards.create({
      question: '¿Qué es la media?',
      answer: 'El promedio',
    });
    const attemptId = randomUUID();
    space.workspace.cards.review({
      cardId: card.id,
      grade: 'good',
      attemptId,
      help: [{ kind: 'hint', level: 'A2', index: 1, atMs: 3000 }],
    });
    expect(dueOf(space, card.id)).toBe('2027-03-16');
    const [row] = readRows(
      space.file,
      `SELECT payload, schema_version FROM observations WHERE idempotency_key = 'review:${attemptId}'`,
    );
    expect(row?.schema_version).toBe(3);
    expect(JSON.parse(String(row?.payload))).toMatchObject({
      helpLevel: 'A2',
      purpose: 'assisted',
      help: [{ kind: 'hint', level: 'A2', index: 1, atMs: 3000 }],
    });
  });
});

describe('la ayuda dentro de la sesión de Estudiar', () => {
  it('[CA-137] en la sesión, «La sabía» después de una pista de concepto llega al motor como «Con dudas» y queda anotada', () => {
    const space = openSpace({ withCast: true });
    const view = space.workspace.study.start({ sessionId: randomUUID() });
    const current = view.current;
    if (!current) {
      throw new Error('la sesión no trajo ninguna tarjeta');
    }
    const attemptId = randomUUID();
    space.workspace.study.grade({
      sessionId: view.sessionId,
      activityId: current.activityId,
      attemptId,
      grade: 'good',
      answer: 'Cuánto se alejan de la media',
      help: [
        { kind: 'hint', level: 'A1', index: 0, atMs: 1000 },
        { kind: 'hint', level: 'A2', index: 1, atMs: 2000 },
      ],
    });
    const [row] = readRows(
      space.file,
      `SELECT payload FROM observations WHERE idempotency_key = 'review:${attemptId}'`,
    );
    expect(JSON.parse(String(row?.payload))).toMatchObject({
      helpLevel: 'A2',
      purpose: 'assisted',
      sessionId: view.sessionId,
    });
    const [entry] = space.workspace.cards
      .history({ cardId: current.cardId })
      .entries.filter((item) => item.id !== undefined)
      .slice(-1);
    expect(entry).toMatchObject({ result: 'good', counted: true });
    expect(space.workspace.cards.get({ cardId: current.cardId }).pendingCheck).toBe(true);
  });
});

describe('«Discrepo» y la enmienda de una evaluación', () => {
  it('[CA-140] «Mi respuesta era correcta» agrega la respuesta como variante y recalifica el intento con una evaluación nueva', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const sent = practice(space, card.id, { type: 'short', text: 'Ciudad de París' });
    expect(sent.proposed).toBe('incorrect');
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    expect(dueOf(space, card.id)).toBe('2027-03-16');
    const appealed = space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
    });
    if (appealed.kind !== 'amended') {
      throw new Error('tenía que enmendar');
    }
    expect(appealed.notice).toMatchObject({
      before: 'incorrect',
      after: 'correct',
      dueBefore: '2027-03-16',
      dueAfter: '2027-03-17',
      reason: 'answer_correct',
    });
    expect(space.workspace.cards.get({ cardId: card.id }).sheet.variants).toEqual([
      'Ciudad de París',
    ]);
    expect(evaluationsOf(space, sent.attemptId)).toMatchObject([
      { version: 1, verdict: 'incorrect', cause: 'graded' },
      {
        version: 2,
        verdict: 'correct',
        cause: 'appeal',
        appeal_reason: 'answer_correct',
        source: 'rule',
      },
    ]);
    expect(dueOf(space, card.id)).toBe('2027-03-17');
    // La próxima vez, «Ciudad de París» ya es correcta.
    expect(practice(space, card.id, { type: 'short', text: 'ciudad de paris' }).proposed).toBe(
      'correct',
    );
  });

  it('[CA-141] «Deshacer» agrega otra versión, devuelve la agenda y la variante, y el historial muestra las dos calificaciones', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const sent = practice(space, card.id, { type: 'short', text: 'Ciudad de París' });
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const appealed = space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
    });
    if (appealed.kind !== 'amended') {
      throw new Error('tenía que enmendar');
    }
    expect(space.workspace.activities.notices({ cardId: card.id })).toHaveLength(1);
    const undone = space.workspace.activities.undoAmendment({
      amendmentId: appealed.notice.amendmentId,
    });
    expect(undone.verdict).toBe('incorrect');
    expect(undone.nextReviewDay).toBe('2027-03-16');
    expect(dueOf(space, card.id)).toBe('2027-03-16');
    expect(space.workspace.cards.get({ cardId: card.id }).sheet.variants).toEqual([]);
    expect(evaluationsOf(space, sent.attemptId).map((row) => [row.verdict, row.cause])).toEqual([
      ['incorrect', 'graded'],
      ['correct', 'appeal'],
      ['incorrect', 'undo'],
    ]);
    // Deshacer dos veces no agrega nada.
    space.workspace.activities.undoAmendment({ amendmentId: appealed.notice.amendmentId });
    expect(evaluationsOf(space, sent.attemptId)).toHaveLength(3);
    expect(space.workspace.activities.notices({ cardId: card.id })).toEqual([]);
    const [entry] = space.workspace.cards.history({ cardId: card.id }).entries;
    expect(entry?.evaluation).toMatchObject({
      current: 'incorrect',
      versions: ['incorrect', 'correct', 'incorrect'],
    });
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('[CA-141] «Entendido» saca el aviso; la corrección queda', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const sent = practice(space, card.id, { type: 'short', text: 'Ciudad de París' });
    const appealed = space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
      verdict: 'incorrect',
    });
    if (appealed.kind !== 'amended') {
      throw new Error('tenía que enmendar');
    }
    space.workspace.activities.acknowledge({ amendmentId: appealed.notice.amendmentId });
    expect(space.workspace.activities.notices({ cardId: card.id })).toEqual([]);
    expect(dueOf(space, card.id)).toBe('2027-03-17');
  });

  it('[CA-142] «La referencia es incorrecta» pasa la tarjeta a «En revisión» y marca todos sus intentos como afectados: ninguno cuenta como olvido', () => {
    const clock = movableClock();
    const space = openSpace({ clock });
    const card = exercise(space, 'Capital de Francia', 'Roma', { type: 'short' });
    const first = practice(space, card.id, { type: 'short', text: 'Roma' });
    space.workspace.activities.finalize({ attemptId: first.attemptId, verdict: 'correct' });
    clock.advance(3);
    const second = practice(space, card.id, { type: 'short', text: 'París' });
    space.workspace.activities.finalize({ attemptId: second.attemptId, verdict: 'incorrect' });
    const appealed = space.workspace.activities.appeal({
      attemptId: second.attemptId,
      reason: 'reference_incorrect',
    });
    expect(appealed.kind).toBe('amended');
    expect(space.workspace.cards.get({ cardId: card.id }).sheetState).toBe('in_review');
    for (const attempt of [first, second]) {
      expect(evaluationsOf(space, attempt.attemptId).at(-1)).toMatchObject({
        affected: 1,
        cause: 'reference_incorrect',
      });
    }
    const [schedule] = readRows(
      space.file,
      `SELECT reps, lapses FROM card_schedule WHERE card_id = '${card.id}'`,
    );
    expect(schedule).toEqual({ reps: 0, lapses: 0 });
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('«La pregunta era ambigua» marca ese intento como afectado y la tarjeta «En revisión»; los otros intentos siguen contando', () => {
    const clock = movableClock();
    const space = openSpace({ clock });
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const first = practice(space, card.id, { type: 'short', text: 'París' });
    space.workspace.activities.finalize({ attemptId: first.attemptId, verdict: 'correct' });
    clock.advance(2);
    const second = practice(space, card.id, { type: 'short', text: 'Lyon' });
    space.workspace.activities.finalize({ attemptId: second.attemptId, verdict: 'incorrect' });
    const appealed = space.workspace.activities.appeal({
      attemptId: second.attemptId,
      reason: 'ambiguous',
    });
    if (appealed.kind !== 'amended') {
      throw new Error('tenía que enmendar');
    }
    expect(appealed.notice.after).toBe('notCounted');
    expect(space.workspace.cards.get({ cardId: card.id }).sheetState).toBe('in_review');
    expect(evaluationsOf(space, first.attemptId)).toHaveLength(1);
    expect(evaluationsOf(space, second.attemptId).at(-1)).toMatchObject({ affected: 1 });
    const [schedule] = readRows(
      space.file,
      `SELECT reps, lapses FROM card_schedule WHERE card_id = '${card.id}'`,
    );
    expect(schedule).toEqual({ reps: 1, lapses: 0 });
  });

  it('«La referencia está incompleta» se anota, no cambia el resultado y pide editar las unidades de idea', () => {
    const space = openSpace();
    const card = exercise(space, 'Un intervalo', 'Tres ideas', OPEN);
    const sent = practice(space, card.id, { type: 'open', text: 'Otra idea válida' });
    const appealed = space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'reference_incomplete',
      verdict: 'incorrect',
      marked: [],
    });
    expect(appealed).toEqual({ kind: 'editor', field: 'units' });
    expect(evaluationsOf(space, sent.attemptId)).toHaveLength(1);
    const appeals = readRows(
      space.file,
      "SELECT payload FROM observations WHERE kind = 'attempt.appealed'",
    );
    expect(appeals.map((row) => JSON.parse(String(row.payload)).reason)).toEqual([
      'reference_incomplete',
    ]);
    expect(space.workspace.activities.notices({ cardId: card.id })).toEqual([]);
  });

  it('después de enmendar y deshacer, «Verificar datos» rearma todo desde el historial y da 0 diferencias', () => {
    const clock = movableClock();
    const space = openSpace({ clock });
    const card = exercise(space, 'La media de 2, 4 y 9', '5', {
      type: 'numeric',
      value: 5,
      tolerance: 0.05,
      unit: null,
    });
    const first = practice(space, card.id, { type: 'numeric', raw: '5,0' });
    space.workspace.activities.finalize({ attemptId: first.attemptId, verdict: 'correct' });
    clock.advance(2);
    const second = practice(space, card.id, { type: 'numeric', raw: '5.3' });
    const appealed = space.workspace.activities.appeal({
      attemptId: second.attemptId,
      reason: 'answer_correct',
      verdict: 'incorrect',
    });
    if (appealed.kind !== 'amended') {
      throw new Error('tenía que enmendar');
    }
    expect(space.workspace.cards.get({ cardId: card.id }).sheet.variants).toEqual(['5.3']);
    space.workspace.activities.undoAmendment({ amendmentId: appealed.notice.amendmentId });
    expect(space.workspace.verifyData()).toEqual([]);
    const reopened = space.reopen();
    expect(reopened.verifyData()).toEqual([]);
  });
});

describe('ejercicios en la lista y en la cola', () => {
  it('los ejercicios se listan con su tipo, no suman al contador de tarjetas y el día que los practicás no entran en la cola', () => {
    const space = openSpace({ withCast: true });
    const subject = space.workspace.subjects
      .list()
      .subjects.find((item) => item.name === 'Estadística básica');
    if (!subject) {
      throw new Error('falta Estadística básica');
    }
    const before = space.workspace.cards.listWithTotal({ subjectId: subject.id }).total;
    const proposalBefore = space.workspace.study.overview();
    const created = space.workspace.cards.create({
      question: 'La media de 3 y 5',
      answer: '4',
      subjectId: subject.id,
      activity: { type: 'numeric', value: 4, tolerance: 0, unit: null },
    });
    const listed = space.workspace.cards.listWithTotal({ subjectId: subject.id });
    expect(listed.total).toBe(before);
    expect(listed.cards.find((card) => card.id === created.id)?.activityType).toBe('numeric');
    const sent = practice(space, created.id, { type: 'numeric', raw: '9' });
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    expect(space.workspace.study.overview()).toEqual(proposalBefore);
  });

  it('al día siguiente, el ejercicio que quedó vencido entra en la propuesta de Estudiar (Fase 18)', () => {
    const practiced = movableClock();
    const withExercise = openSpace({ clock: practiced, withCast: true });
    const untouched = movableClock();
    const withoutExercise = openSpace({ clock: untouched, withCast: true });
    const created = withExercise.workspace.cards.create({
      question: 'La media de 3 y 5',
      answer: '4',
      activity: { type: 'numeric', value: 4, tolerance: 0, unit: null },
    });
    const sent = practice(withExercise, created.id, { type: 'numeric', raw: '9' });
    withExercise.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    practiced.advance(1);
    untouched.advance(1);
    const after = withExercise.workspace.study.overview();
    const control = withoutExercise.workspace.study.overview();
    expect(after.dueCount).toBe(control.dueCount + 1);
    expect(after.proposal?.why.due).toBe((control.proposal?.why.due ?? 0) + 1);
  });
});

describe('objeciones del revisor: enmiendas, pasos, modo y lo que manda la ventana', () => {
  it('[CA-141] una corrección nueva cierra el aviso anterior: solo se deshace la última y todo vuelve a como estaba', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const sent = practice(space, card.id, { type: 'short', text: 'Lyon' });
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const first = space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
    });
    const second = space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'ambiguous',
    });
    if (first.kind !== 'amended' || second.kind !== 'amended') {
      throw new Error('tenían que enmendar');
    }
    expect(
      space.workspace.activities.notices({ cardId: card.id }).map((notice) => notice.amendmentId),
    ).toEqual([second.notice.amendmentId]);
    // Deshacer la primera, ya cerrada, no cambia nada.
    const rows = evaluationsOf(space, sent.attemptId).length;
    space.workspace.activities.undoAmendment({ amendmentId: first.notice.amendmentId });
    expect(evaluationsOf(space, sent.attemptId)).toHaveLength(rows);
    space.workspace.activities.undoAmendment({ amendmentId: second.notice.amendmentId });
    expect(evaluationsOf(space, sent.attemptId).at(-1)).toMatchObject({
      verdict: 'correct',
      affected: 0,
      cause: 'undo',
    });
    expect(space.workspace.cards.get({ cardId: card.id }).sheetState).toBe('reviewed');
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('[CA-140] «Mi respuesta era correcta» sobre un intento que no cuenta lo deja sin contar', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const sent = practice(space, card.id, { type: 'short', text: 'Lyon' });
    space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'ambiguous',
      verdict: 'incorrect',
    });
    space.workspace.activities.appeal({ attemptId: sent.attemptId, reason: 'answer_correct' });
    expect(evaluationsOf(space, sent.attemptId).at(-1)).toMatchObject({
      verdict: 'correct',
      affected: 1,
    });
  });

  it('[CA-140] en ordenar pasos, «Mi respuesta era correcta» no repite un orden ya aceptado ni el correcto', () => {
    const space = openSpace();
    const steps = [
      { id: 's1', text: 'Ordenar' },
      { id: 's2', text: 'Contar' },
      { id: 's3', text: 'Leer' },
    ];
    const card = exercise(space, 'Ordená', 'Ordenar · Contar · Leer', {
      type: 'order',
      steps,
      acceptedOrders: [],
    });
    for (let n = 0; n < 2; n += 1) {
      const sent = practice(space, card.id, {
        type: 'order',
        stepIds: ['s2', 's1', 's3'],
        initial: ['s3', 's2', 's1'],
      });
      space.workspace.activities.appeal({ attemptId: sent.attemptId, reason: 'answer_correct' });
    }
    const right = practice(space, card.id, {
      type: 'order',
      stepIds: ['s1', 's2', 's3'],
      initial: ['s3', 's2', 's1'],
    });
    space.workspace.activities.appeal({ attemptId: right.attemptId, reason: 'answer_correct' });
    const activity = space.workspace.cards.get({ cardId: card.id }).activity;
    expect(activity?.type === 'order' ? activity.acceptedOrders : null).toEqual([
      ['s2', 's1', 's3'],
    ]);
  });

  it('volver a «Tarjeta (me califico)» deja el modo en práctica', () => {
    const space = openSpace();
    const card = space.workspace.cards.create({
      question: 'La media de 2 y 4',
      answer: '3',
      activity: { type: 'numeric', value: 3, tolerance: 0, unit: null },
      mode: 'evaluation',
    });
    const edited = space.workspace.cards.edit({
      cardId: card.id,
      question: 'La media de 2 y 4',
      answer: '3',
      activity: null,
      mode: 'evaluation',
    });
    expect(edited.mode).toBe('practice');
  });

  it('el principal no le cree a la ventana el nivel de ayuda ni el número de intento', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const openingId = randomUUID();
    space.workspace.activities.start({ cardId: card.id, openingId });
    const sent = space.workspace.activities.submit({
      cardId: card.id,
      openingId,
      attemptId: randomUUID(),
      attemptNo: 7,
      answer: { type: 'short', text: 'París' },
      help: [{ kind: 'solution', level: 'A0' }],
      noIdea: false,
      shownAt: space.clock.now().toISOString(),
      firstInputMs: null,
      submittedMs: null,
    });
    const [row] = readRows(
      space.file,
      `SELECT payload FROM observations WHERE id = '${sent.attemptId}'`,
    );
    expect(JSON.parse(String(row?.payload))).toMatchObject({
      attemptNo: 1,
      helpLevel: 'A4',
      help: [{ kind: 'solution', level: 'A4' }],
    });
  });

  it('en una evaluación, la solución no se puede pedir antes del primer envío aunque la ventana diga que es un reintento', () => {
    const space = openSpace();
    const card = space.workspace.cards.create({
      question: 'Capital de Francia',
      answer: 'París',
      activity: { type: 'short' },
      mode: 'evaluation',
    });
    const openingId = randomUUID();
    space.workspace.activities.start({ cardId: card.id, openingId });
    expect(() =>
      space.workspace.activities.help({
        cardId: card.id,
        openingId,
        kind: 'solution',
        used: [],
        confirmed: true,
        attemptNo: 2,
      }),
    ).toThrow();
  });

  it('la respuesta guardada de un ejercicio sale de la actividad, no de lo que mande la ventana', () => {
    const space = openSpace();
    const card = space.workspace.cards.create({
      question: '¿Cuál?',
      answer: 'Cualquier cosa',
      activity: {
        type: 'options',
        options: [
          { id: 'a', text: 'La buena', correct: true, explanation: '' },
          { id: 'b', text: 'Otra', correct: false, explanation: 'No.' },
          { id: 'c', text: 'Tampoco', correct: false, explanation: 'No.' },
        ],
      },
    });
    expect(card.answer).toBe('La buena');
  });

  it('el paso a «En revisión» que pide «Discrepo» es del sistema: no aparece en «Actividad reciente»', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    const before = space.workspace.activity.recent().length;
    const sent = practice(space, card.id, { type: 'short', text: 'Lyon' });
    space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'reference_incorrect',
      verdict: 'incorrect',
    });
    expect(space.workspace.cards.get({ cardId: card.id }).sheetState).toBe('in_review');
    expect(space.workspace.activity.recent()).toHaveLength(before);
  });

  it('[CA-023] después de que «Discrepo» agrega una variante, la edición anterior ya no se deshace desde «Actividad reciente» (no se pierde la variante)', () => {
    const space = openSpace();
    const card = exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    space.workspace.cards.edit({
      cardId: card.id,
      question: 'Capital de Francia',
      answer: 'París',
      sheet: { explanation: 'Es París.' },
    });
    const edited = space.workspace.activity.recent()[0];
    expect(edited?.canUndo).toBe(true);
    const sent = practice(space, card.id, { type: 'short', text: 'Lutecia' });
    space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
      verdict: 'incorrect',
    });
    const after = space.workspace.activity.recent().find((item) => item.id === edited?.id);
    expect(after?.canUndo).toBe(false);
    expect(space.workspace.cards.get({ cardId: card.id }).sheet.variants).toContain('Lutecia');
  });

  it('«Exportar todo» cuenta tarjetas sin los ejercicios', () => {
    const space = openSpace();
    space.workspace.cards.create({ question: 'Una', answer: 'R' });
    exercise(space, 'Capital de Francia', 'París', { type: 'short' });
    expect(space.workspace.exportCounts().cards).toBe(1);
  });

  it('[CA-130] la propuesta con un resultado más bajo trae sus tres líneas; uno más alto queda en lo propuesto', () => {
    const space = openSpace();
    const card = exercise(space, 'Un intervalo', 'Tres ideas', OPEN);
    const sent = practice(space, card.id, { type: 'open', text: 'Algo' });
    const lowered = space.workspace.activities.propose({
      attemptId: sent.attemptId,
      marked: ['u1', 'u2'],
      verdict: 'incorrect',
    });
    expect(lowered.parts.verdict).toBe('incorrect');
    const raised = space.workspace.activities.propose({
      attemptId: sent.attemptId,
      marked: ['u1', 'u2'],
      verdict: 'correct',
    });
    expect(raised.parts.verdict).toBe('partial');
  });
});
