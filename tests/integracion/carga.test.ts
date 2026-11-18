import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// La carga en minutos de la Fase 11 contra una base real y el elenco: la propuesta para 5, 10, 25 y
// 45 minutos, lo que no entra y queda para mañana, el freno, lo que aprende de cómo estudiás, el
// aplazamiento (que no califica ni mueve la memoria) y las tres fechas de cada repaso.

afterEach(closeSpaces);

let ids = 0;
const id = () => {
  ids += 1;
  return `01969f1e-0000-4000-8000-${String(ids + 5000).padStart(12, '0')}`;
};

function movableClock() {
  let offset = 0;
  const clock: Clock = { now: () => demoClock(offset).now() };
  return {
    clock,
    advance: (days: number) => {
      offset += days;
    },
    reset: () => {
      offset = 0;
    },
  };
}

function seeded(clock?: Clock) {
  const space = openSpace(clock ? { clock } : {});
  seedDemoOrganization(space.workspace);
  seedDemoCardCast(space.workspace);
  return space;
}

const proposalOf = (workspace: Workspace, minutes?: 5 | 10 | 25 | 45) => {
  const proposal = workspace.study.overview(minutes === undefined ? {} : { minutes }).proposal;
  if (proposal === null) {
    throw new Error('no hay propuesta');
  }
  return proposal;
};

const observationsOf = (file: string, kind: string) =>
  readRows(file, 'SELECT * FROM observations WHERE kind = ? ORDER BY seq', kind);

const scheduleRows = (file: string) =>
  readRows(file, 'SELECT * FROM card_schedule ORDER BY card_id');

describe('la propuesta con el elenco', () => {
  it('[CA-078] hay una propuesta de 25 minutos de la materia activa, con su motivo y las dos alternativas', () => {
    const { workspace } = seeded();
    const overview = workspace.study.overview({});
    expect(overview.subjectName).toBe('Estadística básica');
    const proposal = overview.proposal;
    expect(proposal).toMatchObject({ minutes: 25, defaultMinutes: 25 });
    expect(proposal?.why.due).toBe(60);
  });

  it.for([
    { minutes: 25, id: 'CA-079', reviews: 60, fresh: 10, tomorrow: 0, shown: 25 },
    { minutes: 10, id: 'CA-080', reviews: 45, fresh: 0, tomorrow: 15, shown: 10 },
    { minutes: 5, id: 'CA-081', reviews: 20, fresh: 0, tomorrow: 40, shown: 5 },
    { minutes: 45, id: 'CA-082', reviews: 60, fresh: 18, tomorrow: 0, shown: 30 },
  ] as const)(
    '[$id] con $minutes minutos: $reviews repasos, $fresh nuevas y unos $shown min',
    ({ minutes, reviews, fresh, tomorrow, shown }) => {
      const { workspace } = seeded();
      expect(proposalOf(workspace, minutes)).toMatchObject({
        minutes,
        reviews,
        newCards: fresh,
        forTomorrow: tomorrow,
        shownMinutes: shown,
        initialEstimate: false,
      });
    },
  );

  it('[CA-080] al empezar los 10 minutos, los otros 15 quedan para mañana sin calificarse ni mover su fecha', () => {
    const { workspace, file } = seeded();
    const before = scheduleRows(file);
    const gradedBefore = observationsOf(file, 'review.graded').length;
    const view = workspace.study.start({ sessionId: id(), minutes: 10 });
    expect(view.progress).toEqual({ done: 0, total: 45 });
    const postponed = observationsOf(file, 'review.postponed');
    expect(postponed).toHaveLength(15);
    expect(postponed.map((row) => JSON.parse(String(row.payload)).reason)).toEqual(
      Array(15).fill('noFit'),
    );
    expect(JSON.parse(String(postponed[0]?.payload)).plannedDay).toBe('2027-03-16');
    expect(observationsOf(file, 'review.graded')).toHaveLength(gradedBefore);
    expect(scheduleRows(file)).toEqual(before);
    expect(workspace.study.overview({}).dueCount).toBe(45);
  });

  it('[CA-083] la versión corta empieza directo una sesión de 10 minutos con 45 actividades', () => {
    const { workspace } = seeded();
    const view = workspace.study.start({ sessionId: id(), minutes: 10 });
    expect(view.progress.total).toBe(45);
    expect(view.current).not.toBeNull();
  });

  it('[CA-084] el tiempo que se elige vale solo para esa vez: la propuesta siguiente vuelve a 25', () => {
    const { workspace, reopen } = seeded();
    expect(proposalOf(workspace, 10).minutes).toBe(10);
    expect(proposalOf(workspace).minutes).toBe(25);
    expect(proposalOf(reopen()).minutes).toBe(25);
  });

  it('[CA-079] «Empezar» sin elegir tiempo arma los 25 minutos: 60 repasos y 10 nuevas', () => {
    const { workspace } = seeded();
    const view = workspace.study.start({ sessionId: id() });
    expect(view.progress.total).toBe(70);
  });

  it('[CA-094] la sesión registra con qué versión de la política de carga y de cuántos minutos se armó', () => {
    const { workspace, file } = seeded();
    workspace.study.start({ sessionId: id(), minutes: 45 });
    const started = JSON.parse(String(observationsOf(file, 'session.started')[0]?.payload));
    expect(started).toMatchObject({ minutes: 45, loadPolicyVersion: 1 });
  });

  it('[CA-094] las alternativas son hasta 3 y mirarlas no cambia la propuesta', () => {
    const { workspace } = seeded();
    const first = proposalOf(workspace);
    expect(first.alternatives.length).toBeGreaterThan(0);
    expect(first.alternatives.length).toBeLessThanOrEqual(3);
    expect(proposalOf(workspace)).toEqual(first);
    expect(proposalOf(workspace, 10).alternatives.length).toBeLessThanOrEqual(3);
    expect(proposalOf(workspace)).toEqual(first);
  });

  it('[CA-094] una alternativa «solo repasos» arma una sesión sin tarjetas nuevas', () => {
    const { workspace } = seeded();
    const view = workspace.study.start({ sessionId: id(), only: { kind: 'reviewsOnly' } });
    expect(view.progress.total).toBe(60);
  });
});

