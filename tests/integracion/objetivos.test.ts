import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';

// Fase 17 (H-34 y H-35), con la base real y el elenco: los objetivos, sus actividades, el estado
// que sale de la evidencia, el panel, «Ya lo sé», «No quiero esto ahora» y los requisitos que
// cambian la propuesta de Estudiar.

afterEach(() => closeSpaces());

const OPEN_QUESTION =
  'Un intervalo de confianza del 95 % para la media es [4,2; 5,8]. ¿Qué significa ese 95 %?';
const MEAN_QUESTION = 'La media de 2, 4 y 9';
const CALCULATE = 'Calcular la media y el desvío';
const INTERPRET = 'Interpretar un intervalo de confianza';

// Un reloj que se puede adelantar de a días, como «+1 día» de la demostración.
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
  const space = openSpace({ clock, withCast: 'tarjetas' });
  return { space, clock };
}

const statistics = (space: Space) => {
  const subject = space.workspace.subjects
    .list()
    .subjects.find((s) => s.name === 'Estadística básica');
  if (!subject) {
    throw new Error('El elenco no tiene «Estadística básica»');
  }
  return subject;
};

const topicNamed = (space: Space, name: string) => {
  const topic = space.workspace.topics
    .list({ subjectId: statistics(space).id })
    .topics.find((t) => t.name === name);
  if (!topic) {
    throw new Error(`El elenco no tiene el tema «${name}»`);
  }
  return topic;
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

function createInterpret(space: Space) {
  const objectiveId = randomUUID();
  space.workspace.objectives.create({
    objectiveId,
    subjectId: statistics(space).id,
    topicId: topicNamed(space, 'Intervalos de confianza').id,
    text: INTERPRET,
    conditions: null,
    kind: 'understand',
    cardIds: [cardNamed(space, OPEN_QUESTION).id],
  });
  return objectiveId;
}

const HINTS = {
  orienting: { kind: 'hint' as const, level: 'A1' as const, index: 0 },
  concept: { kind: 'hint' as const, level: 'A2' as const, index: 1 },
};

// Practica el ejercicio abierto y marca las unidades cubiertas (como M17.2 a M17.6).
function practiceOpen(
  space: Space,
  units: number,
  help: (typeof HINTS)[keyof typeof HINTS][] = [],
): string {
  const cardId = cardNamed(space, OPEN_QUESTION).id;
  const openingId = randomUUID();
  space.workspace.activities.start({ cardId, openingId });
  const sent = space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer: { type: 'open', text: 'El 95 % es del procedimiento.' },
    help,
    noIdea: false,
    shownAt: space.clock.now().toISOString(),
    firstInputMs: 1000,
    submittedMs: 8000,
  });
  const marked = ['idea-1', 'idea-2', 'idea-3'].slice(0, units);
  const proposal = space.workspace.activities.propose({ attemptId: sent.attemptId, marked });
  space.workspace.activities.finalize({
    attemptId: sent.attemptId,
    verdict: proposal.proposed,
    marked,
  });
  return sent.attemptId;
}

const summaryOf = (space: Space, objectiveId: string) =>
  space.workspace.objectives
    .list({ subjectId: statistics(space).id })
    .topics.flatMap((topic) => topic.objectives)
    .find((objective) => objective.id === objectiveId);

