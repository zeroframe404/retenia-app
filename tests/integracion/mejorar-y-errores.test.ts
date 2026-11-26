import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import { inBuenosAires } from '../apoyo/fechas';

// Fase 17 (H-36), con la base real: el diagnóstico tras un fallo (CA-153), la dificultad
// recurrente que saca una tarjeta de los repasos y la manda a «Mejorar la tarjeta» (CA-154) y «Mis
// errores» (CA-155).

afterEach(() => closeSpaces());

const NINETY_FIVE = '¿Qué significa el 95 % en un intervalo de confianza del 95 %?';
const CAPITAL = 'Capital de Francia';

const statistics = (space: Space) => {
  const subject = space.workspace.subjects
    .list()
    .subjects.find((s) => s.name === 'Estadística básica');
  if (!subject) {
    throw new Error('El elenco no tiene «Estadística básica»');
  }
  return subject;
};

const cardNamed = (space: Space, question: string) => {
  const card = space.workspace.cards
    .list({ subjectId: statistics(space).id })
    .find((c) => c.question === question);
  if (!card) {
    throw new Error(`El elenco no tiene «${question}»`);
  }
  return card;
};

type Help = Parameters<Space['workspace']['activities']['submit']>[0]['help'];

function answerShort(space: Space, cardId: string, text: string, help: Help = []) {
  const openingId = randomUUID();
  space.workspace.activities.start({ cardId, openingId });
  return space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer: { type: 'short', text },
    help,
    noIdea: false,
    shownAt: space.clock.now().toISOString(),
    firstInputMs: 1000,
    submittedMs: 5000,
  });
}

const sessionCards = (space: Space): string[] => {
  space.workspace.study.start({ sessionId: randomUUID() });
  const [row] = readRows(
    space.file,
    `SELECT payload FROM observations WHERE kind = 'session.started' ORDER BY seq DESC LIMIT 1`,
  );
  return JSON.parse(String(row?.payload)).activities.map((a: { cardId: string }) => a.cardId);
};