describe('freno por atraso', () => {
  it('[CA-085] con el elenco el atraso es poco (menos de 0,5 días) y lo nuevo va completo', () => {
    const { workspace } = seeded();
    const proposal = proposalOf(workspace);
    expect(proposal.brake.band).toBe('full');
    expect(proposal.brake.days).toBeLessThan(0.5);
  });

  it('[CA-085] después de 35 días sin estudiar el atraso frena lo nuevo: la propuesta no trae tarjetas nuevas', () => {
    const { clock, advance } = movableClock();
    const { workspace } = seeded(clock);
    advance(35);
    const proposal = proposalOf(workspace);
    expect(proposal.brake.band).not.toBe('full');
    expect(proposal.brake.days).toBeGreaterThan(0.5);
    expect(proposal.newCards).toBe(0);
  });

  it('[CA-086] con un atraso de más de 5 días no entra ninguna tarjeta nueva y el atraso se mide en días', () => {
    const { clock, advance } = movableClock();
    const { workspace } = seeded(clock);
    workspace.study.setDefaultMinutes(5);
    advance(120);
    const proposal = proposalOf(workspace);
    expect(proposal.brake.band).toBe('none');
    expect(proposal.brake.days).toBeGreaterThan(5);
    expect(proposal.newCards).toBe(0);
  });

  it('[CA-086] el atraso de cada día se anota y el freno lo tiene en cuenta (sin tocar la memoria)', () => {
    const { clock, advance } = movableClock();
    const { workspace, file } = seeded(clock);
    const before = scheduleRows(file);
    proposalOf(workspace);
    advance(35);
    expect(proposalOf(workspace).brake.band).not.toBe('full');
    advance(1);
    expect(proposalOf(workspace).brake.band).not.toBe('full');
    const saved = readRows(file, "SELECT value FROM settings WHERE key = 'load.backlog'");
    const days = JSON.parse(String(saved[0]?.value)) as { day: string; days: number }[];
    expect(days.map((entry) => entry.day)).toEqual(['2027-03-15', '2027-04-19', '2027-04-20']);
    expect(days[0]?.days).toBeLessThan(0.5);
    expect(scheduleRows(file)).toEqual(before);
  });
});