describe('crear un objetivo', () => {
  it('[CA-143] «Interpretar un intervalo de confianza», de tipo «Comprender», con el ejercicio abierto: aparece en Progreso «Sin iniciar»', () => {
    const { space } = castSpace();
    const objectiveId = createInterpret(space);
    const list = space.workspace.objectives.list({ subjectId: statistics(space).id });
    const topic = list.topics.find((t) => t.name === 'Intervalos de confianza');
    expect(topic?.objectives.find((o) => o.id === objectiveId)).toEqual({
      id: objectiveId,
      implicit: false,
      topicId: topicNamed(space, 'Intervalos de confianza').id,
      topicName: 'Intervalos de confianza',
      title: INTERPRET,
      kind: 'understand',
      state: 'not-started',
      toVerify: false,
      postponed: false,
      activityCount: 1,
    });
    // El implícito del tema sigue, con las demás tarjetas, y va primero.
    expect(topic?.objectives[0]).toMatchObject({
      implicit: true,
      title: 'Intervalos de confianza',
      kind: 'remember',
    });
    // El ejercicio ya es del objetivo nuevo.
    const activities = space.workspace.objectives.activities({
      subjectId: statistics(space).id,
      topicId: topicNamed(space, 'Intervalos de confianza').id,
    }).activities;
    expect(activities.find((a) => a.question === OPEN_QUESTION)).toMatchObject({
      isExercise: true,
      objectiveId,
      objectiveTitle: INTERPRET,
      objectiveImplicit: false,
    });
  });

  it('[CA-143] el elenco trae «Calcular la media y el desvío», de tipo «Aplicar», «Sin iniciar», con «La media de 2, 4 y 9»', () => {
    const { space } = castSpace();
    const list = space.workspace.objectives.list({ subjectId: statistics(space).id });
    const calculate = list.topics
      .find((t) => t.name === 'Media y dispersión')
      ?.objectives.find((o) => o.title === CALCULATE);
    expect(calculate).toMatchObject({
      implicit: false,
      kind: 'apply',
      state: 'not-started',
      activityCount: 1,
    });
    const panel = space.workspace.objectives.panel({ objectiveId: calculate?.id ?? '' });
    expect(panel.activities.map((a) => a.question)).toEqual([MEAN_QUESTION]);
    expect(panel.previousAttempts).toBe(0);
  });

  it('[CA-143] guarda la acción observable, el contenido y las condiciones; el objetivo no se puede modificar', () => {
    const { space } = castSpace();
    const objectiveId = randomUUID();
    const created = space.workspace.objectives.create({
      objectiveId,
      subjectId: statistics(space).id,
      topicId: null,
      text: '  Entender la mediana ',
      conditions: 'sin mirar apuntes',
      kind: 'remember',
      cardIds: [],
    });
    expect(created).toEqual({ objectiveId, observable: false });
    const [row] = readRows(
      space.file,
      `SELECT title, action, content, conditions, kind, concept_key FROM objectives WHERE id = '${objectiveId}'`,
    );
    expect(row).toEqual({
      title: 'Entender la mediana',
      action: 'Entender',
      content: 'la mediana',
      conditions: 'sin mirar apuntes',
      kind: 'remember',
      concept_key: 'mediana',
    });
    expect(() =>
      readRows(space.file, `UPDATE objectives SET title = 'Otro' WHERE id = '${objectiveId}'`),
    ).toThrow(/no se modifica/);
    // Repetir el pedido no crea otro.
    space.workspace.objectives.create({
      objectiveId,
      subjectId: statistics(space).id,
      topicId: null,
      text: 'Entender la mediana',
      conditions: null,
      kind: 'remember',
      cardIds: [],
    });
    expect(
      readRows(space.file, `SELECT id FROM objectives WHERE id = '${objectiveId}'`),
    ).toHaveLength(1);
  });

  it('[CA-143] una tarjeta o un tema de otra materia no se enlazan', () => {
    const { space } = castSpace();
    const other = space.workspace.subjects.create({ name: 'Química', makeActive: false });
    expect(() =>
      space.workspace.objectives.create({
        objectiveId: randomUUID(),
        subjectId: other.id,
        topicId: topicNamed(space, 'Intervalos de confianza').id,
        text: INTERPRET,
        conditions: null,
        kind: 'understand',
        cardIds: [],
      }),
    ).toThrow();
    expect(() =>
      space.workspace.objectives.create({
        objectiveId: randomUUID(),
        subjectId: other.id,
        topicId: null,
        text: INTERPRET,
        conditions: null,
        kind: 'understand',
        cardIds: [cardNamed(space, OPEN_QUESTION).id],
      }),
    ).toThrow();
  });
});

