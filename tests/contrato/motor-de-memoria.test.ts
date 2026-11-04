import { afterEach, describe, expect, it } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Los canales nuevos de la Fase 09: «cards.undoReview» (deshacer el repaso recién hecho) y
// «cards.whyToday» («¿Por qué hoy?»), y el historial con sus renglones anulados.

const ATTEMPT = '01969f1e-0000-4000-8000-0000000009a1';

const bridges: TestBridge[] = [];
function bridge() {
  const opened = openBridge();
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

describe('contrato del puente: «cards.undoReview», «cards.whyToday» y el historial', () => {
  it('[CA-063] «cards.undoReview» con el intento recién hecho devuelve la tarjeta como estaba y el historial lo marca anulado', async () => {
    const { api } = bridge();
    const card = await api['cards.create']({ question: '¿Capital de Francia?', answer: 'París' });
    const reviewed = await api['cards.review']({
      cardId: card.id,
      grade: 'good',
      attemptId: ATTEMPT,
    });
    expect(reviewed.nextReviewDay).toBe('2027-03-17');
    const undone = await api['cards.undoReview']({ cardId: card.id, attemptId: ATTEMPT });
    expect(undone).toMatchObject({ id: card.id, nextReviewDay: null });
    const history = await api['cards.history']({ cardId: card.id });
    expect(history.entries).toEqual([
      expect.objectContaining({
        day: '2027-03-15',
        result: 'good',
        annulled: true,
        sameDay: false,
      }),
    ]);
  });

  it('«cards.undoReview» rechaza campos de más, de menos o que no son identificadores, en la ventana y en el principal', async () => {
    const { api, handlers } = bridge();
    const card = await api['cards.create']({ question: 'P', answer: 'R' });
    for (const request of [
      { cardId: card.id },
      { attemptId: ATTEMPT },
      { cardId: 'no', attemptId: ATTEMPT },
      { cardId: card.id, attemptId: ATTEMPT, extra: 1 },
    ]) {
      await expect(
        api['cards.undoReview'](request as unknown as { cardId: string; attemptId: string }),
      ).rejects.toThrow('Petición rechazada en el canal «cards.undoReview»');
      await expect(handleMessage(handlers, 'cards.undoReview', request)).rejects.toThrow(
        'Petición rechazada en el canal «cards.undoReview»',
      );
    }
  });

  it('[CA-065] «cards.whyToday» de una tarjeta nueva dice que es nueva, con la estimación general', async () => {
    const { api } = bridge();
    const card = await api['cards.create']({ question: 'P', answer: 'R' });
    expect(await api['cards.whyToday']({ cardId: card.id })).toEqual({
      kind: 'new',
      general: true,
    });
  });

  it('[CA-065] «cards.whyToday» después de un repaso: los días desde el último, cómo salió y unos N de cada 10', async () => {
    const { api } = bridge();
    const card = await api['cards.create']({ question: 'P', answer: 'R' });
    await api['cards.review']({ cardId: card.id, grade: 'hard', attemptId: ATTEMPT });
    expect(await api['cards.whyToday']({ cardId: card.id })).toEqual({
      kind: 'seen',
      daysSince: 0,
      lastResult: 'hard',
      outOfTen: 10,
      general: true,
    });
  });

  it('«cards.whyToday» rechaza un pedido sin tarjeta o con campos de más', async () => {
    const { api } = bridge();
    for (const request of [{}, { cardId: 'x' }, { cardId: ATTEMPT, more: true }]) {
      await expect(api['cards.whyToday'](request as unknown as { cardId: string })).rejects.toThrow(
        'Petición rechazada en el canal «cards.whyToday»',
      );
    }
  });
});
