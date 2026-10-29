import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { SUBJECT_STATUSES } from '../../src/core/organization';
import { newId } from '../../src/data/ids';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createHandlers, handleMessage } from '../../src/main/bridge';
import { channels } from '../../src/preload/contract';
import {
  IMAGE_TYPES,
  MAX_BLOCK_TEXT_LENGTH,
  MAX_BLOCKS,
  MAX_IMAGE_BYTES,
  MAX_INLINE_NODES,
  MAX_TITLE_LENGTH,
} from '../../src/preload/contract/notes';
import {
  MAX_INBOX_LENGTH,
  MAX_NAME_LENGTH,
  subjectStatus,
} from '../../src/preload/contract/organization';
import { texts } from '../../src/preload/contract/texts';
import { tempDataFolder } from '../apoyo/base';
import { pngBytes } from '../apoyo/espacio';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Los canales de materias, temas, notas, imágenes y Bandeja (Fase 07): el principal valida cada
// pedido antes de tocar nada y cada respuesta antes de devolverla.

const bridges: TestBridge[] = [];
const folders: ReturnType<typeof tempDataFolder>[] = [];
const open: Workspace[] = [];
function bridge() {
  const opened = openBridge();
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
  for (const workspace of open.splice(0)) {
    workspace.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

const UUID = '01969f1e-0000-7000-8000-000000000001';
const SHA = 'a'.repeat(64);

describe('estados de una materia', () => {
  it('los de las reglas puras son los mismos que los del contrato', () => {
    expect([...subjectStatus.options]).toEqual([...SUBJECT_STATUSES]);
  });
});

describe('cada canal del contrato tiene su manejador', () => {
  it('el principal atiende todos los canales del contrato y ninguno de más', () => {
    const { handlers } = bridge();
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(channels).sort());
    for (const channel of [
      'subjects.list',
      'subjects.create',
      'subjects.activate',
      'subjects.createExample',
      'topics.list',
      'topics.create',
      'topics.rename',
      'topics.archive',
      'topics.unarchive',
      'topics.delete',
      'notes.list',
      'notes.create',
      'notes.get',
      'notes.save',
      'notes.move',
      'notes.archive',
      'notes.unarchive',
      'notes.delete',
      'notes.titles',
      'notes.mentions',
      'images.save',
      'images.read',
      'inbox.list',
      'inbox.capture',
      'inbox.move',
      'inbox.delete',
      'trash.listOrganization',
      'window.flushed',
    ]) {
      expect(Object.keys(handlers), channel).toContain(channel);
    }
  });
});

describe('pedidos válidos: cada canal responde con lo que dice su esquema', () => {
  it('materias: crear, listar, activar y cargar el ejemplo', async () => {
    const { api } = bridge();
    const first = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    expect(first).toEqual({
      id: expect.any(String),
      name: 'Estadística básica',
      status: 'active',
      isExample: false,
    });
    const second = await api['subjects.create']({ name: 'Química orgánica' });
    expect(second.status).toBe('maintenance');
    const activated = await api['subjects.activate']({ subjectId: second.id });
    expect(activated.subjects.map((subject) => [subject.name, subject.status])).toEqual([
      ['Química orgánica', 'active'],
      ['Estadística básica', 'maintenance'],
    ]);
    expect(await api['subjects.list']({})).toEqual(activated);
    const example = await api['subjects.createExample']({});
    expect(example).toMatchObject({
      name: texts.example.subject,
      status: 'active',
      isExample: true,
    });
  });

  it('temas: crear, renombrar, archivar, desarchivar y eliminar', async () => {
    const { api } = bridge();
    const subject = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    const topic = await api['topics.create']({ subjectId: subject.id, name: 'Regresión' });
    expect(topic).toMatchObject({ name: 'Regresión', aliases: [], noteCount: 0, archived: false });
    const renamed = await api['topics.rename']({ topicId: topic.id, name: 'Regresión lineal' });
    expect(renamed.aliases).toEqual(['Regresión']);
    expect((await api['topics.archive']({ topicId: topic.id })).archived).toBe(true);
    expect((await api['topics.unarchive']({ topicId: topic.id })).archived).toBe(false);
    expect((await api['topics.list']({ subjectId: subject.id })).topics).toEqual([
      expect.objectContaining({ id: topic.id }),
    ]);
    const removed = await api['topics.delete']({ topicId: topic.id });
    expect(removed.trashEntryId).toEqual(expect.any(String));
    expect((await api['topics.list']({ subjectId: subject.id })).topics).toEqual([]);
  });

  it('notas: crear, guardar, abrir, mover, archivar, enlazar y eliminar', async () => {
    const { api } = bridge();
    const subject = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    const topic = await api['topics.create']({ subjectId: subject.id, name: 'Regresión' });
    const target = await api['notes.create']({ subjectId: subject.id, topicId: null });
    await api['notes.save']({ noteId: target.id, title: 'Media y desvío', blocks: target.blocks });
    const note = await api['notes.create']({ subjectId: subject.id, topicId: topic.id });
    const childId = newId();
    expect(
      await api['notes.save']({
        noteId: note.id,
        title: 'Intervalos',
        blocks: [
          {
            id: note.blocks[0]?.id ?? '',
            parentId: null,
            collapsed: false,
            content: [
              { type: 'text', text: 'Ver también ' },
              { type: 'mention', id: target.id, label: 'Media y desvío' },
            ],
          },
          { id: childId, parentId: note.blocks[0]?.id ?? '', collapsed: false, content: [] },
        ],
      }),
    ).toEqual({});
    const opened = await api['notes.get']({ noteId: note.id });
    expect(opened.blocks).toHaveLength(2);
    expect((await api['notes.list']({ subjectId: subject.id })).notes).toHaveLength(2);
    expect((await api['notes.titles']({ query: 'med' })).notes).toEqual([
      { id: target.id, title: 'Media y desvío', topicName: null },
    ]);
    expect((await api['notes.mentions']({ noteId: target.id })).mentions).toEqual([
      {
        noteId: note.id,
        noteTitle: 'Intervalos',
        blockId: note.blocks[0]?.id,
        excerpt: 'Ver también Media y desvío',
      },
    ]);
    expect((await api['notes.move']({ noteId: note.id, topicId: null })).topicId).toBeNull();
    expect((await api['notes.archive']({ noteId: note.id })).archived).toBe(true);
    expect((await api['notes.unarchive']({ noteId: note.id })).archived).toBe(false);
    expect((await api['notes.delete']({ noteId: note.id })).trashEntryId).toEqual(
      expect.any(String),
    );
    await expect(api['notes.get']({ noteId: note.id })).rejects.toThrow();
  });

  it('imágenes: guardar y leer devuelven la huella y los mismos bytes', async () => {
    const { api } = bridge();
    const bytes = pngBytes();
    const saved = await api['images.save']({ bytes, mime: 'image/png', width: 1, height: 1 });
    expect(saved.sha).toMatch(/^[0-9a-f]{64}$/);
    const read = await api['images.read']({ sha: saved.sha });
    expect(read.mime).toBe('image/png');
    expect(new Uint8Array(read.bytes)).toEqual(bytes);
  });

  it('Bandeja: anotar, listar, mover a un tema y eliminar', async () => {
    const { api } = bridge();
    const subject = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    const topic = await api['topics.create']({ subjectId: subject.id, name: 'Regresión' });
    expect(await api['inbox.capture']({ text: 'Primera idea' })).toEqual({ count: 1 });
    expect(await api['inbox.capture']({ text: 'Segunda idea' })).toEqual({ count: 2 });
    const { items, count } = await api['inbox.list']({});
    expect(count).toBe(2);
    const moved = await api['inbox.move']({ itemId: items[1]?.id ?? '', topicId: topic.id });
    expect(moved).toMatchObject({ title: 'Primera idea', topicId: topic.id });
    const removed = await api['inbox.delete']({ itemId: items[0]?.id ?? '' });
    expect(removed.trashEntryId).toEqual(expect.any(String));
    expect(await api['inbox.list']({})).toEqual({ items: [], count: 0 });
  });

  it('Papelera y Actividad: lo eliminado se lista, se restaura y se puede deshacer', async () => {
    const { api } = bridge();
    const subject = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    const note = await api['notes.create']({ subjectId: subject.id, topicId: null });
    const { trashEntryId } = await api['notes.delete']({ noteId: note.id });
    expect((await api['trash.listOrganization']({})).items).toEqual([
      expect.objectContaining({ id: trashEntryId, kind: 'note', name: '' }),
    ]);
    const { items } = await api['activity.recent']({});
    expect(items[0]).toMatchObject({ kind: 'note.delete', canUndo: true });
    expect(await api['activity.undo']({ operationId: items[0]?.id ?? '' })).toEqual({
      undone: true,
    });
    expect((await api['notes.list']({ subjectId: subject.id })).notes).toHaveLength(1);
    expect(await api['trash.empty']({})).toEqual({ purged: 0 });
  });
});

describe('pedidos inválidos: el principal los rechaza antes de tocar nada', () => {
  let handlers: TestBridge['handlers'];
  beforeEach(() => {
    handlers = bridge().handlers;
  });
  const rejected = async (channel: string, request: unknown) => {
    await expect(handleMessage(handlers, channel, request), channel).rejects.toThrow(
      `Petición rechazada en el canal «${channel}»`,
    );
  };

  it('materias: nombre vacío, de solo espacios, demasiado largo, campos de más o de otro tipo', async () => {
    for (const request of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(MAX_NAME_LENGTH + 1) },
      { name: 'Química', makeActive: 'si' },
      { name: 'Química', extra: 1 },
      { name: 5 },
    ]) {
      await rejected('subjects.create', request);
    }
    for (const request of [{}, { subjectId: 'no-es-uuid' }, { subjectId: UUID, extra: 1 }]) {
      await rejected('subjects.activate', request);
    }
    await rejected('subjects.list', { filtro: 'x' });
    await rejected('subjects.createExample', { activate: false });
  });

  it('temas: identificadores que no son UUID, nombres inválidos y campos de más', async () => {
    for (const request of [
      {},
      { subjectId: 'x', name: 'Regresión' },
      { subjectId: UUID, name: '' },
      { subjectId: UUID, name: ' ' },
      { subjectId: UUID, name: 'x'.repeat(MAX_NAME_LENGTH + 1) },
      { subjectId: UUID, name: 'A', extra: true },
    ]) {
      await rejected('topics.create', request);
    }
    for (const request of [
      { topicId: 'x', name: 'A' },
      { topicId: UUID, name: '' },
      { topicId: UUID },
    ]) {
      await rejected('topics.rename', request);
    }
    for (const channel of ['topics.archive', 'topics.unarchive', 'topics.delete']) {
      for (const request of [{}, { topicId: 'x' }, { topicId: UUID, extra: 1 }]) {
        await rejected(channel, request);
      }
    }
    await rejected('topics.list', { subjectId: 'x' });
    await rejected('topics.list', {});
  });

  it('notas: identificadores, tema obligatorio (nulo o UUID) y campos de más', async () => {
    for (const request of [
      { subjectId: UUID },
      { subjectId: UUID, topicId: 'x' },
      { subjectId: 'x', topicId: null },
      { subjectId: UUID, topicId: null, extra: 1 },
    ]) {
      await rejected('notes.create', request);
    }
    for (const request of [
      { noteId: UUID },
      { noteId: UUID, topicId: 5 },
      { noteId: 'x', topicId: null },
    ]) {
      await rejected('notes.move', request);
    }
    for (const channel of [
      'notes.get',
      'notes.archive',
      'notes.unarchive',
      'notes.delete',
      'notes.mentions',
    ]) {
      for (const request of [{}, { noteId: 'x' }, { noteId: UUID, extra: 1 }]) {
        await rejected(channel, request);
      }
    }
    await rejected('notes.list', { subjectId: 'x' });
    await rejected('notes.titles', {});
    await rejected('notes.titles', { query: 'x'.repeat(MAX_TITLE_LENGTH + 1) });
    await rejected('notes.titles', { query: 'a', extra: 1 });
  });

  it('«notes.save»: sin renglones, renglones repetidos, hijo antes que su padre, padre que no existe', async () => {
    const block = (id: string, parentId: string | null = null) => ({
      id,
      parentId,
      collapsed: false,
      content: [],
    });
    const A = '01969f1e-0000-7000-8000-00000000000a';
    const B = '01969f1e-0000-7000-8000-00000000000b';
    const C = '01969f1e-0000-7000-8000-00000000000c';
    for (const blocks of [
      [],
      [block(A), block(A)],
      [block(A), block(B, A), block(A)],
      [block(B, A), block(A)],
      [block(A, A)],
      [block(A), block(B, C)],
    ]) {
      await rejected('notes.save', { noteId: UUID, title: '', blocks });
    }
  });

  it('«notes.save»: título largo, campos de más y contenido que no es texto, enlace o imagen', async () => {
    const A = '01969f1e-0000-7000-8000-00000000000a';
    const valid = { id: A, parentId: null, collapsed: false, content: [] };
    const withContent = (content: unknown[]) => ({
      noteId: UUID,
      title: '',
      blocks: [{ ...valid, content }],
    });
    for (const request of [
      { noteId: UUID, title: 'x'.repeat(MAX_TITLE_LENGTH + 1), blocks: [valid] },
      { noteId: UUID, title: '', blocks: [valid], extra: 1 },
      { noteId: UUID, blocks: [valid] },
      { noteId: 'x', title: '', blocks: [valid] },
      { noteId: UUID, title: '', blocks: [{ ...valid, collapsed: 'si' }] },
      { noteId: UUID, title: '', blocks: [{ ...valid, extra: 1 }] },
      { noteId: UUID, title: '', blocks: [{ ...valid, parentId: 'x' }] },
      withContent([{ type: 'text', text: '' }]),
      withContent([{ type: 'text', text: 'x'.repeat(MAX_BLOCK_TEXT_LENGTH + 1) }]),
      withContent(
        Array.from({ length: MAX_INLINE_NODES + 1 }, () => ({ type: 'text', text: 'a' })),
      ),
      withContent([{ type: 'text', text: 'a', extra: 1 }]),
      withContent([{ type: 'html', html: '<b>a</b>' }]),
      withContent([{ type: 'mention', id: 'x', label: 'A' }]),
      withContent([{ type: 'mention', id: UUID }]),
      withContent([{ type: 'image', sha: 'xyz', width: 1, height: 1, alt: '' }]),
      withContent([{ type: 'image', sha: SHA.toUpperCase(), width: 1, height: 1, alt: '' }]),
      withContent([{ type: 'image', sha: SHA, width: 0, height: 1, alt: '' }]),
      withContent([{ type: 'image', sha: SHA, width: 1.5, height: 1, alt: '' }]),
      withContent([{ type: 'image', sha: SHA, width: 1, height: 20_001, alt: '' }]),
    ]) {
      await rejected('notes.save', request);
    }
  });

  it('«notes.save»: más renglones que el tope', async () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, () => ({
      id: newId(),
      parentId: null,
      collapsed: false,
      content: [],
    }));
    await rejected('notes.save', { noteId: UUID, title: '', blocks });
  });

  it('imágenes: vacías, de más de 10 MB, que no son bytes, de un tipo fuera de la lista o con medidas raras', async () => {
    const valid = { bytes: pngBytes(), mime: 'image/png', width: 1, height: 1 };
    expect(IMAGE_TYPES).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    for (const request of [
      { ...valid, bytes: new Uint8Array(0) },
      { ...valid, bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) },
      { ...valid, bytes: [1, 2, 3] },
      { ...valid, bytes: 'texto' },
      { ...valid, mime: 'image/svg+xml' },
      { ...valid, mime: 'image/bmp' },
      { ...valid, mime: 'text/html' },
      { ...valid, width: 0 },
      { ...valid, height: -1 },
      { ...valid, width: 1.5 },
      { ...valid, width: 20_001 },
      { ...valid, extra: 1 },
      { bytes: valid.bytes, mime: 'image/png', width: 1 },
    ]) {
      await rejected('images.save', request);
    }
    for (const request of [
      {},
      { sha: 'abc' },
      { sha: SHA.toUpperCase() },
      { sha: `${SHA}0` },
      { sha: SHA, extra: 1 },
    ]) {
      await rejected('images.read', request);
    }
  });

  it('imágenes: una de justo 10 MB entra al contrato', async () => {
    const { handlers } = bridge();
    // Pasa la validación del pedido; el contenido (que no es una imagen) lo rechaza el almacén.
    await expect(
      handleMessage(handlers, 'images.save', {
        bytes: new Uint8Array(MAX_IMAGE_BYTES),
        mime: 'image/png',
        width: 1,
        height: 1,
      }),
    ).rejects.not.toThrow('Petición rechazada');
  });

  it('Bandeja: texto vacío o de más de 1000 caracteres, identificadores y campos de más', async () => {
    for (const request of [
      {},
      { text: '' },
      { text: '  \n ' },
      { text: 'x'.repeat(MAX_INBOX_LENGTH + 1) },
      { text: 'a', topicId: UUID },
      { text: 5 },
    ]) {
      await rejected('inbox.capture', request);
    }
    for (const request of [
      { itemId: UUID },
      { itemId: 'x', topicId: UUID },
      { itemId: UUID, topicId: null },
    ]) {
      await rejected('inbox.move', request);
    }
    for (const request of [{}, { itemId: 'x' }, { itemId: UUID, extra: 1 }]) {
      await rejected('inbox.delete', request);
    }
    await rejected('inbox.list', { filtro: 'x' });
  });

  it('Papelera y ventana: sin datos de más', async () => {
    await rejected('trash.listOrganization', { filtro: 'x' });
    await rejected('window.flushed', { listo: true });
  });

  it('un pedido rechazado no deja nada en los datos', async () => {
    const { handlers, workspace } = bridge();
    await expect(handleMessage(handlers, 'subjects.create', { name: '' })).rejects.toThrow();
    await expect(handleMessage(handlers, 'inbox.capture', { text: '' })).rejects.toThrow();
    expect(workspace.subjects.count()).toBe(0);
    expect(workspace.inbox.list().count).toBe(0);
  });
});

