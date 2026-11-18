import { afterEach, describe, expect, it } from 'vitest';
import { fixedStopwatch } from '../../src/core/clock';
import { handleMessage } from '../../src/main/bridge';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Contrato de los canales de la carga en minutos (Fase 11): la propuesta por minutos, empezar con
// un tiempo o una parte, «Posponer» y el costo de «Sumar a mis repasos». Del lado de la ventana, el
// puente; del otro, el manejador real del principal con una base real y el elenco.

const SESSION = '01969f1e-0000-4000-8000-0000000000d1';
const REQUEST = '01969f1e-0000-4000-8000-0000000000d2';
const BATCH = '01969f1e-0000-4000-8000-0000000000d3';

const bridges: TestBridge[] = [];
function bridge() {
  const opened = openBridge({ stopwatch: fixedStopwatch(1500) });
  seedDemoOrganization(opened.workspace);
  seedDemoCardCast(opened.workspace);
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

async function rejected(handlers: TestBridge['handlers'], channel: string, request: unknown) {
  await expect(handleMessage(handlers, channel, request), JSON.stringify(request)).rejects.toThrow(
    `Petición rechazada en el canal «${channel}»`,
  );
}

describe('contrato: propuesta por minutos', () => {
  it('[CA-079] «study.overview» sin tiempo da la propuesta de 25 minutos y con un tiempo, la de ese tiempo', async () => {
    const { api } = bridge();
    const usual = await api['study.overview']({});
    expect(usual.proposal).toMatchObject({ minutes: 25, reviews: 60, newCards: 10 });
    const short = await api['study.overview']({ minutes: 10 });
    expect(short.proposal).toMatchObject({
      minutes: 10,
      reviews: 45,
      newCards: 0,
      forTomorrow: 15,
    });
    expect((await api['study.overview']({})).proposal).toMatchObject({ minutes: 25 });
  });

  it('[CA-084] «study.overview» rechaza tiempos que no son 5, 10, 25 ni 45 y campos de más, en la ventana y en el principal', async () => {
    const { handlers } = bridge();
    for (const request of [
      { minutes: 7 },
      { minutes: '25' },
      { minutes: 25, extra: true },
      { x: 1 },
    ]) {
      await rejected(handlers, 'study.overview', request);
    }
  });

  it('[CA-083] «study.start» con 10 minutos arma 45 actividades, y con una parte arma solo esa parte', async () => {
    const { api } = bridge();
    const short = await api['study.start']({ sessionId: SESSION, minutes: 10 });
    expect(short.progress).toEqual({ done: 0, total: 45 });
    const only = await api['study.start']({
      sessionId: '01969f1e-0000-4000-8000-0000000000d4',
      only: { kind: 'reviewsOnly' },
    });
    // Los 15 que no entraron en los 10 minutos quedaron para mañana: hoy ya no se ofrecen.
    expect(only.progress.total).toBe(45);
  });

  it('[CA-094] «study.start» rechaza una parte que no existe, un tema que no es identificador y campos de más', async () => {
    const { handlers } = bridge();
    for (const request of [
      { sessionId: SESSION, only: { kind: 'todo' } },
      { sessionId: SESSION, only: { kind: 'topic', topicId: 'no' } },
      { sessionId: SESSION, only: { kind: 'topic' } },
      { sessionId: SESSION, minutes: 30 },
      { sessionId: SESSION, extra: 1 },
      {},
    ]) {
      await rejected(handlers, 'study.start', request);
    }
  });
});

describe('contrato: posponer', () => {
  it('[CA-091] «study.postpone» con «Mañana» aplaza los repasos de la propuesta y dice para qué día quedaron', async () => {
    const { api } = bridge();
    const result = await api['study.postpone']({ requestId: REQUEST, when: 'tomorrow' });
    expect(result).toEqual({ postponed: 60, forced: 0, plannedDay: '2027-03-16' });
    expect((await api['study.overview']({})).dueCount).toBe(0);
  });

  it('[CA-091] «study.postpone» rechaza un cuándo que no existe, un día mal escrito y campos de más', async () => {
    const { handlers } = bridge();
    for (const request of [
      { requestId: REQUEST, when: 'nunca' },
      { requestId: REQUEST, when: 'day', day: '20/03/2027' },
      { requestId: 'no', when: 'later' },
      { when: 'later' },
      { requestId: REQUEST, when: 'later', extra: 1 },
    ]) {
      await rejected(handlers, 'study.postpone', request);
    }
  });
});

describe('contrato: sumar tarjetas nuevas a mano', () => {
  it('[CA-087] «cards.activationCost» dice cuánto suman 10 tarjetas: entre 5 y 10 minutos', async () => {
    const { api } = bridge();
    expect(await api['cards.activationCost']({ count: 10 })).toEqual({
      lowMinutes: 5,
      highMinutes: 10,
    });
  });

  it('[CA-087] «cards.activate» suma las tarjetas nuevas y no cuenta las que ya se repasaron', async () => {
    const { api } = bridge();
    const subjects = await api['subjects.list']({});
    const active = subjects.subjects.find((subject) => subject.status === 'active');
    const list = await api['cards.list']({ subjectId: active?.id });
    const fresh = list.cards.filter((card) => card.nextReviewDay === null).slice(0, 2);
    const reviewed = list.cards.find((card) => card.nextReviewDay !== null);
    expect(
      await api['cards.activate']({
        batchId: BATCH,
        cardIds: [...fresh.map((card) => card.id), reviewed?.id ?? ''],
      }),
    ).toEqual({ activated: 2 });
    expect(
      await api['cards.activate']({ batchId: BATCH, cardIds: fresh.map((card) => card.id) }),
    ).toEqual({ activated: 0 });
  });

  it('[CA-087] los canales de costo y de activación rechazan cantidades fuera de rango, listas vacías y campos de más', async () => {
    const { handlers } = bridge();
    for (const request of [
      { count: 0 },
      { count: 501 },
      { count: 1.5 },
      { count: 1, extra: 1 },
      {},
    ]) {
      await rejected(handlers, 'cards.activationCost', request);
    }
    for (const request of [
      { batchId: BATCH, cardIds: [] },
      { batchId: BATCH, cardIds: ['no'] },
      { cardIds: [BATCH] },
      { batchId: BATCH, cardIds: [BATCH], extra: 1 },
    ]) {
      await rejected(handlers, 'cards.activate', request);
    }
  });
});
