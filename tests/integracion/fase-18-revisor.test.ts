import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import { validateActivity } from '../../src/core/evaluation';
import { statementNamesType } from '../../src/core/interleave';
import { evaluateFormula, type VariantFamily } from '../../src/core/variants';
import type { AttemptAnswer } from '../../src/preload/contract/activities';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  cardNamed,
  check,
  movableClock,
  open,
  PROCEDURE_TITLE,
  practice,
  SET_TITLE,
  statistics,
} from '../apoyo/procedimiento';

// Lo que encontró el revisor independiente de la Fase 18. Cada prueba reproduce una objeción.

afterEach(() => closeSpaces());

function setup(clock = movableClock()) {
  const space = openSpace({ clock, withCast: 'tarjetas' });
  const cardId = cardNamed(space, PROCEDURE_TITLE).id;
  return { clock, space, cardId };
}

// Dos días de ejemplo: el tercero, el último paso viene vacío.
function atLastBlank() {
  const context = setup();
  for (let n = 0; n < 2; n += 1) {
    practice(context.space, context.cardId);
    context.clock.advance(1);
  }
  return context;
}

const TIMES = { shownAt: '2027-03-15T13:00:00.000Z', firstInputMs: null, submittedMs: null };

function submit(space: Space, cardId: string, answer: AttemptAnswer, openingId = randomUUID()) {
  space.workspace.activities.start({ cardId, openingId });
  const sent = space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer,
    help: [],
    noIdea: false,
    ...TIMES,
  });
  space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: sent.proposed });
  return sent;
}

const currentVerdict = (space: Space, attemptId: string) =>
  readRows(
    space.file,
    `SELECT verdict FROM evaluations WHERE attempt_id = '${attemptId}' ORDER BY version DESC LIMIT 1`,
  )[0]?.verdict;

