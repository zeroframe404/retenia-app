import { afterEach, describe, expect, it } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { channels } from '../../src/preload/contract';
import { materialEventSchema } from '../../src/preload/contract/events';
import { fileChannels } from '../../src/preload/contract/materials';
import { INFERENCE, sample } from '../apoyo/materiales';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Los canales de los materiales (Fase 13): el principal valida cada pedido antes de tocar nada,
// la ventana nunca manda rutas y los avisos que no validan se descartan.

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

const UUID = '01930000-0000-7000-8000-000000000000';
const registry = { ...channels, ...fileChannels };
const send = (opened: TestBridge, channel: string, request: unknown) =>
  handleMessage({ ...opened.handlers, ...opened.fileHandlers }, channel, request, registry);

describe('materials.*', () => {
  it('cada canal rechaza pedidos que no cumplen el contrato, sin tocar la base', async () => {
    const opened = bridge();
    const bad: [string, unknown][] = [
      ['materials.list', {}],
      ['materials.list', { subjectId: 'no-es-un-id' }],
      ['materials.get', { materialId: 5 }],
      ['materials.page', { materialId: UUID, unit: 0 }],
      ['materials.page', { materialId: UUID, unit: 1.5 }],
      ['materials.addText', { subjectId: UUID, text: '' }],
      ['materials.addText', { subjectId: UUID, text: 'a'.repeat(200_001) }],
      ['materials.decide', { pendingId: UUID, decision: 'borrar' }],
      ['materials.cancel', { materialId: UUID, extra: true }],
      ['materials.createCard', { materialId: UUID, question: 'a', answer: 'b' }],
      ['materials.saveExcerpt', { materialId: UUID, selection: { from: {}, to: {} } }],
      ['materials.open', { materialId: UUID, text: 'a'.repeat(301) }],
    ];
    for (const [channel, request] of bad) {
      await expect(send(opened, channel, request), channel).rejects.toThrow(/rechazada/);
    }
    expect(opened.workspace.materials.count()).toBe(0);
  });

  it('[CA-104] la ventana no tiene un canal para mandar rutas: los archivos llegan solo por el puente de archivos', () => {
    const opened = bridge();
    expect(Object.keys(opened.api)).not.toContain('materials.addFiles');
    expect(Object.keys(channels)).not.toContain('materials.addFiles');
    expect(Object.keys(fileChannels)).toEqual(['materials.addFiles']);
  });

  it('materials.addFiles solo acepta rutas absolutas, de 1 a 20, sin vacías', async () => {
    const opened = bridge();
    const subjectId = opened.workspace.subjects.create({
      name: 'Estadística básica',
      makeActive: true,
    }).id;
    for (const paths of [
      [],
      [''],
      ['relativa.pdf'],
      Array.from({ length: 21 }, () => sample(INFERENCE)),
    ]) {
      await expect(send(opened, 'materials.addFiles', { paths, subjectId })).rejects.toThrow(
        /rechazada/,
      );
    }
    const ok = (await send(opened, 'materials.addFiles', {
      paths: [sample('notas.md')],
      subjectId,
    })) as { results: { outcome: string }[] };
    expect(ok.results.map((result) => result.outcome)).toEqual(['added']);
  });

  it('una ruta a una carpeta o a un archivo que no existe queda en «Error», sin romper nada', async () => {
    const opened = bridge();
    const subjectId = opened.workspace.subjects.create({
      name: 'Estadística básica',
      makeActive: true,
    }).id;
    const result = (await send(opened, 'materials.addFiles', {
      paths: [sample(''), `${sample('no-existe.pdf')}`],
      subjectId,
    })) as { results: { outcome: string; materialId: string }[] };
    expect(result.results).toHaveLength(2);
    for (const each of result.results) {
      const material = await opened.api['materials.get']({ materialId: each.materialId });
      expect(material.state).toEqual({ kind: 'error', problem: 'copyFailed' });
    }
  });

  it('un material que no existe da un error neutro', async () => {
    const opened = bridge();
    await expect(opened.api['materials.get']({ materialId: UUID })).rejects.toThrow();
  });
});

describe('avisos del principal a la ventana', () => {
  it('cada aviso tiene su forma; lo demás se descarta', () => {
    expect(
      materialEventSchema.safeParse({ type: 'material.progress', materialId: UUID }).success,
    ).toBe(true);
    expect(materialEventSchema.safeParse({ type: 'material.done', materialId: UUID }).success).toBe(
      true,
    );
    expect(
      materialEventSchema.safeParse({ type: 'material.failed', materialId: UUID }).success,
    ).toBe(true);
    for (const bad of [
      null,
      {},
      { type: 'material.progress' },
      { type: 'material.borrado', materialId: UUID },
      { type: 'material.done', materialId: UUID, html: '<b>x</b>' },
    ]) {
      expect(materialEventSchema.safeParse(bad).success).toBe(false);
    }
  });
});