describe('el estado sale de la evidencia', () => {
  it('[CA-144] [CA-145] [CA-146] [CA-147] [CA-148] [CA-149] las pruebas manuales M17.2 a M17.7, con intentos reales sobre el ejercicio abierto', () => {
    const { space, clock } = castSpace();
    const objectiveId = createInterpret(space);
    // M17.2, 15/03: con pista de concepto y las 3 unidades.
    practiceOpen(space, 3, [HINTS.orienting, HINTS.concept]);
    expect(summaryOf(space, objectiveId)?.state).toBe('in-practice');
    expect(space.workspace.objectives.panel({ objectiveId }).columns.aided).toEqual({
      count: 1,
      lastDay: '2027-03-15',
    });
    // M17.3, 16/03: sin pistas.
    clock.advance(1);
    practiceOpen(space, 3);
    expect(summaryOf(space, objectiveId)?.state).toBe('in-practice');
    // M17.4, 17/03.
    clock.advance(1);
    practiceOpen(space, 3);
    expect(summaryOf(space, objectiveId)?.state).toBe('enough');
    // M17.5, 24/03.
    clock.advance(7);
    practiceOpen(space, 3);
    expect(summaryOf(space, objectiveId)?.state).toBe('consolidated');
    // M17.6, 25/03: 0 unidades.
    clock.advance(1);
    practiceOpen(space, 0);
    expect(summaryOf(space, objectiveId)?.state).toBe('to-review');
    // M17.7: el panel.
    const panel = space.workspace.objectives.panel({ objectiveId });
    expect(panel.columns).toEqual({
      unaided: { count: 3, lastDay: '2027-03-24' },
      aided: { count: 1, lastDay: '2027-03-15' },
      delayed: { count: 1, lastDay: '2027-03-24' },
      variants: { count: 0, lastDay: null },
    });
    expect(panel.nextStep).toEqual({ kind: 'recover' });
    expect(panel.estimate).toEqual({
      concept: 'intervalo de confianza',
      outOfTen: 6,
      observations: 5,
    });
  });

  it('[CA-144] solo cuenta el primer intento del día: practicar dos veces el mismo día no avanza', () => {
    const { space, clock } = castSpace();
    const objectiveId = createInterpret(space);
    practiceOpen(space, 3);
    practiceOpen(space, 3);
    expect(summaryOf(space, objectiveId)?.state).toBe('in-practice');
    clock.advance(1);
    practiceOpen(space, 3);
    expect(summaryOf(space, objectiveId)?.state).toBe('enough');
  });

  it('[CA-148] un acierto con «Vas bien.» es práctica: no cuenta como acierto sin ayuda', () => {
    const { space, clock } = castSpace();
    const objectiveId = createInterpret(space);
    practiceOpen(space, 3);
    clock.advance(1);
    practiceOpen(space, 2);
    expect(summaryOf(space, objectiveId)?.state).toBe('in-practice');
    expect(space.workspace.objectives.panel({ objectiveId }).columns.unaided.count).toBe(1);
  });

  it('[CA-149] cambiar una actividad de objetivo no borra evidencia: el anterior la conserva y el nuevo la muestra como de otro objetivo', () => {
    const { space } = castSpace();
    const subjectId = statistics(space).id;
    const topicId = topicNamed(space, 'Media y dispersión').id;
    const implicit = `topic:${topicId}`;
    const before = space.workspace.objectives.panel({ objectiveId: implicit });
    const desvio = cardNamed(space, '¿Qué mide el desvío estándar?');
    const objectiveId = randomUUID();
    space.workspace.objectives.create({
      objectiveId,
      subjectId,
      topicId,
      text: 'Explicar el desvío estándar',
      conditions: null,
      kind: 'understand',
      cardIds: [desvio.id],
    });
    const moved = space.workspace.objectives.panel({ objectiveId });
    expect(moved.objective.state).toBe('not-started');
    expect(moved.previousAttempts).toBe(3);
    const after = space.workspace.objectives.panel({ objectiveId: implicit });
    expect(after.columns).toEqual(before.columns);
    expect(after.objective.state).toBe(before.objective.state);
    expect(after.activities.map((a) => a.cardId)).not.toContain(desvio.id);
    // Y vuelve al implícito sin perder nada.
    space.workspace.objectives.link({
      linkId: randomUUID(),
      objectiveId: null,
      cardIds: [desvio.id],
    });
    expect(
      space.workspace.objectives.panel({ objectiveId: implicit }).activities.map((a) => a.cardId),
    ).toContain(desvio.id);
    expect(space.workspace.objectives.panel({ objectiveId }).activities).toEqual([]);
  });
});

