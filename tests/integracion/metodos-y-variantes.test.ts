import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AttemptAnswer } from '../../src/preload/contract/activities';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  cardNamed,
  movableClock,
  PROCEDURE_TITLE,
  practice,
  SET_TITLE,
  statistics,
} from '../apoyo/procedimiento';

// Fase 18 (H-38 y H-39), con la base real y el elenco: elegir el método, el conjunto intercalado,
// la tarjeta de contraste, las familias de variantes, «Consolidado» en «Aplicar» y el
// micro-ejercicio.

afterEach(() => closeSpaces());

const SALARIES =
  'En una empresa, cinco personas ganan entre 500 y 560 y el gerente gana veinte veces más. Querés contar cuál es el sueldo típico.';

function setup() {
  const clock = movableClock();
  const space = openSpace({ clock, withCast: 'tarjetas' });
  return { clock, space };
}

function submit(space: Space, cardId: string, answer: AttemptAnswer, runId?: string) {
  const openingId = randomUUID();
  space.workspace.activities.start({ cardId, openingId });
  const sent = space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer,
    help: [],
    noIdea: false,
    shownAt: '2027-03-15T13:00:00.000Z',
    firstInputMs: null,
    submittedMs: null,
    ...(runId === undefined ? {} : { runId }),
  });
  space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: sent.proposed });
  return sent;
}

describe('la actividad «decisión»', () => {
  it('[CA-161] ofrece los métodos sin decir cuál es y, al elegir, dice el porqué de cada uno', () => {
    const { space } = setup();
    const card = cardNamed(space, SALARIES);
    const openingId = randomUUID();
    const opening = space.workspace.activities.start({ cardId: card.id, openingId });
    expect(opening.input.type).toBe('decision');
    const options = opening.input.type === 'decision' ? opening.input.options : [];
    expect(options.map((option) => option.text).sort()).toEqual([
      'La media',
      'La mediana',
      'La moda',
    ]);
    expect(JSON.stringify(opening)).not.toContain('extremo');
    const sent = submit(space, card.id, { type: 'decision', optionId: 'moda', shown: [] });
    expect(sent.proposed).toBe('incorrect');
    expect(sent.detail).toMatchObject({
      type: 'decision',
      chosenId: 'moda',
      correctText: 'La mediana',
    });
    const whys = sent.detail.type === 'decision' ? sent.detail.options.map((o) => o.why) : [];
    expect(whys).toHaveLength(3);
    expect(whys.every((why) => why.length > 0)).toBe(true);
  });
});

