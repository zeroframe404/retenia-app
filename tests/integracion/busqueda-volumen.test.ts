import { afterEach, describe, expect, it } from 'vitest';
import { systemStopwatch } from '../../src/core/clock';
import { seedDemoCardCast, seedDemoOrganization, seedDemoVolume } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// «Cargar 10.000 tarjetas» (Ajustes › «Demostración») y la búsqueda con ese volumen (CA-103).

afterEach(closeSpaces);

const VOLUME = 10_000;

function withVolume() {
  const space = openSpace();
  seedDemoOrganization(space.workspace);
  seedDemoCardCast(space.workspace);
  const loaded = seedDemoVolume(space.workspace, VOLUME);
  return { ...space, loaded };
}

describe('cargar 10.000 tarjetas', () => {
  it('deja 10.000 tarjetas de relleno en una materia aparte llamada «Volumen»', () => {
    const { workspace, loaded } = withVolume();
    const volume = workspace.subjects.list().subjects.find((subject) => subject.name === 'Volumen');
    expect(volume).toBeDefined();
    expect(volume?.status).not.toBe('active');
    expect(loaded).toEqual({ subjectId: volume?.id, cards: VOLUME });
    expect(workspace.cards.list({ subjectId: volume?.id ?? '' })).toHaveLength(VOLUME);
  });

  it('es determinista: dos cargas dan exactamente las mismas tarjetas', () => {
    const first = withVolume();
    const second = withVolume();
    const questions = (space: typeof first) =>
      space.workspace.cards
        .list({ subjectId: space.loaded.subjectId })
        .map((card) => card.question)
        .sort();
    expect(questions(first)).toEqual(questions(second));
  });

  it('cargarlas otra vez no duplica nada', () => {
    const { workspace, loaded } = withVolume();
    expect(seedDemoVolume(workspace, VOLUME)).toEqual(loaded);
    expect(workspace.cards.list({ subjectId: loaded.subjectId })).toHaveLength(VOLUME);
  });

  it('el índice queda al día: no hay nada pendiente y «Verificar datos» da 0 diferencias', () => {
    const { workspace, file } = withVolume();
    expect(readRows(file, 'SELECT COUNT(*) AS n FROM search_dirty')).toEqual([{ n: 0 }]);
    expect(workspace.verifyData()).toEqual([]);
  });
});

describe('buscar con 10.000 tarjetas', () => {
  it('[CA-103] los resultados aparecen en menos de 0,2 segundos', () => {
    const { workspace } = withVolume();
    // Una primera vez sin medir: abre las páginas de la base como lo haría el uso real.
    workspace.search.query({ text: 'desvio' });
    const times: number[] = [];
    for (const text of [
      'desvio',
      'varian',
      'sqrt(n',
      'tipo:tarjeta mediana',
      'media y dispersion',
    ]) {
      const stop = systemStopwatch().start();
      const { results } = workspace.search.query({ text });
      times.push(stop());
      expect(results.length).toBeLessThanOrEqual(50);
    }
    expect(Math.max(...times)).toBeLessThan(200);
  });

  it('[CA-103] con 10.000 tarjetas «desvio» sigue trayendo primero «¿Qué mide el desvío estándar?»', () => {
    const { workspace } = withVolume();
    const [first] = workspace.search.query({ text: 'desvio' }).results;
    expect(first?.title.map((part) => part.text).join('')).toBe('¿Qué mide el desvío estándar?');
  });
});