describe('respuestas: el principal no devuelve lo que no pasa el esquema', () => {
  it('una respuesta con un estado de materia que no existe se rechaza', async () => {
    const { handlers } = bridge();
    handlers['subjects.list'] = async () => ({
      subjects: [{ id: UUID, name: 'A', status: 'raro' as never, isExample: false }],
    });
    await expect(handleMessage(handlers, 'subjects.list', {})).rejects.toThrow(
      'Respuesta rechazada en el canal «subjects.list»',
    );
  });

  it('una respuesta con campos de más se rechaza', async () => {
    const { handlers } = bridge();
    handlers['inbox.list'] = async () => ({ items: [], count: 0, extra: 1 }) as never;
    await expect(handleMessage(handlers, 'inbox.list', {})).rejects.toThrow(
      'Respuesta rechazada en el canal «inbox.list»',
    );
  });

  it('una respuesta con un tipo de imagen fuera de la lista se rechaza', async () => {
    const { handlers } = bridge();
    handlers['images.read'] = async () => ({ mime: 'image/svg+xml' as never, bytes: pngBytes() });
    await expect(handleMessage(handlers, 'images.read', { sha: SHA })).rejects.toThrow(
      'Respuesta rechazada en el canal «images.read»',
    );
  });
});

describe('«window.flushed»', () => {
  function handlersWith(onFlushed?: () => void) {
    const folder = tempDataFolder();
    folders.push(folder);
    const clock = demoClock();
    const workspace = openWorkspace({ dataDir: folder.folder, clock, appVersion: '0.0.0-prueba' });
    open.push(workspace);
    return createHandlers({
      clock,
      variant: 'prueba',
      workspace,
      version: '0.0.0-prueba',
      openFolder: async () => '',
      ...(onFlushed ? { onFlushed } : {}),
    });
  }

  it('avisa al principal que la pantalla ya guardó lo pendiente y contesta vacío', async () => {
    let flushed = 0;
    const handlers = handlersWith(() => {
      flushed += 1;
    });
    expect(await handleMessage(handlers, 'window.flushed', {})).toEqual({});
    expect(flushed).toBe(1);
  });

  it('sin quien escuche, no hace nada y contesta igual', async () => {
    const handlers = handlersWith();
    expect(await handleMessage(handlers, 'window.flushed', {})).toEqual({});
  });
});
