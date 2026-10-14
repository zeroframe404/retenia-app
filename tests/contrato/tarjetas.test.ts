import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { channels } from '../../src/preload/contract';
import { MAX_CARD_TEXT_LENGTH } from '../../src/preload/contract/cards';
import { demoChannels } from '../../src/preload/contract/demo';
import { openBridge, type TestBridge } from '../apoyo/puente';

const bridges: TestBridge[] = [];
function bridge(options?: Parameters<typeof openBridge>[0]) {
  const opened = openBridge(options);
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

describe('contrato del puente: canales «cards.create», «cards.list» y «cards.review»', () => {
  it('[CA-009] «cards.create» guarda la tarjeta y «cards.list» la devuelve primera', async () => {
    const { api } = bridge();
    await api['cards.create']({ question: 'Una más', answer: 'x' });
    const created = await api['cards.create']({
      question: '¿Capital de Francia?',
      answer: 'París',
    });
    expect(created).toMatchObject({
      question: '¿Capital de Francia?',
      answer: 'París',
      nextReviewDay: null,
    });
    const { cards } = await api['cards.list']({});
    expect(cards.map((card) => card.question)).toEqual(['¿Capital de Francia?', 'Una más']);
    expect(cards[0]?.id).toBe(created.id);
  });

  it('[CA-011] sin pregunta, o con solo espacios, el puente la rechaza antes de mandarla y no se crea nada', async () => {
    const { api, sent } = bridge();
    for (const question of ['', '   ', '\n\t ']) {
      await expect(api['cards.create']({ question, answer: 'Roma' })).rejects.toThrow(
        'Petición rechazada en el canal «cards.create»',
      );
    }
    expect(sent).toEqual([]);
    expect((await api['cards.list']({})).cards).toEqual([]);
  });

  it('[CA-011] si alguien se saltea el puente, el principal también la rechaza sin crear nada', async () => {
    const { handlers, api } = bridge();
    for (const request of [
      { question: '', answer: 'Roma' },
      { question: '¿Capital de Italia?', answer: '  ' },
      { question: 'P' },
      { answer: 'R' },
    ]) {
      await expect(handleMessage(handlers, 'cards.create', request)).rejects.toThrow(
        'Petición rechazada en el canal «cards.create»',
      );
    }
    expect((await api['cards.list']({})).cards).toEqual([]);
  });

  it('guarda la pregunta y la respuesta sin los espacios de los bordes', async () => {
    const { api } = bridge();
    const card = await api['cards.create']({
      question: '  ¿Capital de Italia?  ',
      answer: ' Roma\n',
    });
    expect(card).toMatchObject({ question: '¿Capital de Italia?', answer: 'Roma' });
  });

  it('acepta textos de hasta el tope y rechaza uno más largo', async () => {
    const { api } = bridge();
    const longest = 'ñ'.repeat(MAX_CARD_TEXT_LENGTH);
    await expect(api['cards.create']({ question: longest, answer: 'R' })).resolves.toMatchObject({
      question: longest,
    });
    await expect(api['cards.create']({ question: `${longest}ñ`, answer: 'R' })).rejects.toThrow(
      'Petición rechazada',
    );
  });

  it('rechaza campos de más, de menos o de otro tipo', async () => {
    const { handlers } = bridge();
    for (const request of [
      { question: 'P', answer: 'R', extra: 1 },
      { question: 1, answer: 'R' },
      { question: 'P', answer: null },
      null,
      'texto',
      [],
    ]) {
      await expect(handleMessage(handlers, 'cards.create', request)).rejects.toThrow(
        'Petición rechazada',
      );
    }
    await expect(handleMessage(handlers, 'cards.list', { filtro: 'x' })).rejects.toThrow(
      'Petición rechazada',
    );
  });

  it('[CA-010] «cards.review» con «good» sobre una tarjeta nueva devuelve el 17/03/2027', async () => {
    const { api } = bridge();
    const created = await api['cards.create']({
      question: '¿Capital de Francia?',
      answer: 'París',
    });
    const reviewed = await api['cards.review']({ cardId: created.id, grade: 'good' });
    expect(reviewed).toMatchObject({ id: created.id, nextReviewDay: '2027-03-17' });
    expect((await api['cards.list']({})).cards[0]?.nextReviewDay).toBe('2027-03-17');
  });

  it('«cards.review» rechaza una calificación desconocida, un identificador que no es UUID y una tarjeta que no existe', async () => {
    const { api, handlers } = bridge();
    const created = await api['cards.create']({ question: 'P', answer: 'R' });
    for (const request of [
      { cardId: created.id, grade: 'easy' },
      { cardId: created.id, grade: 'GOOD' },
      { cardId: 'no-es-un-uuid', grade: 'good' },
      { cardId: created.id },
    ]) {
      await expect(handleMessage(handlers, 'cards.review', request)).rejects.toThrow(
        'Petición rechazada en el canal «cards.review»',
      );
    }
    const missing = handleMessage(handlers, 'cards.review', {
      cardId: '01969f1e-0000-7000-8000-000000000000',
      grade: 'good',
    });
    await expect(missing).rejects.toThrow('No encontré la tarjeta');
    expect((await api['cards.list']({})).cards[0]?.nextReviewDay).toBeNull();
  });

  it('una respuesta que no cumple el esquema no llega a la ventana', async () => {
    const { handlers } = bridge();
    const broken = { ...handlers, 'cards.list': async () => ({ cards: [{ id: 'x' }] }) };
    await expect(
      handleMessage(broken as unknown as typeof handlers, 'cards.list', {}),
    ).rejects.toThrow('Respuesta rechazada en el canal «cards.list»');
  });
});

describe('contrato del puente: canal «app.info»', () => {
  it('[CA-012] informa la variante, la versión y la carpeta de datos', async () => {
    const { api, file } = bridge();
    const info = await api['app.info']({});
    expect(info.variant).toBe('prueba');
    expect(info.version).toBe('0.0.0-prueba');
    expect(file.startsWith(info.dataDir)).toBe(true);
  });
});

describe('contrato del puente: canales de demostración', () => {
  it('el contrato base no trae ningún canal de demostración: sin el registro de la variante de prueba, «demo.state» es un canal desconocido', async () => {
    const { handlers } = bridge({ variant: 'real' });
    await expect(handleMessage(handlers, 'demo.state', {})).rejects.toThrow('Canal desconocido');
    expect(Object.keys(channels).filter((name) => name.startsWith('demo.'))).toEqual([]);
  });

  it('[CA-012] en la variante de prueba «demo.state» devuelve el día de estudio del reloj de demostración', async () => {
    const { handlers } = bridge();
    const demoHandlers = createDemoHandlers({ clock: demoClock() });
    const registry = { ...channels, ...demoChannels() };
    await expect(
      handleMessage({ ...handlers, ...demoHandlers }, 'demo.state', {}, registry),
    ).resolves.toEqual({ today: '2027-03-15' });
    await expect(
      handleMessage({ ...handlers, ...demoHandlers }, 'demo.state', { x: 1 }, registry),
    ).rejects.toThrow('Petición rechazada');
  });
});
