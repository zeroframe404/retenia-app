import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';

// Lo que encontró el revisor independiente de la Fase 17, con la base real: la pregunta dudosa que no
// se apaga nunca, el diagnóstico en las preguntas de opciones, los pasos en «Mis errores», la
// evidencia de una tarjeta que se vació de la Papelera, la comprobación de «Ya lo sé» en Estudiar,
// «Mejorar la tarjeta» por materia, el tipo de error repetido, la cadena de requisitos y «Dividir en
// dos» en la misma materia.

afterEach(() => closeSpaces());

function movableClock(): Clock & { advance: (days: number) => void } {
  let offset = 0;
  return {
    now: () => demoClock(offset).now(),
    advance: (days) => {
      offset += days;
    },
  };
}

function castSpace() {
  const clock = movableClock();
  return { space: openSpace({ clock, withCast: 'tarjetas' }), clock };
}

const statistics = (space: Space) =>
  space.workspace.subjects.list().subjects.find((s) => s.name === 'Estadística básica')?.id ?? '';

const cardNamed = (space: Space, question: string) => {
  const card = space.workspace.cards
    .list({ subjectId: statistics(space) })
    .find((c) => c.question === question);
  if (!card) {
    throw new Error(`El elenco no tiene «${question}»`);
  }
  return card;
};

type Answer = Parameters<Space['workspace']['activities']['submit']>[0]['answer'];

function attempt(space: Space, cardId: string, answer: Answer) {
  const openingId = randomUUID();
  space.workspace.activities.start({ cardId, openingId });
  return space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer,
    help: [],
    noIdea: false,
    shownAt: space.clock.now().toISOString(),
    firstInputMs: 1000,
    submittedMs: 4000,
  });
}

const CAPITAL = 'Capital de Francia';

describe('la pregunta dudosa (objeción 2)', () => {
  it('[CA-153] una duda guardada antes de corregir la tarjeta ya no la marca como dudosa', () => {
    const { space } = castSpace();
    const capital = cardNamed(space, CAPITAL);
    space.workspace.doubts.create({
      doubtId: randomUUID(),
      text: '¿Con tilde?',
      cardId: capital.id,
      sessionId: null,
    });
    expect(attempt(space, capital.id, { type: 'short', text: 'asdf' }).diagnosis?.action).toBe(
      'sendToReview',
    );
    space.workspace.cards.edit({
      cardId: capital.id,
      question: 'Capital de Francia (ciudad)',
      answer: 'París',
      meaningChanged: false,
    });
    expect(attempt(space, capital.id, { type: 'short', text: 'asdf' }).diagnosis).toEqual({
      action: 'forgotten',
      reason: 'forgotten',
    });
  });

  it('[CA-153] «La pregunta era ambigua» deja de contar cuando la tarjeta se corrige y vuelve a «Revisada»', () => {
    const { space } = castSpace();
    const capital = cardNamed(space, CAPITAL);
    const first = attempt(space, capital.id, { type: 'short', text: 'Paris, Francia' });
    space.workspace.activities.appeal({
      attemptId: first.attemptId,
      reason: 'ambiguous',
      verdict: 'incorrect',
    });
    space.workspace.cards.edit({
      cardId: capital.id,
      question: '¿Cuál es la capital de Francia?',
      answer: 'París',
      meaningChanged: false,
      sheet: { state: 'reviewed' },
    });
    expect(attempt(space, capital.id, { type: 'short', text: 'asdf' }).diagnosis).toEqual({
      action: 'forgotten',
      reason: 'forgotten',
    });
  });
});

