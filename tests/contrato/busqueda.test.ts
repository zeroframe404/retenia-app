import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SEARCH_LENGTH } from '../../src/preload/contract/search';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Los canales del buscador (Fase 12): el principal valida cada pedido antes de tocar nada y cada
// respuesta antes de devolverla.

const bridges: TestBridge[] = [];
function bridge() {
  const opened = openBridge({ withCast: true });
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

describe('search.query', () => {
  it('[CA-095] devuelve los resultados con su tipo, su título resaltado y su fragmento', async () => {
    const { api } = bridge();
    const { results, recent } = await api['search.query']({ text: 'desvio' });
    expect(recent).toBe(false);
    expect(results[0]).toMatchObject({
      kind: 'card',
      title: expect.arrayContaining([{ text: 'desvío', match: true }]),
      subjectName: 'Estadística básica',
    });
  });

  it('[CA-101] sin resultados devuelve una lista vacía, no un error', async () => {
    const { api } = bridge();
    await expect(api['search.query']({ text: 'zzzz' })).resolves.toEqual({
      results: [],
      recent: false,
    });
  });

  it('rechaza lo que no es un texto o es demasiado largo, sin tocar la base', async () => {
    const { api, workspace } = bridge();
    const before = workspace.search.query({ text: '' });
    for (const bad of [
      undefined,
      null,
      5,
      {},
      { text: 5 },
      { text: 'a'.repeat(MAX_SEARCH_LENGTH + 1) },
    ]) {
      // biome-ignore lint/suspicious/noExplicitAny: a propósito, un pedido que no cumple el contrato.
      await expect(api['search.query'](bad as any)).rejects.toThrow();
    }
    expect(workspace.search.query({ text: '' })).toEqual(before);
  });

  it('rechaza campos de más', async () => {
    const { api } = bridge();
    // biome-ignore lint/suspicious/noExplicitAny: a propósito, un pedido que no cumple el contrato.
    await expect(api['search.query']({ text: 'a', limit: 1000 } as any)).rejects.toThrow();
  });
});

describe('search.opened', () => {
  it('anota lo que abriste y lo muestra cuando buscás sin texto', async () => {
    const { api, workspace } = bridge();
    const subject = workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const card = workspace.cards.create({ question: 'Uno', answer: 'x', subjectId: subject.id });
    await expect(api['search.opened']({ docId: `card:${card.id}` })).resolves.toEqual({});
    const { results, recent } = await api['search.query']({ text: '' });
    expect(recent).toBe(true);
    expect(results.map((hit) => hit.entityId)).toEqual([card.id]);
  });

  it('rechaza un identificador que no tiene la forma de un resultado', async () => {
    const { api } = bridge();
    for (const bad of ['', 'x', 'card:', 'otro:123', `card:${'a'.repeat(200)}`, 5, null]) {
      // biome-ignore lint/suspicious/noExplicitAny: a propósito, un pedido que no cumple el contrato.
      await expect(api['search.opened']({ docId: bad } as any)).rejects.toThrow();
    }
  });
});

describe('search.rebuild', () => {
  it('reconstruye el índice y dice cuántas cosas indexó', async () => {
    const { api } = bridge();
    const { documents } = await api['search.rebuild']({});
    expect(documents).toBeGreaterThan(190);
    await expect(api['search.rebuild']({})).resolves.toEqual({ documents });
  });
});

describe('«Verificar datos» y el índice', () => {
  it('una diferencia del índice llega con su tipo «search» y sin tarjeta', async () => {
    const { api, file } = bridge();
    const { runRaw } = await import('../apoyo/base-cruda');
    runRaw(file, "DELETE FROM search_documents WHERE doc_id LIKE 'card:%' AND rowid % 3 = 0");
    const { differences } = await api['backups.verifyData']({});
    expect(differences.length).toBeGreaterThan(0);
    expect(differences[0]).toMatchObject({ kind: 'search', cardId: null });
    await expect(api['backups.repairData']({})).resolves.toEqual({ differences: [] });
  });
});
