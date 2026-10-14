import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { runRaw } from '../apoyo/base-cruda';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Contrato de los canales de la Fase 04: tarjetas (editar, eliminar, historial), papelera,
// actividad reciente y copias. Del lado de la ventana, el puente; del otro, el manejador real
// del principal con una carpeta de datos real.

const ATTEMPT = '01969f1e-0000-4000-8000-0000000000a1';
const UNKNOWN = '01969f1e-0000-7000-8000-000000000000';

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

async function rejected(handlers: TestBridge['handlers'], channel: string, request: unknown) {
  await expect(handleMessage(handlers, channel, request), JSON.stringify(request)).rejects.toThrow(
    `Petición rechazada en el canal «${channel}»`,
  );
}

describe('contrato: editar, eliminar e historial', () => {
  it('«cards.edit», «cards.history» y «cards.delete» hacen lo suyo y rechazan pedidos mal formados', async () => {
    const { api, handlers } = bridge();
    const card = await api['cards.create']({ question: 'P', answer: 'R' });
    await api['cards.review']({ cardId: card.id, grade: 'good', attemptId: ATTEMPT });
    expect(
      await api['cards.edit']({ cardId: card.id, question: ' P2 ', answer: 'R' }),
    ).toMatchObject({
      id: card.id,
      question: 'P2',
    });
    expect(await api['cards.history']({ cardId: card.id })).toEqual({
      question: 'P2',
      entries: [expect.objectContaining({ day: '2027-03-15', result: 'good' })],
    });
    const removed = await api['cards.delete']({ cardId: card.id });
    expect(removed.trashEntryId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await api['cards.list']({})).cards).toEqual([]);

    for (const request of [
      { cardId: card.id, question: '', answer: 'R' },
      { cardId: 'x', question: 'P', answer: 'R' },
      { cardId: card.id, question: 'P' },
    ]) {
      await rejected(handlers, 'cards.edit', request);
    }
    for (const channel of ['cards.history', 'cards.delete']) {
      await rejected(handlers, channel, { cardId: 'no-es-un-uuid' });
      await rejected(handlers, channel, { cardId: card.id, extra: 1 });
    }
    await expect(handleMessage(handlers, 'cards.delete', { cardId: UNKNOWN })).rejects.toThrow(
      'No encontré la tarjeta',
    );
  });
});

describe('contrato: papelera y actividad reciente', () => {
  it('«trash.list», «trash.restore» y «trash.empty» con la tarjeta eliminada', async () => {
    const { api, handlers } = bridge();
    const card = await api['cards.create']({ question: '¿Qué es la varianza?', answer: 'R' });
    const { trashEntryId } = await api['cards.delete']({ cardId: card.id });
    expect(await api['trash.list']({})).toEqual({
      items: [
        {
          id: trashEntryId,
          cardId: card.id,
          question: '¿Qué es la varianza?',
          deletedDay: '2027-03-15',
          expiresDay: '2027-04-14',
        },
      ],
    });
    expect(await api['trash.restore']({ entryId: trashEntryId })).toEqual({ restored: true });
    expect(await api['trash.restore']({ entryId: trashEntryId })).toEqual({ restored: false });
    await api['cards.delete']({ cardId: card.id });
    expect(await api['trash.empty']({})).toEqual({ purged: 1 });
    expect(await api['trash.list']({})).toEqual({ items: [] });

    await rejected(handlers, 'trash.restore', { entryId: 'x' });
    await rejected(handlers, 'trash.list', { todo: true });
    await rejected(handlers, 'trash.empty', { cuales: 'todas' });
  });

  it('«activity.recent» muestra el cambio y «activity.undo» lo deshace', async () => {
    const { api, handlers } = bridge();
    const card = await api['cards.create']({ question: 'Antes', answer: 'R' });
    await api['cards.edit']({ cardId: card.id, question: 'Después', answer: 'R' });
    const { items } = await api['activity.recent']({});
    expect(items[0]).toEqual({
      id: expect.any(String),
      kind: 'card.edit',
      undoneKind: null,
      label: 'Después',
      day: '2027-03-15',
      time: '10:00',
      canUndo: true,
    });
    expect(await api['activity.undo']({ operationId: items[0]?.id ?? '' })).toEqual({
      undone: true,
    });
    expect((await api['cards.list']({})).cards[0]?.question).toBe('Antes');
    expect(await api['activity.undo']({ operationId: UNKNOWN })).toEqual({ undone: false });
    await rejected(handlers, 'activity.undo', { operationId: 'x' });
    await rejected(handlers, 'activity.recent', { limite: 10 });
  });
});