describe('opciones, pasos y Papelera', () => {
  it('[CA-153] en una pregunta de opciones, fallar dos veces no pide «Probala sin ayuda» (objeción 3)', () => {
    const { space } = castSpace();
    const options = space.workspace.cards
      .list({ subjectId: statistics(space) })
      .find((c) => c.activityType === 'options');
    if (!options) {
      throw new Error('El elenco no tiene una pregunta de opciones');
    }
    const opening = space.workspace.activities.start({
      cardId: options.id,
      openingId: randomUUID(),
    });
    const wrong =
      opening.input.type === 'options'
        ? (opening.input.options.find((option) => option.text === 'La media')?.id ?? '')
        : '';
    const answer = { type: 'options' as const, optionId: wrong, shown: [] as string[] };
    if (opening.input.type === 'options') {
      answer.shown = opening.input.options.map((option) => option.id);
    }
    const once = attempt(space, options.id, answer);
    space.workspace.activities.finalize({ attemptId: once.attemptId, verdict: 'incorrect' });
    expect(attempt(space, options.id, answer).diagnosis).toEqual({
      action: 'forgotten',
      reason: 'forgotten',
    });
  });

  it('[CA-155] en «Mis errores», ordenar pasos muestra el texto de los pasos, no sus identificadores (objeción 4)', () => {
    const { space } = castSpace();
    const order = cardNamed(space, 'Ordená los pasos para encontrar la mediana de 7, 3 y 5');
    const opening = space.workspace.activities.start({ cardId: order.id, openingId: randomUUID() });
    const initial = opening.input.type === 'order' ? opening.input.steps.map((s) => s.id) : [];
    const sent = attempt(space, order.id, {
      type: 'order',
      stepIds: ['contar', 'ordenar', 'leer', 'ubicar'],
      initial,
    });
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const item = space.workspace.progress
      .errors({ subjectId: statistics(space) })
      .groups.flatMap((group) => group.items)
      .find((entry) => entry.attemptId === sent.attemptId);
    expect(item?.written).toBe(
      'Contar cuántos datos hay · Ordenar los datos de menor a mayor · Leer el dato de esa posición · Ubicar la posición del medio',
    );
  });

  it('[CA-151] vaciar la Papelera no le borra la evidencia a un objetivo: su requisito sigue cumplido (objeción 6)', () => {
    const clock = movableClock();
    const space = openSpace({ clock });
    const subject = space.workspace.subjects.create({ name: 'Química', makeActive: true });
    const card = space.workspace.cards.create({
      question: '¿Qué es un ion?',
      answer: 'Un átomo con carga',
      subjectId: subject.id,
    });
    const required = randomUUID();
    const dependent = randomUUID();
    for (const [objectiveId, text, cardIds] of [
      [required, 'Reconocer un ion', [card.id]],
      [dependent, 'Nombrar las sales', []],
    ] as const) {
      space.workspace.objectives.create({
        objectiveId,
        subjectId: subject.id,
        topicId: null,
        text,
        conditions: null,
        kind: 'remember',
        cardIds: [...cardIds],
      });
    }
    for (let day = 0; day < 2; day += 1) {
      space.workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
      clock.advance(1);
    }
    space.workspace.objectives.addRequirement({
      requirementId: randomUUID(),
      objectiveId: dependent,
      requiresId: required,
      kind: 'indispensable',
      status: 'confirmed',
    });
    expect(space.workspace.objectives.panel({ objectiveId: required }).objective.state).toBe(
      'enough',
    );
    space.workspace.cards.remove({ cardId: card.id });
    space.workspace.trash.empty();
    expect(readRows(space.file, `SELECT id FROM cards WHERE id = '${card.id}'`)).toEqual([]);
    expect(space.workspace.objectives.panel({ objectiveId: required }).objective.state).toBe(
      'enough',
    );
    const { proposal } = space.workspace.study.overview({});
    expect(proposal).not.toBeNull();
    expect(proposal?.requirement).toBeNull();
  });

  it('[CA-154] «Dividir en dos» deja las dos tarjetas nuevas en la misma materia (objeción 13)', () => {
    const { space } = castSpace();
    const ninetyFive = cardNamed(
      space,
      '¿Qué significa el 95 % en un intervalo de confianza del 95 %?',
    );
    const { cardIds } = space.workspace.progress.split({
      splitId: randomUUID(),
      cardId: ninetyFive.id,
      parts: [
        { question: '¿Qué describe el 95 %?', answer: 'El procedimiento' },
        { question: '¿Qué no es el 95 %?', answer: 'La probabilidad de este intervalo' },
      ],
    });
    const listed = space.workspace.cards.list({ subjectId: statistics(space) }).map((c) => c.id);
    expect(listed).toEqual(expect.arrayContaining(cardIds));
  });
});