describe('«Ya lo sé» y «No quiero esto ahora»', () => {
  it('[CA-150] «Ya lo sé» deja «Suficiente (por verificar)» con la comprobación desde mañana; fallarla lleva a «En práctica»', () => {
    const { space, clock } = castSpace();
    const objectiveId = createInterpret(space);
    space.workspace.objectives.knowAlready({ objectiveId });
    expect(summaryOf(space, objectiveId)).toMatchObject({ state: 'enough', toVerify: true });
    const panel = space.workspace.objectives.panel({ objectiveId });
    expect(panel.pendingCheckFrom).toBe('2027-03-16');
    expect(panel.nextStep).toEqual({ kind: 'check', from: '2027-03-16' });
    clock.advance(1);
    practiceOpen(space, 0);
    expect(summaryOf(space, objectiveId)).toMatchObject({ state: 'in-practice', toVerify: false });
  });

  it('[CA-150] aprobar la comprobación sin ayuda otro día quita la marca; «Ya lo sé» solo vale en «Sin iniciar»', () => {
    const { space, clock } = castSpace();
    const objectiveId = createInterpret(space);
    space.workspace.objectives.knowAlready({ objectiveId });
    clock.advance(1);
    practiceOpen(space, 3);
    expect(summaryOf(space, objectiveId)).toMatchObject({ state: 'enough', toVerify: false });
    // Ya no está «Sin iniciar»: «Ya lo sé» no corresponde.
    expect(() => space.workspace.objectives.knowAlready({ objectiveId })).toThrow();
  });

  it('[CA-152] «No quiero esto ahora» lo pospone sin borrar nada; «Retomar» lo devuelve', () => {
    const { space } = castSpace();
    const objectiveId = createInterpret(space);
    practiceOpen(space, 3);
    space.workspace.objectives.postpone({ objectiveId });
    expect(summaryOf(space, objectiveId)).toMatchObject({ postponed: true, state: 'in-practice' });
    space.workspace.objectives.resume({ objectiveId });
    expect(summaryOf(space, objectiveId)).toMatchObject({ postponed: false, state: 'in-practice' });
    expect(space.workspace.objectives.panel({ objectiveId }).columns.unaided.count).toBe(1);
  });
});

