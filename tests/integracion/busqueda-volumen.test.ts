import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { systemStopwatch } from '../../src/core/clock';
import { seedDemoVolume } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// «Cargar 10.000 tarjetas» (Ajustes › «Demostración») y la búsqueda con ese volumen (CA-103). La
// carga tarda unos segundos: se hace una sola vez y las pruebas leen del mismo espacio.

afterAll(closeSpaces);

const VOLUME = 10_000;

function load() {
  const space = openSpace({ withCast: true });
  const loaded = seedDemoVolume(space.workspace, VOLUME);
  return { ...space, loaded };
}

let shared: ReturnType<typeof load>;
// La carga tarda unos segundos: más que los 10 que Vitest da por defecto cuando la máquina está cargada.
beforeAll(() => {
  shared = load();
}, 120_000);

describe('cargar 10.000 tarjetas', () => {
  it('deja 10.000 tarjetas de relleno en una materia aparte llamada «Volumen»', () => {
    const { workspace, loaded } = shared;
    const volume = workspace.subjects.list().subjects.find((subject) => subject.name === 'Volumen');
    expect(volume).toBeDefined();
    expect(volume?.status).not.toBe('active');
    expect(loaded).toEqual({ subjectId: volume?.id, cards: VOLUME });
    expect(workspace.cards.list({ subjectId: volume?.id ?? '' })).toHaveLength(VOLUME);
  });

  it('es determinista: dos cargas dan exactamente las mismas tarjetas', () => {
    // Con pocas tarjetas alcanza (la cuenta es la misma): cargar 10.000 otra vez tardaría unos segundos.
    const small = () => {
      const space = openSpace();
      const loaded = seedDemoVolume(space.workspace, 300);
      return space.workspace.cards
        .list({ subjectId: loaded.subjectId })
        .map((card) => card.question)
        .sort();
    };
    const first = small();
    expect(first).toHaveLength(300);
    expect(small()).toEqual(first);
    // Y las 300 son las primeras de las 10.000.
    const big = new Set(
      shared.workspace.cards
        .list({ subjectId: shared.loaded.subjectId })
        .map((card) => card.question),
    );
    expect(first.every((question) => big.has(question))).toBe(true);
  });

  it('cargarlas otra vez no duplica nada', () => {
    const { workspace, loaded } = shared;
    expect(seedDemoVolume(workspace, VOLUME)).toEqual(loaded);
    expect(workspace.cards.list({ subjectId: loaded.subjectId })).toHaveLength(VOLUME);
  });

  it('el índice queda al día: no hay nada pendiente y «Verificar datos» da 0 diferencias', () => {
    const { workspace, file } = shared;
    expect(readRows(file, 'SELECT COUNT(*) AS n FROM search_dirty')).toEqual([{ n: 0 }]);
    expect(workspace.verifyData()).toEqual([]);
  });
});

describe('buscar con 10.000 tarjetas', () => {
  it('[CA-103] los resultados aparecen en menos de 0,2 segundos', () => {
    const { workspace } = shared;
    // Una primera vez sin medir: abre las páginas de la base como lo haría el uso real.
    workspace.search.query({ text: 'desvio' });
    const times: number[] = [];
    for (const text of [
      'desvio',
      'varian',
      'sqrt(n',
      'tipo:tarjeta mediana',
      'media y dispersion',
      'relleno',
      'materia:volumen puente',
    ]) {
      const stop = systemStopwatch().start();
      const { results } = workspace.search.query({ text });
      times.push(stop());
      expect(results.length).toBeLessThanOrEqual(50);
    }
    expect(Math.max(...times)).toBeLessThan(200);
  });

  it('[CA-103] con 10.000 tarjetas «desvio» sigue trayendo primero «¿Qué mide el desvío estándar?»', () => {
    const [first] = shared.workspace.search.query({ text: 'desvio' }).results;
    expect(first?.title.map((part) => part.text).join('')).toBe('¿Qué mide el desvío estándar?');
  });

  it('una búsqueda que coincide con miles de tarjetas devuelve solo las primeras 50', () => {
    const { results } = shared.workspace.search.query({ text: 'relleno' });
    expect(results).toHaveLength(50);
  });
});