describe('«Ya lo sé» en Estudiar y en el panel (objeciones 7 y 11)', () => {
  function knowAlready(space: Space) {
    const objectiveId = randomUUID();
    const order = cardNamed(space, CAPITAL);
    space.workspace.objectives.create({
      objectiveId,
      subjectId: statistics(space),
      topicId: null,
      text: 'Nombrar capitales',
      conditions: null,
      kind: 'remember',
      cardIds: [order.id],
    });
    space.workspace.objectives.knowAlready({ objectiveId });
    return { objectiveId, cardId: order.id };
  }

  it('[CA-150] la comprobación queda programada: desde el día siguiente Estudiar la pide, y al aprobarla deja de pedirla', () => {
    const { space, clock } = castSpace();
    const { objectiveId, cardId } = knowAlready(space);
    expect(space.workspace.study.overview({}).proposal?.check ?? null).toBeNull();
    clock.advance(1);
    expect(space.workspace.study.overview({}).proposal?.check).toEqual({
      objectiveId,
      objectiveTitle: 'Nombrar capitales',
      practiceCardId: cardId,
    });
    const sent = attempt(space, cardId, { type: 'short', text: 'paris' });
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'correct' });
    expect(space.workspace.study.overview({}).proposal?.check ?? null).toBeNull();
  });

  it('[CA-150] «Hacer la comprobación» se ofrece recién desde el día siguiente', () => {
    const { space, clock } = castSpace();
    const { objectiveId } = knowAlready(space);
    expect(space.workspace.objectives.panel({ objectiveId }).checkAvailable).toBe(false);
    clock.advance(1);
    expect(space.workspace.objectives.panel({ objectiveId }).checkAvailable).toBe(true);
  });
});

describe('«Mejorar la tarjeta», «Mis errores» y la cadena de requisitos (objeciones 15 y 16)', () => {
  it('[CA-154] «Mejorar la tarjeta» muestra solo las de la materia que mirás', () => {
    const { space } = castSpace();
    const other = space.workspace.subjects.create({ name: 'Química', makeActive: false });
    expect(
      space.workspace.progress.improveCards({ subjectId: statistics(space) }).cards,
    ).toHaveLength(1);
    expect(space.workspace.progress.improveCards({ subjectId: other.id }).cards).toEqual([]);
  });

  it('[CA-155] sin materia elegida, «Mis errores» mira la misma materia que «Objetivos»', () => {
    const space = openSpace();
    space.workspace.subjects.createExample();
    space.workspace.subjects.create({ name: 'Química', makeActive: false });
    expect(space.workspace.progress.errors({}).subject?.name).toBe(
      space.workspace.objectives.list({}).subject?.name,
    );
  });

  it('[CA-155] cambiar el tipo de error dos veces con el mismo pedido lo anota una sola vez', () => {
    const { space } = castSpace();
    const sent = attempt(space, cardNamed(space, CAPITAL).id, { type: 'short', text: 'asdf' });
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const changeId = randomUUID();
    space.workspace.progress.setErrorType({ changeId, attemptId: sent.attemptId, type: 'other' });
    space.workspace.progress.setErrorType({ changeId, attemptId: sent.attemptId, type: 'other' });
    expect(
      readRows(space.file, `SELECT id FROM observations WHERE kind = 'mistake.type_set'`),
    ).toHaveLength(1);
  });

  it('[CA-151] con requisitos en cadena (A necesita B, B necesita C), «Antes conviene» nombra el primero que hay que hacer: C', () => {
    const space = openSpace();
    const subject = space.workspace.subjects.create({ name: 'Química', makeActive: true });
    const [a, b, c] = ['Nombrar las sales', 'Reconocer un ion', 'Contar electrones'].map((text) => {
      const objectiveId = randomUUID();
      space.workspace.objectives.create({
        objectiveId,
        subjectId: subject.id,
        topicId: null,
        text,
        conditions: null,
        kind: 'remember',
        cardIds: [],
      });
      return objectiveId;
    });
    for (const [objectiveId, requiresId] of [
      [a, b],
      [b, c],
    ] as const) {
      space.workspace.objectives.addRequirement({
        requirementId: randomUUID(),
        objectiveId: objectiveId ?? '',
        requiresId: requiresId ?? '',
        kind: 'indispensable',
        status: 'confirmed',
      });
    }
    expect(space.workspace.study.overview({}).proposal?.requirement).toMatchObject({
      kind: 'before',
      requiresTitle: 'Contar electrones',
    });
  });
});