describe('el conjunto intercalado', () => {
  function runWhole(space: Space, runId: string, cardId: string) {
    const seen: string[] = [];
    for (;;) {
      const run = space.workspace.sets.open({ cardId, runId });
      if (run.kind !== 'run' || run.nextCardId === null) {
        return seen;
      }
      seen.push(run.nextCardId);
      submit(space, run.nextCardId, { type: 'numeric', raw: '1' }, run.runId);
    }
  }

  it('[CA-162] 9 problemas, nunca dos seguidos del mismo tipo, ningún enunciado lo nombra y el tipo recién se sabe en el cierre', () => {
    const { space } = setup();
    const set = cardNamed(space, SET_TITLE);
    const runId = randomUUID();
    const first = space.workspace.sets.open({ cardId: set.id, runId });
    expect(first).toMatchObject({ kind: 'run', title: SET_TITLE, total: 9, done: 0 });
    // Mientras se practica, la ventana no recibe ningún tipo.
    expect(JSON.stringify(first)).not.toContain('typeName');
    const seen = runWhole(space, runId, set.id);
    expect(seen).toHaveLength(9);
    for (const cardId of seen) {
      const { question } = space.workspace.cards.get({ cardId });
      expect(question.toLowerCase()).not.toMatch(/\b(media|mediana|moda)\b/);
    }
    const summary = space.workspace.sets.summary({ runId });
    expect(summary.complete).toBe(true);
    const order = summary.order.map((item) => item.typeName);
    expect(order).toHaveLength(9);
    expect([...order].sort()).toEqual([
      'Media',
      'Media',
      'Media',
      'Mediana',
      'Mediana',
      'Mediana',
      'Moda',
      'Moda',
      'Moda',
    ]);
    order.slice(1).forEach((type, index) => {
      expect(type).not.toBe(order[index]);
    });
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('[CA-162] a medias, vuelve donde quedaste (también después de cerrar); terminado, arma otro', () => {
    const { space } = setup();
    const set = cardNamed(space, SET_TITLE);
    const runId = randomUUID();
    const first = space.workspace.sets.open({ cardId: set.id, runId });
    const next = first.kind === 'run' ? (first.nextCardId ?? '') : '';
    submit(space, next, { type: 'numeric', raw: '7' }, runId);
    space.reopen();
    const resumed = space.workspace.sets.open({ cardId: set.id, runId: randomUUID() });
    expect(resumed).toMatchObject({ kind: 'run', runId, done: 1, total: 9 });
    runWhole(space, runId, set.id);
    const again = randomUUID();
    expect(space.workspace.sets.open({ cardId: set.id, runId: again })).toMatchObject({
      runId: again,
      done: 0,
    });
  });

  it('[CA-162] solo con tipos que ya practicaste por separado: lo del conjunto no cuenta', () => {
    const { space } = setup();
    const subjectId = statistics(space).id;
    const numeric = (question: string) =>
      space.workspace.cards.create({
        question,
        answer: '1',
        subjectId,
        activity: { type: 'numeric', value: 1, tolerance: 0, unit: null },
      }).id;
    const types = ['Alfa', 'Beta', 'Gama'].map((name, index) => ({
      id: name,
      name,
      cardIds: [numeric(`Problema ${index} uno`), numeric(`Problema ${index} dos`)],
    }));
    const set = space.workspace.cards.create({
      question: 'Alfa, Beta y Gama',
      answer: '',
      subjectId,
      activity: { type: 'interleaved', types },
    });
    expect(space.workspace.sets.open({ cardId: set.id, runId: randomUUID() })).toEqual({
      kind: 'notReady',
      missing: ['Alfa', 'Beta', 'Gama'],
    });
    submit(space, types[0]?.cardIds[0] ?? '', { type: 'numeric', raw: '1' });
    submit(space, types[1]?.cardIds[1] ?? '', { type: 'numeric', raw: '9' });
    const run = space.workspace.sets.open({ cardId: set.id, runId: randomUUID() });
    expect(run).toMatchObject({ kind: 'run', total: 4 });
  });

  it('[CA-162] no deja guardar un conjunto con un enunciado que nombra un tipo ni con materias mezcladas', () => {
    const { space } = setup();
    const subjectId = statistics(space).id;
    const history = space.workspace.subjects
      .list()
      .subjects.find((item) => item.name === 'Historia argentina');
    const numeric = (question: string, subject = subjectId) =>
      space.workspace.cards.create({
        question,
        answer: '1',
        subjectId: subject,
        activity: { type: 'numeric', value: 1, tolerance: 0, unit: null },
      }).id;
    const set = (cardIds: readonly [string, string]) => () =>
      space.workspace.cards.create({
        question: 'Uno y dos',
        answer: '',
        subjectId,
        activity: {
          type: 'interleaved',
          types: [
            { id: 'a', name: 'Suma', cardIds: [cardIds[0]] },
            { id: 'b', name: 'Resta', cardIds: [cardIds[1]] },
          ],
        },
      });
    expect(set([numeric('Hacé la suma de 1 y 0'), numeric('Cuánto queda')])).toThrow(/namesType/);
    expect(set([numeric('Cuánto hay'), numeric('Cuánto queda', history?.id ?? '')])).toThrow(
      /subjects/,
    );
    expect(set([numeric('Cuánto hay en total'), numeric('Cuánto queda ahora')])).not.toThrow();
  });
});

describe('la tarjeta de contraste', () => {
  it('[CA-163] desde la confusión de «Mis errores» crea «¿En qué se diferencian la media y la mediana?», con tus definiciones', () => {
    const { space } = setup();
    const subjectId = statistics(space).id;
    const mistake = space.workspace.progress
      .errors({ subjectId })
      .groups.flatMap((group) => group.items)
      .find((item) => item.type === 'confusion');
    expect(mistake).toMatchObject({ written: 'La media', correct: 'La mediana' });
    const result = space.workspace.progress.contrast({
      requestId: randomUUID(),
      attemptId: mistake?.attemptId ?? '',
    });
    expect(result).toMatchObject({
      kind: 'created',
      question: '¿En qué se diferencian la media y la mediana?',
    });
    const cardId = result.kind === 'created' ? result.cardId : '';
    const card = space.workspace.cards.get({ cardId });
    expect(card.activityType).toBeNull();
    expect(card.topicName).toBe('Media y dispersión');
    expect(card.answer).toContain('La media: La suma de los valores observados');
    expect(card.answer).toContain('La mediana: ');
    // Tocarlo otra vez no crea otra.
    expect(
      space.workspace.progress.contrast({
        requestId: randomUUID(),
        attemptId: mistake?.attemptId ?? '',
      }),
    ).toEqual({
      kind: 'exists',
      cardId,
      question: '¿En qué se diferencian la media y la mediana?',
    });
  });

  it('[CA-163] si los conceptos no se pueden sacar del error, los pide y crea la tarjeta con los tuyos', () => {
    const { space } = setup();
    const subjectId = statistics(space).id;
    const long = space.workspace.cards.create({
      question: '¿Qué mide el rango?',
      answer: 'La distancia entre el dato más grande y el más chico de toda la muestra tomada.',
      subjectId,
      activity: { type: 'short' },
    });
    const sent = submit(space, long.id, { type: 'short', text: 'otra cosa' });
    expect(
      space.workspace.progress.contrast({ requestId: randomUUID(), attemptId: sent.attemptId }),
    ).toEqual({ kind: 'needsConcepts', first: 'otra cosa', second: '' });
    expect(
      space.workspace.progress.contrast({
        requestId: randomUUID(),
        attemptId: sent.attemptId,
        concepts: ['el rango', 'el desvío'],
      }),
    ).toMatchObject({ kind: 'created', question: '¿En qué se diferencian el rango y el desvío?' });
  });
});

const FAMILY = {
  statements: ['Sumá {a} y {b}.'],
  parameters: [
    { name: 'a', values: [1, 2, 3, 4, 5, 6] },
    { name: 'b', values: [10, 20] },
  ],
  derived: [],
};

function variantExercise(space: Space) {
  return space.workspace.cards.create({
    question: 'Sumar dos números',
    answer: '',
    subjectId: statistics(space).id,
    activity: {
      type: 'numeric',
      value: 11,
      tolerance: 0,
      unit: null,
      family: FAMILY,
      formula: 'a + b',
    },
  });
}

function solveVariant(space: Space, cardId: string, wrong = false) {
  const openingId = randomUUID();
  const opening = space.workspace.activities.start({ cardId, openingId });
  const [a, b] = (opening.statement ?? '').match(/\d+/g)?.map(Number) ?? [];
  const sent = space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer: { type: 'numeric', raw: wrong ? '0' : String((a ?? 0) + (b ?? 0)) },
    help: [],
    noIdea: false,
    shownAt: '2027-03-15T13:00:00.000Z',
    firstInputMs: null,
    submittedMs: null,
  });
  space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: sent.proposed });
  return { statement: opening.statement, sent };
}