describe('la dificultad recurrente', () => {
  it('[CA-154] la tarjeta del elenco con 4 fallos no está en la cola de repasos: está en «Mejorar la tarjeta», con su cita', () => {
    const space = openSpace({ withCast: true });
    const card = cardNamed(space, NINETY_FIVE);
    expect(sessionCards(space)).not.toContain(card.id);
    expect(space.workspace.progress.improveCards().cards).toEqual([
      {
        cardId: card.id,
        question: NINETY_FIVE,
        answer: expect.stringContaining('si repitiéramos el muestreo'),
        reason: 'total',
        failures: 4,
        hasCite: true,
        isExercise: false,
      },
    ]);
  });

  function threeFailures() {
    const space = openSpace();
    const subject = space.workspace.subjects.create({ name: 'Química', makeActive: true });
    const card = space.workspace.cards.create({
      question: '¿Qué es un ion?',
      answer: 'Un átomo con carga',
      subjectId: subject.id,
    });
    const other = space.workspace.cards.create({
      question: '¿Qué es un átomo?',
      answer: 'La unidad de la materia',
      subjectId: subject.id,
    });
    space.workspace.cards.plantHistory([
      {
        cardId: card.id,
        createdAt: inBuenosAires('01/03/2027 09:00'),
        reviews: [
          { at: inBuenosAires('01/03/2027 10:00'), grade: 'again' },
          { at: inBuenosAires('03/03/2027 10:00'), grade: 'good' },
          { at: inBuenosAires('05/03/2027 10:00'), grade: 'again' },
          { at: inBuenosAires('07/03/2027 10:00'), grade: 'good' },
          { at: inBuenosAires('10/03/2027 10:00'), grade: 'again' },
        ],
      },
      {
        cardId: other.id,
        createdAt: inBuenosAires('01/03/2027 09:00'),
        reviews: [{ at: inBuenosAires('10/03/2027 10:00'), grade: 'again' }],
      },
    ]);
    return { space, card, other };
  }

  it('[CA-154] 3 fallos en 30 días también la sacan, aunque no sean seguidos', () => {
    const { space, card, other } = threeFailures();
    const chosen = sessionCards(space);
    expect(chosen).toContain(other.id);
    expect(chosen).not.toContain(card.id);
    expect(space.workspace.progress.improveCards().cards).toEqual([
      expect.objectContaining({
        cardId: card.id,
        reason: 'thirtyDays',
        failures: 3,
        hasCite: false,
      }),
    ]);
  });

  it('[CA-154] «Reformular» (o «Agregar una pista») la mejora: vuelve a los repasos y los fallos se cuentan desde ahí', () => {
    const { space, card } = threeFailures();
    space.workspace.cards.edit({
      cardId: card.id,
      question: '¿Qué es un ion, en una frase?',
      answer: 'Un átomo con carga',
      meaningChanged: false,
      improve: 'rephrase',
    });
    expect(space.workspace.progress.improveCards().cards).toEqual([]);
    expect(sessionCards(space)).toContain(card.id);
    const [row] = readRows(
      space.file,
      `SELECT payload FROM observations WHERE kind = 'card.improved'`,
    );
    expect(JSON.parse(String(row?.payload))).toMatchObject({ cardId: card.id, action: 'rephrase' });
  });

  it('[CA-154] «Dividir en dos» crea dos tarjetas en el mismo lugar y retira la original con su historial', () => {
    const { space, card } = threeFailures();
    const splitId = randomUUID();
    const parts = [
      { question: '¿Qué es un catión?', answer: 'Un ion con carga positiva' },
      { question: '¿Qué es un anión?', answer: 'Un ion con carga negativa' },
    ];
    const { cardIds } = space.workspace.progress.split({ splitId, cardId: card.id, parts });
    expect(cardIds).toHaveLength(2);
    expect(space.workspace.cards.get({ cardId: card.id }).sheet.state).toBe('retired');
    expect(
      space.workspace.cards.history({ cardId: card.id }).entries.length,
    ).toBeGreaterThanOrEqual(5);
    cardIds.forEach((cardId, index) => {
      expect(space.workspace.cards.get({ cardId })).toMatchObject({
        question: parts[index]?.question,
        answer: parts[index]?.answer,
        topicId: card.topicId,
      });
    });
    expect(space.workspace.progress.improveCards().cards).toEqual([]);
    // Repetir el pedido no crea otras dos.
    expect(space.workspace.progress.split({ splitId, cardId: card.id, parts })).toEqual({
      cardIds,
    });
    expect(readRows(space.file, `SELECT id FROM cards`)).toHaveLength(4);
  });
});

describe('«Mis errores»', () => {
  it('[CA-155] un fallo en una respuesta escrita queda con lo que escribiste, la correcta y el tipo de error, por tema', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const capital = cardNamed(space, CAPITAL);
    const sent = answerShort(space, capital.id, 'asdf');
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const errors = space.workspace.progress.errors({ subjectId: statistics(space).id });
    // Desde la Fase 18 la demostración trae un error de confusión en «Media y dispersión».
    expect(errors.groups.map((group) => [group.topicName, group.items.length])).toEqual([
      ['Media y dispersión', 1],
      [null, 1],
    ]);
    expect(errors.groups.slice(1)).toEqual([
      {
        topicId: null,
        topicName: null,
        items: [
          {
            attemptId: sent.attemptId,
            cardId: capital.id,
            question: CAPITAL,
            written: 'asdf',
            correct: 'París',
            type: 'forgotten',
            typeChosen: false,
            day: '2027-03-15',
            practicable: true,
          },
        ],
      },
    ]);
  });

  it('[CA-155] el tipo de error se cambia a mano (queda en el historial); un intento recalificado como correcto sale de la lista', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const capital = cardNamed(space, CAPITAL);
    const sent = answerShort(space, capital.id, 'Paría');
    space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const item = () =>
      space.workspace.progress
        .errors({ subjectId: statistics(space).id })
        .groups.flatMap((group) => group.items)
        .find((entry) => entry.attemptId === sent.attemptId);
    expect(item()).toMatchObject({ type: 'distraction', typeChosen: false });
    space.workspace.progress.setErrorType({
      changeId: randomUUID(),
      attemptId: sent.attemptId,
      type: 'other',
    });
    expect(item()).toMatchObject({ type: 'other', typeChosen: true });
    expect(
      readRows(space.file, `SELECT id FROM observations WHERE kind = 'mistake.type_set'`),
    ).toHaveLength(1);
    space.workspace.activities.appeal({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
      verdict: 'incorrect',
    });
    expect(item()).toBeUndefined();
  });
});