describe('objeción 2: salir a mitad de la corrección no borra el fallo', () => {
  it('[CA-159] irse en «Hay un error en el paso N» deja el fallo anotado y el otro intento del día no cuenta', () => {
    const { space, cardId } = atLastBlank();
    const session = open(space, cardId);
    const response = check(space, cardId, session, ['limite-superior']);
    expect(response.kind).toBe('error');
    const attemptId = response.kind === 'error' ? response.attemptId : '';
    // Sin tocar nada más: ya cuenta como «Todavía no.».
    expect(currentVerdict(space, attemptId)).toBe('incorrect');
    const again = practice(space, cardId);
    expect(again.ladder).toMatchObject({ counted: false, change: null });
    expect(
      space.workspace.progress
        .errors({ subjectId: statistics(space).id })
        .groups.flatMap((group) => group.items)
        .some((item) => item.attemptId === attemptId),
    ).toBe(true);
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('irse con un paso de texto sin comparar queda en «Todavía no.»; compararlo después lo cambia y el historial muestra solo el final', () => {
    const { clock, space } = setup();
    const card = space.workspace.cards.create({
      question: 'Explicar dos pasos',
      answer: '',
      subjectId: statistics(space).id,
      activity: {
        type: 'procedure',
        family: null,
        steps: [
          {
            id: 'a',
            prompt: 'Primero',
            expected: { type: 'text', text: 'Ordenar' },
            explanation: 'Se ordena.',
            key: true,
          },
          {
            id: 'b',
            prompt: 'Después',
            expected: { type: 'text', text: 'Contar' },
            explanation: 'Se cuenta.',
            key: false,
          },
        ],
      },
    });
    for (let n = 0; n < 2; n += 1) {
      practice(space, card.id);
      clock.advance(1);
    }
    const session = open(space, card.id);
    const response = check(space, card.id, session);
    const attemptId = response.kind === 'correction' ? response.correction.attemptId : '';
    expect(currentVerdict(space, attemptId)).toBe('incorrect');
    space.workspace.procedures.finish({ attemptId, self: [{ stepId: 'b', ok: true }] });
    expect(currentVerdict(space, attemptId)).toBe('correct');
    const entry = space.workspace.cards
      .history({ cardId: card.id })
      .entries.find((item) => item.id === attemptId);
    expect(entry?.evaluation?.versions).toEqual(['correct']);
    // Terminarlo otra vez no cambia el resultado.
    space.workspace.procedures.finish({ attemptId, self: [{ stepId: 'b', ok: false }] });
    expect(currentVerdict(space, attemptId)).toBe('correct');
  });
});

describe('objeción 3: un conjunto solo lleva ejercicios que se contestan en el momento', () => {
  const setWith = (space: Space, problemId: string, otherId: string) => ({
    question: 'Uno y dos',
    answer: '',
    subjectId: statistics(space).id,
    activity: {
      type: 'interleaved' as const,
      types: [
        { id: 'a', name: 'Alfa', cardIds: [problemId] },
        { id: 'b', name: 'Beta', cardIds: [otherId] },
      ],
    },
  });

  it('[CA-162] no deja poner un procedimiento ni una tarjeta de siempre en un tipo', () => {
    const { space, cardId } = setup();
    const other = cardNamed(space, 'La media de 2, 4 y 9').id;
    expect(() => space.workspace.cards.create(setWith(space, cardId, other))).toThrow(
      /unsupported/,
    );
    const plain = cardNamed(space, '¿Qué mide el desvío estándar?').id;
    expect(() => space.workspace.cards.create(setWith(space, plain, other))).toThrow();
  });
});

// Un reloj que se puede poner en cualquier momento de la demostración.
function hourClock(): Clock & { set: (days: number, hours: number) => void } {
  let ms = 0;
  return {
    now: () => new Date(demoClock().now().getTime() + ms),
    set: (days, hours) => {
      ms = days * 86_400_000 + hours * 3_600_000;
    },
  };
}

describe('objeción 4: cruzar las 04:00 no cambia lo que se mostró', () => {
  it('[CA-158] [CA-160] se corrige el escalón que se vio al abrir, aunque se envíe después de las 04:00', () => {
    const clock = hourClock();
    const space = openSpace({ clock, withCast: 'tarjetas' });
    const cardId = cardNamed(space, PROCEDURE_TITLE).id;
    // Dos días de ejemplo y dos con el último paso vacío: el segundo acierto retira otro escalón.
    for (let day = 0; day < 4; day += 1) {
      clock.set(day, 0);
      practice(space, cardId);
    }
    // El 18/03 todavía: «Otro problema» a las 03:50 del día siguiente (mismo día de estudio).
    clock.set(4, -6.2);
    const session = open(space, cardId);
    expect(session.view.steps.filter((step) => step.blank).map((step) => step.position)).toEqual([
      4,
    ]);
    clock.set(4, -5.9);
    const response = check(space, cardId, session);
    expect(response.kind).toBe('correction');
    expect(
      response.kind === 'correction' ? response.correction.steps.map((s) => s.position) : [],
    ).toEqual([4]);
  });
});

const FAMILY = (formula: string): VariantFamily => ({
  statements: ['Con {a}.'],
  parameters: [{ name: 'a', values: Array.from({ length: 100 }, (_, n) => n + 1) }],
  derived: [{ name: 'd', formula }],
});

describe('objeciones 5, 6 y 13: las cuentas', () => {
  it('[CA-164] una cuenta que falla en cualquier variante no se puede guardar', () => {
    const numeric = {
      type: 'numeric' as const,
      value: 0,
      tolerance: 0,
      unit: null,
      family: { ...FAMILY('a'), derived: [] },
      formula: '100 / (a - 70)',
    };
    expect(validateActivity(numeric)).toContain('family');
    expect(
      validateActivity({
        type: 'procedure',
        family: { ...FAMILY('a'), derived: [] },
        steps: [
          {
            id: 'a',
            prompt: 'uno',
            expected: { type: 'number', formula: '100 / (a - 70)', tolerance: 0, unit: null },
            explanation: 'x',
            key: true,
          },
          {
            id: 'b',
            prompt: 'dos',
            expected: { type: 'number', formula: 'paso1', tolerance: 0, unit: null },
            explanation: 'x',
            key: false,
          },
        ],
      }),
    ).toContain('formula');
  });

  it('[CA-164] en una cuenta, «1.500» es mil quinientos, como en las respuestas', () => {
    expect(evaluateFormula('1.500', {})).toBe(1500);
    expect(evaluateFormula('s * 1.000', { s: 7 })).toBe(7000);
    expect(evaluateFormula('1,96 + 1.96 + 0.500', {})).toBeCloseTo(4.42, 10);
    expect(() => evaluateFormula('1.2.3', {})).toThrow();
  });

  it('un «{dato}» mal escrito en un paso no se puede guardar', () => {
    const procedure = {
      type: 'procedure' as const,
      family: { ...FAMILY('a * 2') },
      steps: [
        {
          id: 'a',
          prompt: 'Calculá {a}',
          expected: { type: 'number' as const, formula: 'd', tolerance: 0, unit: null },
          explanation: 'Es {d}.',
          key: true,
        },
        {
          id: 'b',
          prompt: 'dos',
          expected: { type: 'text' as const, text: 'Da {d}' },
          explanation: 'x',
          key: false,
        },
      ],
    };
    expect(validateActivity(procedure)).toEqual([]);
    for (const at of ['prompt', 'explanation'] as const) {
      expect(
        validateActivity({
          ...procedure,
          steps: procedure.steps.map((step, n) => (n === 0 ? { ...step, [at]: '{dd}' } : step)),
        }),
      ).toContain('unknownName');
    }
  });

  it('la «Respuesta» de un numérico con variantes no es la cuenta', () => {
    const { space } = setup();
    const card = space.workspace.cards.create({
      question: 'El doble',
      answer: '',
      subjectId: statistics(space).id,
      activity: {
        type: 'numeric',
        value: 0,
        tolerance: 0,
        unit: null,
        family: {
          statements: ['Doble de {a}'],
          parameters: [{ name: 'a', values: [1, 2, 3] }],
          derived: [],
        },
        formula: 'a * 2',
      },
    });
    expect(card.answer).toBe('Cambia con cada variante.');
  });
});

describe('objeciones 7 y 19: el conjunto no nombra el tipo ni deja dos seguidos', () => {
  it('[CA-162] tampoco los enunciados de las variantes pueden nombrar un tipo, ni en plural', () => {
    const { space } = setup();
    const subjectId = statistics(space).id;
    const named = space.workspace.cards.create({
      question: 'Un problema',
      answer: '',
      subjectId,
      activity: {
        type: 'numeric',
        value: 0,
        tolerance: 0,
        unit: null,
        family: {
          statements: ['Calculá la media de 2 y {a}.'],
          parameters: [{ name: 'a', values: [4, 6] }],
          derived: [],
        },
        formula: '(2 + a) / 2',
      },
    });
    expect(
      space.workspace.cards.validateActivity({
        subjectId,
        activity: {
          type: 'interleaved',
          types: [
            { id: 'a', name: 'Media', cardIds: [named.id] },
            { id: 'b', name: 'Otro', cardIds: [cardNamed(space, 'Capital de Francia').id] },
          ],
        },
      }).problems,
    ).toContain('namesType');
    const names = ['Media', 'Mediana', 'Moda'];
    expect(statementNamesType('Compará las medianas', names)).toBe('Mediana');
    expect(statementNamesType('Las modas del año', names)).toBe('Moda');
    expect(statementNamesType('Calculá las medias', names)).toBe('Media');
  });

  it('[CA-162] si un problema deja de poder practicarse a mitad, no salen dos seguidos del mismo tipo y el cierre muestra lo que salió', () => {
    const { space } = setup();
    const set = cardNamed(space, SET_TITLE);
    const runId = randomUUID();
    const types = new Map<string, string>();
    const activity = space.workspace.cards.get({ cardId: set.id }).activity;
    for (const type of activity?.type === 'interleaved' ? activity.types : []) {
      for (const cardId of type.cardIds) {
        types.set(cardId, type.name);
      }
    }
    const seen: string[] = [];
    for (;;) {
      const run = space.workspace.sets.open({ cardId: set.id, runId });
      if (run.kind !== 'run' || run.nextCardId === null) {
        break;
      }
      const cardId = run.nextCardId;
      seen.push(types.get(cardId) ?? '');
      const openingId = randomUUID();
      space.workspace.activities.start({ cardId, openingId });
      const sent = space.workspace.activities.submit({
        cardId,
        openingId,
        attemptId: randomUUID(),
        attemptNo: 1,
        answer: { type: 'numeric', raw: '1' },
        help: [],
        noIdea: false,
        runId,
        ...TIMES,
      });
      space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: sent.proposed });
      // Al primer problema contestado, se pausan los dos siguientes del orden guardado.
      if (seen.length === 1) {
        const [row] = readRows(
          space.file,
          `SELECT payload FROM observations WHERE idempotency_key = 'set:${runId}'`,
        );
        const items = (JSON.parse(String(row?.payload)) as { items: { cardId: string }[] }).items;
        space.workspace.cards.setPaused({ cardId: items[1]?.cardId ?? '', paused: true });
        space.workspace.cards.setPaused({ cardId: items[2]?.cardId ?? '', paused: true });
      }
    }
    seen.slice(1).forEach((type, index) => {
      expect(type).not.toBe(seen[index]);
    });
    expect(space.workspace.sets.summary({ runId }).order.map((item) => item.typeName)).toEqual(
      seen,
    );
  });
});

