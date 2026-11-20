import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outsideFolder, removeOutsideFolders, sample } from '../apoyo/importar';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Los canales de importar y exportar (Fase 15) con el principal real y la base real: la ventana
// nunca manda una ruta (la elige el diálogo de Windows, acá su doble), cada mensaje se valida, la
// vista previa no escribe y «Guardar lista» escribe el archivo.

const bridges: TestBridge[] = [];
afterEach(() => {
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
  removeOutsideFolders();
});

function open(options: Parameters<typeof openBridge>[0] = {}) {
  const bridge = openBridge(options);
  bridges.push(bridge);
  return bridge;
}

const history = async (bridge: TestBridge) => {
  const { subjects } = await bridge.api['subjects.list']({});
  const found = subjects.find((subject) => subject.name === 'Historia argentina');
  if (!found) {
    throw new Error('falta Historia argentina');
  }
  return found.id;
};

describe('importar por el puente', () => {
  it('[CA-122] «imports.choose» abre el diálogo, arma la vista previa y no escribe nada', async () => {
    const bridge = open({ withCast: true });
    bridge.answerDialogs({ file: sample('mazo-demo.apkg') });
    const before = bridge.workspace.cards.count();
    const chosen = await bridge.api['imports.choose']({ kind: 'anki' });
    expect(chosen.outcome).toBe('preview');
    expect(bridge.dialogRequests.at(-1)).toEqual({
      kind: 'file',
      title: 'Elegí la exportación de Anki',
    });
    expect(bridge.workspace.cards.count()).toBe(before);
  });

  it('[CA-122] la ventana no puede mandar una ruta', async () => {
    const bridge = open({ withCast: true });
    await expect(
      bridge.api['imports.choose']({ kind: 'anki', path: sample('mazo-demo.apkg') } as never),
    ).rejects.toThrow('Petición rechazada en el canal «imports.choose»');
  });

  it('[CA-122] cancelar el diálogo no hace nada', async () => {
    const bridge = open({ withCast: true });
    bridge.answerDialogs({ file: null });
    expect(await bridge.api['imports.choose']({ kind: 'anki' })).toEqual({ outcome: 'cancelled' });
  });

  it('[CA-126] «imports.run» importa a la materia elegida después de la copia «Antes de importar»', async () => {
    const bridge = open({ withCast: true });
    bridge.answerDialogs({ file: sample('mazo-demo.apkg') });
    const chosen = await bridge.api['imports.choose']({ kind: 'anki' });
    if (chosen.outcome !== 'preview') {
      throw new Error('sin vista previa');
    }
    const subjectId = await history(bridge);
    const result = await bridge.api['imports.run']({
      previewId: chosen.preview.previewId,
      destination: { kind: 'subject', subjectId },
    });
    expect(result.subjectName).toBe('Historia argentina');
    const { backups } = await bridge.api['backups.list']({});
    expect(
      backups.filter((backup) => backup.readable && backup.kind === 'before_import'),
    ).toHaveLength(1);
  });

  it('[CA-125] «Guardar lista» escribe la lista de rechazadas con su motivo', async () => {
    const bridge = open({ withCast: true });
    bridge.answerDialogs({ file: sample('remnote-demo.zip') });
    const chosen = await bridge.api['imports.choose']({ kind: 'remnote' });
    if (chosen.outcome !== 'preview') {
      throw new Error('sin vista previa');
    }
    const { importId } = await bridge.api['imports.run']({
      previewId: chosen.preview.previewId,
      destination: { kind: 'subject', subjectId: await history(bridge) },
    });
    const target = join(outsideFolder(), 'rechazadas.txt');
    bridge.answerDialogs({ save: target });
    expect(await bridge.api['imports.saveRejected']({ importId })).toEqual({ saved: true });
    expect(bridge.dialogRequests.at(-1)?.defaultName).toBe('Rechazadas de remnote-demo.txt');
    const text = readFileSync(target, 'utf8');
    expect(text).toContain('Cruce de los Andes: mapa-del-cruce.png · imagen faltante');
    const { imports } = await bridge.api['imports.list']({});
    expect(imports[0]?.rejected).toEqual([
      { what: 'Cruce de los Andes: mapa-del-cruce.png', reason: 'missingImage' },
    ]);
  });
});

describe('exportar e importar exportación por el puente', () => {
  it('[CA-127] «exports.all» guarda el comprimido donde se eligió y devuelve los conteos', async () => {
    const bridge = open({ withCast: true });
    const target = join(outsideFolder(), 'Retenia.zip');
    bridge.answerDialogs({ save: target });
    const result = await bridge.api['exports.all']({});
    expect(result.outcome).toBe('exported');
    expect(bridge.dialogRequests.at(-1)?.defaultName).toBe('Retenia 15-03-2027.zip');
    expect(readFileSync(target).subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('[CA-128] con datos, «exports.choose» dice que hace falta un Retenia vacío sin abrir el diálogo', async () => {
    const bridge = open({ withCast: true });
    expect(await bridge.api['exports.canLoad']({})).toEqual({ empty: false });
    expect(await bridge.api['exports.choose']({})).toEqual({
      outcome: 'problem',
      problem: 'notEmpty',
    });
    expect(bridge.dialogRequests).toEqual([]);
  });

  it('[CA-128] en un Retenia vacío, cargar la exportación deja los mismos conteos y 0 diferencias', async () => {
    const origin = open({ withCast: true });
    const target = join(outsideFolder(), 'Retenia.zip');
    origin.answerDialogs({ save: target });
    const exported = await origin.api['exports.all']({});
    if (exported.outcome !== 'exported') {
      throw new Error('no exportó');
    }
    const empty = open();
    empty.answerDialogs({ file: target });
    const chosen = await empty.api['exports.choose']({});
    if (chosen.outcome !== 'preview') {
      throw new Error('sin vista previa');
    }
    const loaded = await empty.api['exports.load']({ previewId: chosen.previewId });
    expect(loaded.counts).toEqual(exported.counts);
    expect(await empty.api['backups.verifyData']({})).toEqual({ differences: [] });
  });
});