describe('el diagnóstico tras un fallo', () => {
  it('[CA-153] sin nada raro, es un olvido: «Mirá la explicación»', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const sent = answerShort(space, cardNamed(space, CAPITAL).id, 'asdf');
    expect(sent.diagnosis).toEqual({ action: 'forgotten', reason: 'forgotten' });
    const final = space.workspace.activities.finalize({
      attemptId: sent.attemptId,
      verdict: 'incorrect',
    });
    expect(final.diagnosis).toEqual({ action: 'forgotten', reason: 'forgotten' });
  });

  it('[CA-153] un acierto no lleva diagnóstico', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    expect(answerShort(space, cardNamed(space, CAPITAL).id, 'paris').diagnosis).toBeNull();
  });

  it('[CA-153] primero mira si la vez anterior fue con ayuda: «Probala sin ayuda»', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const capital = cardNamed(space, CAPITAL).id;
    const hinted = answerShort(space, capital, 'París', [
      { kind: 'hint', level: 'A1', index: 0 },
      { kind: 'hint', level: 'A2', index: 1 },
    ]);
    space.workspace.activities.finalize({ attemptId: hinted.attemptId, verdict: 'correct' });
    // Además hay una duda: igual gana la ayuda, que va antes.
    space.workspace.doubts.create({
      doubtId: randomUUID(),
      text: '¿Con tilde?',
      cardId: capital,
      sessionId: null,
    });
    expect(answerShort(space, capital, 'asdf').diagnosis).toEqual({
      action: 'checkUnaided',
      reason: 'previousAided',
    });
  });

  it('[CA-153] después, si la pregunta está marcada como dudosa: «Mandala a revisión»', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const capital = cardNamed(space, CAPITAL).id;
    space.workspace.doubts.create({
      doubtId: randomUUID(),
      text: '¿Con tilde?',
      cardId: capital,
      sessionId: null,
    });
    expect(answerShort(space, capital, 'asdf').diagnosis).toEqual({
      action: 'sendToReview',
      reason: 'doubtful',
    });
  });

  it('[CA-153] después, si falta un requisito: «Andá al requisito»', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const capital = cardNamed(space, CAPITAL).id;
    const geography = randomUUID();
    space.workspace.objectives.create({
      objectiveId: geography,
      subjectId: statistics(space).id,
      topicId: null,
      text: 'Nombrar capitales',
      conditions: null,
      kind: 'remember',
      cardIds: [capital],
    });
    const calculate =
      space.workspace.objectives
        .list({ subjectId: statistics(space).id })
        .topics.flatMap((t) => t.objectives)
        .find((o) => o.title === 'Calcular la media y el desvío')?.id ?? '';
    space.workspace.objectives.addRequirement({
      requirementId: randomUUID(),
      objectiveId: geography,
      requiresId: calculate,
      kind: 'recommended',
      status: 'suggested',
    });
    expect(answerShort(space, capital, 'asdf').diagnosis).toEqual({
      action: 'goToRequirement',
      reason: 'missingRequirement',
      requirement: {
        objectiveId: calculate,
        title: 'Calcular la media y el desvío',
        state: 'not-started',
      },
    });
  });

  it('[CA-153] después, si tu respuesta es la de otra tarjeta: «Practicá la diferencia»; y recién al final, olvido', () => {
    const space = openSpace({ withCast: 'tarjetas' });
    const italy = space.workspace.cards.create({
      question: 'Capital de Italia',
      answer: 'Roma',
      subjectId: statistics(space).id,
      activity: { type: 'short' },
    });
    const capital = cardNamed(space, CAPITAL).id;
    expect(answerShort(space, capital, 'roma').diagnosis).toEqual({
      action: 'practiceDifference',
      reason: 'confusion',
      confusedWith: { cardId: italy.id, question: 'Capital de Italia' },
    });
    const errors = space.workspace.progress.errors({ subjectId: statistics(space).id });
    // Solo queda el de la demostración (Fase 18): lo de recién, sin evaluar, no se anota.
    expect(errors.groups.flatMap((group) => group.items).map((item) => item.written)).toEqual([
      'La media',
    ]);
  });
});