describe('lo que aprende de cómo estudiás', () => {
  it('[CA-088] con el elenco hay más de 20 repasos propios de 12 segundos de mediana: la estimación es 12', () => {
    const { workspace } = seeded();
    const proposal = proposalOf(workspace);
    expect(proposal.why.reviewSeconds).toBe(12);
    expect(proposal.why.ownAttempts).toBeGreaterThan(20);
  });

  it('[CA-089] sin repasos propios con tiempo la duración lleva «estimación inicial» y vale 12 segundos por repaso', () => {
    const { workspace } = openSpace();
    seedDemoOrganization(workspace);
    const subject = workspace.subjects.list().subjects.find((item) => item.status === 'active');
    if (!subject) {
      throw new Error('sin materia activa');
    }
    workspace.cards.create({ question: '¿A?', answer: 'a', subjectId: subject.id });
    const proposal = proposalOf(workspace);
    expect(proposal.initialEstimate).toBe(true);
    expect(proposal.why.reviewSeconds).toBe(12);
  });

  it('[CA-090] un repaso de 5 minutos sin tocar nada se guarda como dato pero no entra en el cálculo', () => {
    const { workspace, file } = seeded();
    const before = proposalOf(workspace).why.ownAttempts;
    const sessionId = id();
    const view = workspace.study.start({ sessionId });
    const current = view.current;
    if (!current) {
      throw new Error('sin tarjeta');
    }
    workspace.study.grade({
      sessionId,
      activityId: current.activityId,
      attemptId: id(),
      grade: 'good',
      answer: null,
      marks: { shownAt: null, firstInteractionMs: 100, answerRequestedMs: 200, gradedMs: 300_000 },
      activeMs: 5000,
    });
    const saved = observationsOf(file, 'review.graded').at(-1);
    expect(JSON.parse(String(saved?.payload)).gradedMs).toBe(300_000);
    expect(proposalOf(workspace).why.ownAttempts).toBe(before);
    expect(proposalOf(workspace).why.reviewSeconds).toBe(12);
  });

  it('[CA-090] el corte de inactividad de cada paso es 3 veces la estimación vigente (36 segundos con 12)', () => {
    const { workspace } = seeded();
    expect(workspace.study.inactivityCapMs()).toBe(36_000);
  });
});