describe('contrato: datos y copias', () => {
  it('«backups.verifyData» da 0 diferencias y, con una agenda tocada, la diferencia; «backups.repairData» la arregla', async () => {
    const { api, dataDir } = bridge();
    const card = await api['cards.create']({ question: '¿Qué es la varianza?', answer: 'R' });
    await api['cards.review']({ cardId: card.id, grade: 'good', attemptId: ATTEMPT });
    expect(await api['backups.verifyData']({})).toEqual({ differences: [] });
    runRaw(
      join(dataDir, 'retenia.db'),
      "UPDATE card_schedule SET due_at = '2027-04-30T13:00:00.000Z' WHERE card_id = ?",
      card.id,
    );
    expect(await api['backups.verifyData']({})).toEqual({
      differences: [
        {
          cardId: card.id,
          question: '¿Qué es la varianza?',
          kind: 'due',
          storedDay: '2027-04-30',
          expectedDay: '2027-03-17',
        },
      ],
    });
    expect(await api['backups.repairData']({})).toEqual({ differences: [] });
  });

  it('«backups.createNow» suma una copia verificada a la lista, y «backups.restore» la restaura por su identificador', async () => {
    const { api } = bridge();
    await api['cards.create']({ question: 'En la copia', answer: 'R' });
    const { created, backups } = await api['backups.createNow']({});
    expect(created).toEqual({
      readable: true,
      id: expect.any(String),
      kind: 'manual',
      day: '2027-03-15',
      time: '10:00',
      sizeBytes: expect.any(Number),
    });
    expect(backups).toEqual([created]);
    expect(await api['backups.list']({})).toEqual({ backups: [created] });

    await api['cards.create']({ question: 'Después de la copia', answer: 'R' });
    const restored = await api['backups.restore']({ backupId: created.readable ? created.id : '' });
    expect(restored.restoredFrom).toEqual({ day: '2027-03-15', time: '10:00' });
    expect(restored.backups.map((backup) => (backup.readable ? backup.kind : null))).toEqual([
      'before_restore',
      'manual',
    ]);
    expect((await api['cards.list']({})).cards.map((item) => item.question)).toEqual([
      'En la copia',
    ]);
  });

  it('las copias se piden por identificador: nunca una ruta, ni un identificador que no existe', async () => {
    const { handlers } = bridge();
    for (const backupId of ['C:\\Users\\otro\\copia.retenia-copia', '../../retenia.db', 'x', '']) {
      await rejected(handlers, 'backups.restore', { backupId });
    }
    await rejected(handlers, 'backups.restore', { file: 'copia.retenia-copia' });
    await expect(
      handleMessage(handlers, 'backups.restore', { backupId: UNKNOWN }),
    ).rejects.toThrow();
    for (const channel of [
      'backups.list',
      'backups.createNow',
      'backups.verifyData',
      'backups.repairData',
      'backups.openFolder',
    ]) {
      await rejected(handlers, channel, { ruta: 'C:\\' });
    }
  });

  it('«backups.openFolder» abre la carpeta de copias con el Explorador (simulado)', async () => {
    const { api, dataDir, opened } = bridge();
    expect(await api['backups.openFolder']({})).toEqual({});
    expect(opened).toEqual([join(dataDir, 'copias')]);
    expect(existsSync(join(dataDir, 'copias'))).toBe(true);
  });

  it('si el Explorador no puede abrir la carpeta, el pedido falla (simulado)', async () => {
    const failing = openBridge({ openFolder: async () => 'No se pudo abrir' });
    bridges.push(failing);
    await expect(handleMessage(failing.handlers, 'backups.openFolder', {})).rejects.toThrow();
  });
});