describe('un problema numérico con variantes', () => {
  it('[CA-164] cada día trae otros números y la respuesta se calcula', () => {
    const { clock, space } = setup();
    const card = variantExercise(space);
    const first = solveVariant(space, card.id);
    expect(first.sent.proposed).toBe('correct');
    clock.advance(1);
    const second = solveVariant(space, card.id);
    expect(second.sent.proposed).toBe('correct');
    expect(second.statement).not.toBe(first.statement);
    expect(space.workspace.verifyData()).toEqual([]);
  });
});

describe('«Consolidado» en «Aplicar»', () => {
  const objectiveOf = (space: Space, cardId: string) => {
    const objectiveId = randomUUID();
    space.workspace.objectives.create({
      objectiveId,
      subjectId: statistics(space).id,
      topicId: null,
      text: 'Sumar números',
      conditions: null,
      kind: 'apply',
      cardIds: [cardId],
    });
    return () => space.workspace.objectives.panel({ objectiveId });
  };

  it('[CA-165] con 3 aciertos en días distintos y una variante nueva sin ayuda queda «Consolidado», y figura en «Variantes»', () => {
    const { clock, space } = setup();
    const card = variantExercise(space);
    const panel = objectiveOf(space, card.id);
    solveVariant(space, card.id);
    // La primera no es «nueva»: todavía no habías visto otra.
    expect(panel().columns.variants.count).toBe(0);
    clock.advance(1);
    solveVariant(space, card.id);
    expect(panel().columns.variants.count).toBe(1);
    clock.advance(8);
    solveVariant(space, card.id);
    expect(panel().objective.state).toBe('consolidated');
    expect(panel().columns.variants.count).toBe(2);
  });

  it('[CA-165] con el mismo problema de siempre, sin variante nueva, queda en «Suficiente para avanzar» y dice qué falta', () => {
    const { clock, space } = setup();
    const card = space.workspace.cards.create({
      question: 'Sumá 1 y 1',
      answer: '2',
      subjectId: statistics(space).id,
      activity: { type: 'numeric', value: 2, tolerance: 0, unit: null },
    });
    const panel = objectiveOf(space, card.id);
    for (const days of [0, 1, 8]) {
      clock.advance(days);
      submit(space, card.id, { type: 'numeric', raw: '2' });
    }
    expect(panel().objective.state).toBe('enough');
    expect(panel().nextStep).toEqual({
      kind: 'toConsolidated',
      remaining: 0,
      delayedFrom: null,
      needsVariant: true,
    });
  });
});