describe('objeción 8: una variante ya contestada no vuelve a ser nueva', () => {
  it('[CA-165] agotada la familia, los mismos números no cuentan como variante nueva', () => {
    const { clock, space } = setup();
    const card = space.workspace.cards.create({
      question: 'Doble corto',
      answer: '',
      subjectId: statistics(space).id,
      activity: {
        type: 'numeric',
        value: 0,
        tolerance: 0,
        unit: null,
        family: {
          statements: ['Dato {a}'],
          parameters: [{ name: 'a', values: [2, 4] }],
          derived: [],
        },
        formula: 'a * 2',
      },
    });
    for (let n = 0; n < 4; n += 1) {
      submit(space, card.id, { type: 'numeric', raw: '0' });
      clock.advance(1);
    }
    const news = readRows(
      space.file,
      `SELECT json_extract(payload, '$.variant.isNew') AS fresh FROM observations
        WHERE kind = 'attempt.submitted' AND card_id = '${card.id}' ORDER BY seq`,
    ).map((row) => Number(row.fresh));
    expect(news).toEqual([0, 1, 0, 0]);
  });
});

describe('objeción 9: un procedimiento también se puede discutir y diagnostica el fallo', () => {
  function failedAttempt() {
    const context = atLastBlank();
    const session = open(context.space, context.cardId);
    const response = check(context.space, context.cardId, session, ['limite-superior']);
    const attemptId = response.kind === 'error' ? response.attemptId : '';
    context.space.workspace.procedures.correction({ attemptId });
    const result = context.space.workspace.procedures.finish({ attemptId, self: [] });
    return { ...context, attemptId, result };
  }

  it('[CA-153] tras un fallo dice una sola acción con su motivo, sin contar los pasos resueltos del escalón como ayuda', () => {
    const { result } = failedAttempt();
    expect(result.diagnosis).toEqual({ action: 'forgotten', reason: 'forgotten' });
  });

  it('[CA-142] «La referencia es incorrecta» deja la tarjeta «En revisión» y ese fallo no cuenta', () => {
    const { space, cardId, attemptId } = failedAttempt();
    const appealed = space.workspace.activities.appeal({
      attemptId,
      reason: 'reference_incorrect',
    });
    expect(appealed).toMatchObject({ kind: 'amended', notice: { after: 'notCounted' } });
    expect(space.workspace.cards.get({ cardId }).sheetState).toBe('in_review');
    expect(
      space.workspace.progress
        .errors({ subjectId: statistics(space).id })
        .groups.flatMap((group) => group.items)
        .some((item) => item.attemptId === attemptId),
    ).toBe(false);
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('[CA-139] «Mi respuesta era correcta» recalifica a «Correcto.» y «Deshacer» vuelve atrás', () => {
    const { space, attemptId } = failedAttempt();
    const appealed = space.workspace.activities.appeal({ attemptId, reason: 'answer_correct' });
    expect(appealed).toMatchObject({ kind: 'amended', verdict: 'correct' });
    const amendmentId = appealed.kind === 'amended' ? appealed.notice.amendmentId : '';
    expect(space.workspace.activities.undoAmendment({ amendmentId }).verdict).toBe('incorrect');
    expect(
      space.workspace.activities.appeal({ attemptId, reason: 'reference_incomplete' }),
    ).toEqual({ kind: 'editor', field: 'steps' });
  });
});

describe('objeción 11: un paso con una sola respuesta no da micro-ejercicio', () => {
  it('[CA-166] el valor crítico (siempre 1,96) no se propone: no habría ítems distintos', () => {
    const { clock, space, cardId } = setup();
    // Hasta el problema entero, donde el paso 2 está vacío.
    for (let n = 0; n < 8; n += 1) {
      practice(space, cardId);
      clock.advance(1);
    }
    practice(space, cardId, ['valor-critico']);
    practice(space, cardId, ['valor-critico']);
    expect(space.workspace.micro.proposal().proposal).toBeNull();
    clock.advance(1);
    practice(space, cardId, ['margen']);
    practice(space, cardId, ['margen']);
    const proposal = space.workspace.micro.proposal().proposal;
    expect(proposal?.step).toBe('Calculá el margen de error.');
    const items = space.workspace.micro.open({
      microId: randomUUID(),
      pointKey: proposal?.pointKey ?? '',
    }).items;
    expect(items.length).toBeGreaterThanOrEqual(5);
  });
});

describe('objeción 14: el puente no acepta pedidos fuera de orden', () => {
  it('el ejemplo solo se termina si se mostró el ejemplo y con el porqué de cada paso clave', () => {
    const { space, cardId } = setup();
    const session = open(space, cardId);
    expect(() =>
      space.workspace.procedures.studied({ cardId, openingId: session.openingId, why: [] }),
    ).toThrow();
    expect(() =>
      space.workspace.procedures.studied({
        cardId,
        openingId: randomUUID(),
        why: [{ stepId: 'error-estandar', text: 'x' }],
      }),
    ).toThrow();
    const ready = atLastBlank();
    const later = open(ready.space, ready.cardId);
    expect(() =>
      ready.space.workspace.procedures.studied({
        cardId: ready.cardId,
        openingId: later.openingId,
        why: [{ stepId: 'error-estandar', text: 'x' }],
      }),
    ).toThrow();
  });

  it('un numérico con variantes no se corrige si no se mostró la variante', () => {
    const { space } = setup();
    const card = space.workspace.cards.create({
      question: 'El doble',
      answer: '',
      subjectId: statistics(space).id,
      activity: {
        type: 'numeric',
        value: 0,
        tolerance: 0,
        unit: null,
        family: {
          statements: ['Doble de {a}'],
          parameters: [{ name: 'a', values: [1, 2, 3] }],
          derived: [],
        },
        formula: 'a * 2',
      },
    });
    expect(() =>
      space.workspace.activities.submit({
        cardId: card.id,
        openingId: randomUUID(),
        attemptId: randomUUID(),
        attemptNo: 1,
        answer: { type: 'numeric', raw: '0' },
        help: [],
        noIdea: false,
        ...TIMES,
      }),
    ).toThrow();
  });

  it('una vuelta de un conjunto no sirve para otro', () => {
    const { space } = setup();
    const set = cardNamed(space, SET_TITLE);
    const runId = randomUUID();
    space.workspace.sets.open({ cardId: set.id, runId });
    const activity = space.workspace.cards.get({ cardId: set.id }).activity;
    const other = space.workspace.cards.create({
      question: 'Otro conjunto',
      answer: '',
      subjectId: statistics(space).id,
      activity,
    });
    expect(() => space.workspace.sets.open({ cardId: other.id, runId })).toThrow();
  });
});

describe('objeciones 16, 17 y 18', () => {
  it('[CA-159] sin variantes, la escalera termina en el problema entero', () => {
    const { clock, space } = setup();
    const card = space.workspace.cards.create({
      question: 'Sumar dos y dos',
      answer: '',
      subjectId: statistics(space).id,
      activity: {
        type: 'procedure',
        family: null,
        steps: ['a', 'b'].map((id, n) => ({
          id,
          prompt: `Paso ${id}`,
          expected: { type: 'number' as const, formula: String(n + 1), tolerance: 0, unit: null },
          explanation: 'x',
          key: n === 0,
        })),
      },
    });
    for (let day = 0; day < 10; day += 1) {
      practice(space, card.id);
      clock.advance(1);
    }
    expect(open(space, card.id).view.rung.kind).toBe('whole');
  });

  it('el procedimiento y el conjunto son siempre de práctica', () => {
    const { space } = setup();
    const procedure = space.workspace.cards.get({
      cardId: cardNamed(space, PROCEDURE_TITLE).id,
    });
    const created = space.workspace.cards.create({
      question: 'Otro procedimiento',
      answer: '',
      subjectId: statistics(space).id,
      activity: procedure.activity,
      mode: 'evaluation',
    });
    expect(space.workspace.cards.get({ cardId: created.id }).mode).toBe('practice');
  });

  it('[CA-163] el mismo pedido crea una sola tarjeta de contraste, aunque cambien los conceptos', () => {
    const { space } = setup();
    const mistake = space.workspace.progress
      .errors({ subjectId: statistics(space).id })
      .groups.flatMap((group) => group.items)
      .find((item) => item.type === 'confusion');
    const requestId = randomUUID();
    const attemptId = mistake?.attemptId ?? '';
    const first = space.workspace.progress.contrast({ requestId, attemptId });
    const second = space.workspace.progress.contrast({
      requestId,
      attemptId,
      concepts: ['una cosa', 'otra cosa'],
    });
    expect(second).toEqual({ ...first, kind: 'exists' });
  });

  it('[CA-163] la respuesta no sale de una tarjeta retirada ni de otra cosa que se llame parecido', () => {
    const { space } = setup();
    const subjectId = statistics(space).id;
    const media = cardNamed(space, '¿Qué es la media muestral?');
    space.workspace.cards.edit({
      cardId: media.id,
      question: media.question,
      answer: media.answer,
      sheet: { state: 'retired' },
    });
    space.workspace.cards.create({
      question: '¿Qué es la media ponderada?',
      answer: 'Otra cosa.',
      subjectId,
    });
    const mistake = space.workspace.progress
      .errors({ subjectId })
      .groups.flatMap((group) => group.items)
      .find((item) => item.type === 'confusion');
    const result = space.workspace.progress.contrast({
      requestId: randomUUID(),
      attemptId: mistake?.attemptId ?? '',
    });
    const answer =
      result.kind === 'created' ? space.workspace.cards.get({ cardId: result.cardId }).answer : '';
    expect(answer).not.toContain('Otra cosa.');
    expect(answer).not.toContain('La suma de los valores observados');
    expect(answer).toContain('La media: El sueldo del gerente');
  });
});