describe('posponer', () => {
  it('[CA-091] «Mañana» registra un aplazamiento de cada repaso de la propuesta sin calificar nada ni mover la memoria', () => {
    const { workspace, file } = seeded();
    const before = scheduleRows(file);
    const gradedBefore = observationsOf(file, 'review.graded').length;
    const result = workspace.study.postpone({ requestId: id(), when: 'tomorrow' });
    expect(result).toMatchObject({ postponed: 60, forced: 0, plannedDay: '2027-03-16' });
    const events = observationsOf(file, 'review.postponed');
    expect(events).toHaveLength(60);
    expect(JSON.parse(String(events[0]?.payload))).toMatchObject({
      reason: 'manual',
      plannedDay: '2027-03-16',
      suggestedDay: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(observationsOf(file, 'review.graded')).toHaveLength(gradedBefore);
    expect(scheduleRows(file)).toEqual(before);
    expect(workspace.study.overview({}).dueCount).toBe(0);
  });

  it('[CA-091] «Más tarde hoy» y «Elegir día» también registran el aplazamiento, con su fecha planificada', () => {
    const { workspace, file } = seeded();
    expect(workspace.study.postpone({ requestId: id(), when: 'later' }).plannedDay).toBe(
      '2027-03-15',
    );
    expect(
      workspace.study.postpone({ requestId: id(), when: 'day', day: '2027-03-20' }),
    ).toMatchObject({
      plannedDay: '2027-03-20',
    });
    expect(observationsOf(file, 'review.postponed')).toHaveLength(120);
  });

  it('[CA-091] el mismo pedido dos veces no agrega nada', () => {
    const { workspace, file } = seeded();
    const requestId = id();
    workspace.study.postpone({ requestId, when: 'tomorrow' });
    workspace.study.postpone({ requestId, when: 'tomorrow' });
    expect(observationsOf(file, 'review.postponed')).toHaveLength(60);
  });

  it('[CA-091] el historial de la primera tarjeta de la cola muestra el aplazamiento, sin resultado', () => {
    const { workspace } = seeded();
    const sessionId = id();
    const first = workspace.study.start({ sessionId }).current;
    workspace.study.pause({ sessionId });
    if (!first) {
      throw new Error('sin tarjeta');
    }
    workspace.study.postpone({ requestId: id(), when: 'tomorrow' });
    const history = workspace.cards.history({ cardId: first.cardId });
    const entry = history.entries.at(-1);
    expect(entry).toMatchObject({ result: 'postponed', plannedDay: '2027-03-16', annulled: false });
  });

  it('[CA-091] lo pospuesto para mañana vuelve mañana', () => {
    const { clock, advance } = movableClock();
    const { workspace } = seeded(clock);
    workspace.study.postpone({ requestId: id(), when: 'tomorrow' });
    expect(workspace.study.overview({}).dueCount).toBe(0);
    advance(1);
    expect(workspace.study.overview({}).dueCount).toBeGreaterThanOrEqual(60);
  });

  it('[CA-093] a la cuarta vez que se pospone una tarjeta no se pospone: pasa a prioridad máxima y entra primera', () => {
    const { workspace, file } = seeded();
    for (let turn = 0; turn < 3; turn += 1) {
      expect(workspace.study.postpone({ requestId: id(), when: 'later' }).forced).toBe(0);
    }
    const fourth = workspace.study.postpone({ requestId: id(), when: 'later' });
    expect(fourth).toMatchObject({ postponed: 0, forced: 60 });
    expect(observationsOf(file, 'review.postponed')).toHaveLength(180);
    const view = workspace.study.start({ sessionId: id(), minutes: 5 });
    expect(view.progress.total).toBe(60);
  });

  it('[CA-091] aplazar no cambia la memoria: ni la agenda de ninguna tarjeta ni lo que dice «¿Por qué hoy?»', () => {
    const { workspace, file } = seeded();
    const sessionId = id();
    const first = workspace.study.start({ sessionId }).current;
    workspace.study.pause({ sessionId });
    if (!first) {
      throw new Error('sin tarjeta');
    }
    const why = workspace.cards.whyToday({ cardId: first.cardId });
    const schedule = scheduleRows(file);
    workspace.study.postpone({ requestId: id(), when: 'tomorrow' });
    expect(scheduleRows(file)).toEqual(schedule);
    expect(workspace.cards.whyToday({ cardId: first.cardId })).toEqual(why);
  });
});

describe('las tres fechas de cada repaso', () => {
  it('[CA-091] un repaso guarda la fecha sugerida, la planificada y la real; solo la real alimenta al motor', () => {
    const { clock, advance } = movableClock();
    const { workspace, file } = seeded(clock);
    const sessionId = id();
    const first = workspace.study.start({ sessionId }).current;
    workspace.study.pause({ sessionId });
    if (!first) {
      throw new Error('sin tarjeta');
    }
    workspace.study.postpone({ requestId: id(), when: 'tomorrow' });
    advance(1);
    const second = workspace.study.start({ sessionId: id() });
    const current = second.current;
    if (!current) {
      throw new Error('sin tarjeta');
    }
    workspace.study.grade({
      sessionId: second.sessionId,
      activityId: current.activityId,
      attemptId: id(),
      grade: 'good',
      answer: null,
      activeMs: 1000,
    });
    const graded = observationsOf(file, 'review.graded').at(-1);
    const payload = JSON.parse(String(graded?.payload));
    expect(payload).toMatchObject({ plannedDay: '2027-03-16' });
    expect(payload.suggestedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(graded?.occurred_at).startsWith('2027-03-16')).toBe(true);
  });
});

describe('sumar tarjetas nuevas a mano', () => {
  it('[CA-087] antes de confirmar, 10 tarjetas suman entre 5 y 10 minutos de repaso en las próximas 4 semanas', () => {
    const { workspace } = seeded();
    expect(workspace.cards.activationCost({ count: 10 })).toEqual({
      lowMinutes: 5,
      highMinutes: 10,
    });
  });

  it('[CA-087] «Sumar a mis repasos» pone esas tarjetas primero entre las nuevas, sin pasar por encima del freno', () => {
    const { workspace, file } = seeded();
    const subject = workspace.subjects.list().subjects.find((item) => item.status === 'active');
    if (!subject) {
      throw new Error('sin materia activa');
    }
    const fresh = workspace.cards
      .list({ subjectId: subject.id })
      .filter((card) => card.nextReviewDay === null)
      .slice(-3);
    expect(fresh).toHaveLength(3);
    workspace.cards.activate({ batchId: id(), cardIds: fresh.map((card) => card.id) });
    expect(observationsOf(file, 'card.activated')).toHaveLength(3);
    const view = workspace.study.start({ sessionId: id(), only: { kind: 'newOnly' } });
    expect(view.current?.cardId).toBe(fresh[0]?.id);
  });
});