describe('el micro-ejercicio', () => {
  // Dos días de ejemplo; desde el tercero, el último paso vacío.
  function readyProcedure() {
    const { clock, space } = setup();
    const cardId = cardNamed(space, PROCEDURE_TITLE).id;
    for (let n = 0; n < 2; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    return { clock, space, cardId };
  }

  // Contesta todo con un resultado equivocado.
  function failAll(space: Space, pointKey: string) {
    const microId = randomUUID();
    const micro = space.workspace.micro.open({ microId, pointKey });
    for (const item of micro.items) {
      expect(space.workspace.micro.check({ microId, index: item.index, written: '0' }).ok).toBe(
        false,
      );
    }
    return microId;
  }

  function passMicro(space: Space, pointKey: string, mistakes = 0) {
    const microId = randomUUID();
    const micro = space.workspace.micro.open({ microId, pointKey });
    const started = JSON.parse(
      String(
        readRows(
          space.file,
          `SELECT payload FROM observations WHERE idempotency_key = 'micro:${microId}'`,
        )[0]?.payload,
      ),
    ) as { items: { values: Record<string, number> }[] };
    for (const { index } of micro.items) {
      const item = started.items[index];
      if (!item) {
        throw new Error('Falta un ítem');
      }
      const right = String((item.values.media ?? 0) + 1.96 * (item.values.ee ?? 0)).replace(
        '.',
        ',',
      );
      space.workspace.micro.check({ microId, index, written: index < mistakes ? '0' : right });
    }
    return space.workspace.micro.finish({ microId });
  }

  it('[CA-166] el mismo paso mal en dos problemas distintos lo propone, con 5 a 10 ítems distintos sobre ese paso', () => {
    const { space, cardId } = readyProcedure();
    practice(space, cardId, ['limite-superior']);
    expect(space.workspace.micro.proposal().proposal).toBeNull();
    practice(space, cardId, ['limite-superior']);
    const { proposal } = space.workspace.micro.proposal();
    expect(proposal).toMatchObject({
      cardId,
      title: PROCEDURE_TITLE,
      step: 'Calculá el límite superior del intervalo.',
      items: 7,
    });
    const micro = space.workspace.micro.open({
      microId: randomUUID(),
      pointKey: proposal?.pointKey ?? '',
    });
    expect(micro.items).toHaveLength(7);
    expect(new Set(micro.items.map((item) => item.statement)).size).toBe(7);
    // Cada ítem trae resueltos los pasos de antes y pide ese paso.
    expect(micro.items[0]?.givens.map((given) => given.position)).toEqual([1, 2, 3]);
    expect(micro.items[0]?.prompt).toBe('Calculá el límite superior del intervalo.');
  });

  it('[CA-166] se supera con 2 sesiones al 85 % o más en días distintos; una floja o dos el mismo día no alcanzan', () => {
    const { clock, space, cardId } = readyProcedure();
    practice(space, cardId, ['limite-superior']);
    practice(space, cardId, ['limite-superior']);
    const key = space.workspace.micro.proposal().proposal?.pointKey ?? '';
    // 6 de 7 es 86 %: vale.
    expect(passMicro(space, key, 1)).toEqual({
      correct: 6,
      total: 7,
      good: true,
      goodSessions: 1,
      passed: false,
    });
    // Hoy ya la hiciste: no se vuelve a proponer.
    expect(space.workspace.micro.proposal().proposal).toBeNull();
    expect(passMicro(space, key)).toMatchObject({ goodSessions: 1, passed: false });
    clock.advance(1);
    expect(space.workspace.micro.proposal().proposal?.pointKey).toBe(key);
    expect(passMicro(space, key, 2)).toMatchObject({ good: false, goodSessions: 1 });
    clock.advance(1);
    expect(passMicro(space, key)).toEqual({
      correct: 7,
      total: 7,
      good: true,
      goodSessions: 2,
      passed: true,
    });
    expect(space.workspace.micro.proposal().proposal).toBeNull();
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('la primera respuesta de cada ítem es la que vale', () => {
    const { space, cardId } = readyProcedure();
    practice(space, cardId, ['limite-superior']);
    practice(space, cardId, ['limite-superior']);
    const key = space.workspace.micro.proposal().proposal?.pointKey ?? '';
    const microId = failAll(space, key);
    const retry = space.workspace.micro.check({ microId, index: 0, written: '999' });
    expect(retry.ok).toBe(false);
    expect(space.workspace.micro.finish({ microId })).toMatchObject({ correct: 0, passed: false });
  });
});