describe('los requisitos y Estudiar', () => {
  function withRequirement(
    space: Space,
    options: { kind?: 'indispensable' | 'recommended'; status?: 'confirmed' | 'suggested' } = {},
  ) {
    const interpret = createInterpret(space);
    const calculate =
      space.workspace.objectives
        .list({ subjectId: statistics(space).id })
        .topics.flatMap((t) => t.objectives)
        .find((o) => o.title === CALCULATE)?.id ?? '';
    const requirementId = randomUUID();
    space.workspace.objectives.addRequirement({
      requirementId,
      objectiveId: interpret,
      requiresId: calculate,
      kind: options.kind ?? 'indispensable',
      status: options.status ?? 'confirmed',
    });
    return { interpret, calculate, requirementId };
  }

  it('[CA-151] con el requisito indispensable confirmado «Sin iniciar», la propuesta empieza por él: «Antes conviene: Calcular la media y el desvío»', () => {
    const { space } = castSpace();
    const { interpret, calculate, requirementId } = withRequirement(space);
    const { proposal } = space.workspace.study.overview({});
    expect(proposal?.requirement).toEqual({
      kind: 'before',
      requirementId,
      objectiveId: interpret,
      objectiveTitle: INTERPRET,
      requiresId: calculate,
      requiresTitle: CALCULATE,
      requiresState: 'not-started',
      practiceCardId: cardNamed(space, MEAN_QUESTION).id,
    });
    const panel = space.workspace.objectives.panel({ objectiveId: interpret });
    expect(panel.needs).toEqual([
      expect.objectContaining({ requiresTitle: CALCULATE, blocking: true, met: false }),
    ]);
    expect(space.workspace.objectives.panel({ objectiveId: calculate }).neededBy).toEqual([
      expect.objectContaining({ objectiveTitle: INTERPRET, blocking: true }),
    ]);
    // Los números de la propuesta no cambian (el ejercicio no entra en la sesión hasta la Fase 18).
    expect(proposal).toMatchObject({ reviews: 60, newCards: 10 });
  });

  it('[CA-152] «Esto no es necesario para aquello» lo saca al instante', () => {
    const { space } = castSpace();
    const { requirementId } = withRequirement(space);
    space.workspace.objectives.dismissRequirement({ requirementId });
    expect(space.workspace.study.overview({}).proposal?.requirement).toBeNull();
  });

  it('[CA-152] uno sugerido o recomendable nunca frena: avisa con «Quizá te ayude repasar»', () => {
    for (const options of [{ status: 'suggested' as const }, { kind: 'recommended' as const }]) {
      const { space } = castSpace();
      const { requirementId } = withRequirement(space, options);
      expect(space.workspace.study.overview({}).proposal?.requirement).toMatchObject({
        kind: 'maybe',
        requiresTitle: CALCULATE,
      });
      // «Confirmar» uno sugerido lo vuelve un freno.
      if (options.status === 'suggested') {
        space.workspace.objectives.confirmRequirement({ requirementId });
        expect(space.workspace.study.overview({}).proposal?.requirement?.kind).toBe('before');
      }
    }
  });

  it('[CA-151] al cumplir el requisito («Suficiente para avanzar») deja de frenar', () => {
    const { space, clock } = castSpace();
    withRequirement(space);
    const mean = cardNamed(space, MEAN_QUESTION).id;
    for (let day = 0; day < 2; day += 1) {
      const openingId = randomUUID();
      space.workspace.activities.start({ cardId: mean, openingId });
      const sent = space.workspace.activities.submit({
        cardId: mean,
        openingId,
        attemptId: randomUUID(),
        attemptNo: 1,
        answer: { type: 'numeric', raw: '5' },
        help: [],
        noIdea: false,
        shownAt: space.clock.now().toISOString(),
        firstInputMs: 1000,
        submittedMs: 4000,
      });
      space.workspace.activities.finalize({ attemptId: sent.attemptId, verdict: 'correct' });
      clock.advance(1);
    }
    expect(space.workspace.study.overview({}).proposal?.requirement).toBeNull();
  });

  it('[CA-151] un objetivo no puede necesitarse a sí mismo ni armar un círculo', () => {
    const { space } = castSpace();
    const { interpret, calculate } = withRequirement(space);
    expect(() =>
      space.workspace.objectives.addRequirement({
        requirementId: randomUUID(),
        objectiveId: calculate,
        requiresId: interpret,
        kind: 'indispensable',
        status: 'confirmed',
      }),
    ).toThrow();
    expect(() =>
      space.workspace.objectives.addRequirement({
        requirementId: randomUUID(),
        objectiveId: interpret,
        requiresId: interpret,
        kind: 'recommended',
        status: 'confirmed',
      }),
    ).toThrow();
  });

  it('[CA-151] las tarjetas nuevas de un objetivo frenado (o pospuesto) no se proponen; las del requisito van primero', () => {
    const space = openSpace();
    const subject = space.workspace.subjects.create({ name: 'Química', makeActive: true });
    const make = (name: string) =>
      space.workspace.cards.create({ question: `¿${name}?`, answer: name, subjectId: subject.id });
    const later = ['A', 'B', 'C'].map(make);
    const before = ['D', 'E'].map(make);
    const blocked = randomUUID();
    const required = randomUUID();
    space.workspace.objectives.create({
      objectiveId: blocked,
      subjectId: subject.id,
      topicId: null,
      text: 'Nombrar los ácidos',
      conditions: null,
      kind: 'remember',
      cardIds: later.map((card) => card.id),
    });
    space.workspace.objectives.create({
      objectiveId: required,
      subjectId: subject.id,
      topicId: null,
      text: 'Reconocer un ion',
      conditions: null,
      kind: 'remember',
      cardIds: before.map((card) => card.id),
    });
    const free = space.workspace.study.overview({}).proposal;
    expect(free?.newCards).toBe(5);
    space.workspace.objectives.addRequirement({
      requirementId: randomUUID(),
      objectiveId: blocked,
      requiresId: required,
      kind: 'indispensable',
      status: 'confirmed',
    });
    expect(space.workspace.study.overview({}).proposal?.newCards).toBe(2);
    // Pospuesto el requisito, tampoco se proponen sus nuevas (y sigue frenando).
    space.workspace.objectives.postpone({ objectiveId: required });
    expect(space.workspace.study.overview({}).proposal?.newCards).toBe(0);
    space.workspace.objectives.resume({ objectiveId: required });
    const view = space.workspace.study.start({ sessionId: randomUUID() });
    expect(view.current?.cardId).toBe(before[0]?.id);
  });
});
