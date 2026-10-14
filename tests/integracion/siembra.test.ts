import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { seedDemoCards } from '../../src/main/demo/seed';
import { tempDataFolder } from '../apoyo/base';

const folders: ReturnType<typeof tempDataFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function openFresh() {
  const folder = tempDataFolder();
  folders.push(folder);
  const db = openDatabase(folder.file);
  return { db, folder, store: createCardsStore(db, demoClock()) };
}

describe('siembra de la variante de prueba: las tres tarjetas de ejemplo', () => {
  it('con la base vacía deja tres tarjetas, con «¿Qué mide el desvío estándar?» primera y sin repasar', () => {
    const { db, store } = openFresh();
    expect(seedDemoCards(store)).toBe(3);
    const cards = store.list();
    db.close();
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      question: '¿Qué mide el desvío estándar?',
      answer: 'Cuánto se alejan, en promedio, los datos de la media.',
      nextReviewDay: null,
    });
    expect(cards.map((card) => card.question)).toEqual([
      '¿Qué mide el desvío estándar?',
      '¿Qué es la varianza?',
      '¿Qué es la media muestral?',
    ]);
  });

  it('no siembra de nuevo si ya hay tarjetas, ni toca las que escribiste vos', () => {
    const { db, store } = openFresh();
    store.create({ question: '¿Capital de Francia?', answer: 'París' });
    expect(seedDemoCards(store)).toBe(0);
    expect(store.list().map((card) => card.question)).toEqual(['¿Capital de Francia?']);
    db.close();
  });

  it('abrir otra vez la misma base no duplica el ejemplo', () => {
    const { db, folder, store } = openFresh();
    seedDemoCards(store);
    db.close();
    const reopened = openDatabase(folder.file);
    const again = createCardsStore(reopened, demoClock());
    expect(seedDemoCards(again)).toBe(0);
    expect(again.count()).toBe(3);
    reopened.close();
  });
});
