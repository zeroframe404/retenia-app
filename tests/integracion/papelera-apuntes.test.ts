import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { newId } from '../../src/data/ids';
import { trashOrganizationResponse } from '../../src/preload/contract/trash';
import { eventsById, readRows } from '../apoyo/base-cruda';
import { closeSpaces, line, openSpace, pngBytes } from '../apoyo/espacio';

// La Papelera de notas, temas y Bandeja (H-06 y H-09 a H-11): eliminar no borra nada durante 30
// días, «Restaurar» devuelve todo y vaciarla (o vencer) elimina el contenido para siempre.

afterEach(closeSpaces);

function withSubject(options?: Parameters<typeof openSpace>[0]) {
  const space = openSpace(options);
  const subject = space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  return { ...space, subject };
}

// Una nota con título, dos renglones (uno anidado) y un enlace a otra nota.
function writtenNote(space: ReturnType<typeof withSubject>, topicId: string | null = null) {
  const { workspace, subject } = space;
  const other = workspace.notes.create({ subjectId: subject.id, topicId: null });
  workspace.notes.save({
    noteId: other.id,
    title: 'Media y desvío',
    blocks: [line('La media es el promedio', { id: other.blocks[0]?.id })],
  });
  const note = workspace.notes.create({ subjectId: subject.id, topicId });
  const first = note.blocks[0]?.id ?? '';
  const child = newId();
  const mention = { type: 'mention' as const, id: other.id, label: 'Media y desvío' };
  workspace.notes.save({
    noteId: note.id,
    title: 'Intervalos de confianza',
    blocks: [
      {
        ...line('Ver también ', { id: first }),
        content: [{ type: 'text', text: 'Ver también ' }, mention],
      },
      line('un hijo', { id: child, parentId: first }),
    ],
  });
  return { note, other, first, child };
}

describe('notas en la Papelera', () => {
  it('«Eliminar» una nota la deja en la Papelera con su título y las fechas de calendario', () => {
    const space = withSubject();
    const { note } = writtenNote(space);

    const { trashEntryId } = space.workspace.notes.remove({ noteId: note.id });

    const listed = space.workspace.trash.listOrganization();
    expect(listed).toEqual({
      items: [
        {
          id: trashEntryId,
          kind: 'note',
          name: 'Intervalos de confianza',
          deletedDay: '2027-03-15',
          expiresDay: '2027-04-14',
        },
      ],
    });
    expect(trashOrganizationResponse.safeParse(listed).success).toBe(true);
    // La Papelera de las tarjetas no cambia.
    expect(space.workspace.trash.list()).toEqual([]);
  });

  it('una nota sin título se lista con el nombre vacío', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.remove({ noteId: note.id });
    expect(workspace.trash.listOrganization().items[0]).toMatchObject({ kind: 'note', name: '' });
  });

  it('eliminar no borra nada: la nota, sus renglones y sus versiones siguen en la base', () => {
    const space = withSubject();
    const { note } = writtenNote(space);
    const count = (table: string) =>
      readRows(space.file, `SELECT count(*) AS n FROM ${table}`)[0]?.n;
    const before = [count('notes'), count('blocks'), count('block_versions'), count('block_links')];
    space.workspace.notes.remove({ noteId: note.id });
    expect([
      count('notes'),
      count('blocks'),
      count('block_versions'),
      count('block_links'),
    ]).toEqual(before);
  });

  it('«Restaurar» devuelve la nota con sus renglones y deja la operación «note.restore»', () => {
    const space = withSubject();
    const { note } = writtenNote(space);
    const { trashEntryId } = space.workspace.notes.remove({ noteId: note.id });

    expect(space.workspace.trash.restore({ entryId: trashEntryId })).toEqual({ restored: true });

    expect(space.workspace.trash.listOrganization()).toEqual({ items: [] });
    const restored = space.workspace.notes.get({ noteId: note.id });
    expect(restored.title).toBe('Intervalos de confianza');
    expect(restored.blocks.map((block) => block.parentId === null)).toEqual([true, false]);
    expect(
      readRows(
        space.file,
        "SELECT source, trash_entry_id FROM operations WHERE kind = 'note.restore'",
      ),
    ).toEqual([{ source: 'user', trash_entry_id: trashEntryId }]);
  });

  it('restaurar dos veces la misma entrada no hace nada la segunda', () => {
    const space = withSubject();
    const { note } = writtenNote(space);
    const { trashEntryId } = space.workspace.notes.remove({ noteId: note.id });
    space.workspace.trash.restore({ entryId: trashEntryId });
    expect(space.workspace.trash.restore({ entryId: trashEntryId })).toEqual({ restored: false });
  });

  it('restaurar una entrada que no existe no cambia nada', () => {
    const { workspace } = withSubject();
    expect(workspace.trash.restore({ entryId: '01969f1e-0000-7000-8000-000000000001' })).toEqual({
      restored: false,
    });
  });

  it('«Vaciar papelera» elimina para siempre la nota, sus renglones, versiones y enlaces, y deja el historial', () => {
    const space = withSubject();
    const { note, other } = writtenNote(space);
    space.workspace.notes.remove({ noteId: note.id });
    const events = eventsById(space.file);

    expect(space.workspace.trash.empty()).toEqual({ purged: 1 });

    const count = (sql: string, ...params: unknown[]) => readRows(space.file, sql, ...params)[0]?.n;
    expect(count('SELECT count(*) AS n FROM notes WHERE id = ?', note.id)).toBe(0);
    expect(count('SELECT count(*) AS n FROM blocks WHERE note_id = ?', note.id)).toBe(0);
    expect(
      count(
        'SELECT count(*) AS n FROM block_versions WHERE block_id NOT IN (SELECT id FROM blocks)',
      ),
    ).toBe(0);
    expect(count('SELECT count(*) AS n FROM block_links')).toBe(0);
    // La otra nota sigue entera.
    expect(space.workspace.notes.get({ noteId: other.id }).title).toBe('Media y desvío');
    // Las operaciones que la nombraban quedan, más la de vaciar.
    const after = eventsById(space.file);
    for (const [id, row] of events) {
      expect(after.get(id), id).toBe(row);
    }
    expect(readRows(space.file, "SELECT source FROM operations WHERE kind = 'note.purge'")).toEqual(
      [{ source: 'user' }],
    );
    expect(space.workspace.trash.listOrganization()).toEqual({ items: [] });
  });

  it('al eliminar para siempre una nota, los enlaces que apuntaban a ella dejan de existir', () => {
    const space = withSubject();
    const { other } = writtenNote(space);
    space.workspace.notes.remove({ noteId: other.id });
    space.workspace.trash.empty();
    expect(readRows(space.file, 'SELECT count(*) AS n FROM block_links')).toEqual([{ n: 0 }]);
    expect(space.workspace.notes.list({ subjectId: space.subject.id }).notes).toHaveLength(1);
  });

  it('la imagen de una nota eliminada para siempre sigue guardada (otra nota puede usarla)', () => {
    const space = withSubject();
    const { workspace, subject } = space;
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const { sha } = workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [
        {
          id: note.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [{ type: 'image', sha, width: 1, height: 1, alt: '' }],
        },
      ],
    });
    workspace.notes.remove({ noteId: note.id });
    workspace.trash.empty();
    expect(workspace.images.read({ sha }).mime).toBe('image/png');
  });
});

describe('temas en la Papelera', () => {
  it('«Eliminar» un tema lo deja en la Papelera y sus notas pasan a «Sin tema» sin tocarlas', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });

    const { trashEntryId } = workspace.topics.remove({ topicId: topic.id });

    expect(workspace.topics.list({ subjectId: subject.id }).topics).toEqual([]);
    expect(workspace.trash.listOrganization().items).toEqual([
      {
        id: trashEntryId,
        kind: 'topic',
        name: 'Regresión',
        deletedDay: '2027-03-15',
        expiresDay: '2027-04-14',
      },
    ]);
    expect(workspace.notes.list({ subjectId: subject.id }).notes).toEqual([
      expect.objectContaining({ id: note.id, topicId: null, archived: false }),
    ]);
  });

  it('«Restaurar» el tema lo devuelve con sus otros nombres y vuelven a él sus notas', () => {
    const space = withSubject();
    const { workspace, subject } = space;
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.rename({ topicId: topic.id, name: 'Regresión lineal' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    const { trashEntryId } = workspace.topics.remove({ topicId: topic.id });

    expect(workspace.trash.restore({ entryId: trashEntryId })).toEqual({ restored: true });

    expect(workspace.topics.list({ subjectId: subject.id }).topics).toEqual([
      expect.objectContaining({ name: 'Regresión lineal', aliases: ['Regresión'], noteCount: 1 }),
    ]);
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]).toMatchObject({
      id: note.id,
      topicId: topic.id,
    });
    expect(
      readRows(space.file, "SELECT source FROM operations WHERE kind = 'topic.restore'"),
    ).toEqual([{ source: 'user' }]);
  });

  it('si otro tema ya usa el nombre, el tema eliminado no se restaura hasta que ese nombre quede libre', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const { trashEntryId } = workspace.topics.remove({ topicId: topic.id });
    workspace.topics.create({ subjectId: subject.id, name: 'regresión' });
    expect(workspace.trash.restore({ entryId: trashEntryId })).toEqual({ restored: false });
    expect(workspace.trash.listOrganization().items).toHaveLength(1);
  });

  it('el nombre de un tema eliminado queda libre para otro', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.remove({ topicId: topic.id });
    expect(workspace.topics.create({ subjectId: subject.id, name: 'Regresión' }).name).toBe(
      'Regresión',
    );
  });

  it('«Vaciar papelera» elimina el tema y sus otros nombres, y deja sus notas sin tema', () => {
    const space = withSubject();
    const { workspace, subject } = space;
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.rename({ topicId: topic.id, name: 'Regresión lineal' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    workspace.topics.remove({ topicId: topic.id });

    expect(workspace.trash.empty()).toEqual({ purged: 1 });

    expect(readRows(space.file, 'SELECT count(*) AS n FROM topics')).toEqual([{ n: 0 }]);
    expect(readRows(space.file, 'SELECT count(*) AS n FROM topic_aliases')).toEqual([{ n: 0 }]);
    expect(readRows(space.file, 'SELECT topic_id FROM notes WHERE id = ?', note.id)).toEqual([
      { topic_id: null },
    ]);
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.topicId).toBeNull();
    expect(
      readRows(space.file, "SELECT source FROM operations WHERE kind = 'topic.purge'"),
    ).toEqual([{ source: 'user' }]);
  });
});

describe('la Bandeja en la Papelera', () => {
  it('«Restaurar» devuelve el elemento a la Bandeja y el contador sube', () => {
    const space = withSubject();
    const { workspace } = space;
    workspace.inbox.capture({ text: 'Una idea' });
    const item = workspace.inbox.list().items[0];
    const { trashEntryId } = workspace.inbox.remove({ itemId: item?.id ?? '' });
    expect(workspace.trash.listOrganization().items[0]).toMatchObject({
      kind: 'inbox',
      name: 'Una idea',
    });

    expect(workspace.trash.restore({ entryId: trashEntryId })).toEqual({ restored: true });

    expect(workspace.inbox.list()).toEqual({
      items: [{ id: item?.id, text: 'Una idea', day: '2027-03-15' }],
      count: 1,
    });
    expect(
      readRows(space.file, "SELECT source FROM operations WHERE kind = 'inbox.restore'"),
    ).toEqual([{ source: 'user' }]);
  });

  it('un elemento que se movió a un tema ya no está en la Bandeja: no se puede eliminar desde ahí', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.inbox.capture({ text: 'Una idea' });
    const itemId = workspace.inbox.list().items[0]?.id ?? '';
    workspace.inbox.move({ itemId, topicId: topic.id });
    expect(() => workspace.inbox.remove({ itemId })).toThrow();
    expect(workspace.trash.listOrganization()).toEqual({ items: [] });
  });

  it('«Vaciar papelera» elimina para siempre el texto de la Bandeja', () => {
    const space = withSubject();
    space.workspace.inbox.capture({ text: 'Una idea' });
    space.workspace.inbox.remove({ itemId: space.workspace.inbox.list().items[0]?.id ?? '' });
    expect(space.workspace.trash.empty()).toEqual({ purged: 1 });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM inbox_items')).toEqual([{ n: 0 }]);
    expect(
      readRows(space.file, "SELECT source FROM operations WHERE kind = 'inbox.purge'"),
    ).toEqual([{ source: 'user' }]);
  });
});

describe('vaciar y vencer: todos los tipos juntos', () => {
  it('«Vaciar papelera» cuenta tarjetas, notas, temas y elementos de la Bandeja', () => {
    const { workspace, subject } = withSubject();
    const card = workspace.cards.create({ question: 'P', answer: 'R' });
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.inbox.capture({ text: 'Idea' });
    workspace.cards.remove({ cardId: card.id });
    workspace.topics.remove({ topicId: topic.id });
    workspace.notes.remove({ noteId: note.id });
    workspace.inbox.remove({ itemId: workspace.inbox.list().items[0]?.id ?? '' });
    expect(workspace.trash.list()).toHaveLength(1);
    expect(workspace.trash.listOrganization().items).toHaveLength(3);

    expect(workspace.trash.empty()).toEqual({ purged: 4 });

    expect(workspace.trash.list()).toEqual([]);
    expect(workspace.trash.listOrganization()).toEqual({ items: [] });
  });

  it('la lista pone primero lo eliminado más recién', () => {
    const { workspace, subject } = withSubject();
    const first = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const second = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const firstEntry = workspace.notes.remove({ noteId: first.id }).trashEntryId;
    const secondEntry = workspace.notes.remove({ noteId: second.id }).trashEntryId;
    expect(workspace.trash.listOrganization().items.map((item) => item.id)).toEqual([
      secondEntry,
      firstEntry,
    ]);
  });

  it('a los 30 días lo eliminado vence: deja de verse y se elimina para siempre al abrir Retenia', () => {
    let days = 0;
    const space = withSubject({ clock: { now: () => demoClock(days).now() } });
    const { workspace, subject } = space;
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const { note } = writtenNote(space);
    workspace.inbox.capture({ text: 'Idea' });
    workspace.topics.remove({ topicId: topic.id });
    workspace.notes.remove({ noteId: note.id });
    workspace.inbox.remove({ itemId: workspace.inbox.list().items[0]?.id ?? '' });

    days = 29;
    expect(workspace.trash.purgeExpired()).toEqual({ purged: 0 });
    expect(workspace.trash.listOrganization().items).toHaveLength(3);

    days = 30;
    expect(workspace.trash.listOrganization()).toEqual({ items: [] });
    expect(workspace.trash.purgeExpired()).toEqual({ purged: 3 });

    expect(readRows(space.file, 'SELECT count(*) AS n FROM inbox_items')).toEqual([{ n: 0 }]);
    expect(readRows(space.file, 'SELECT count(*) AS n FROM topics')).toEqual([{ n: 0 }]);
    expect(readRows(space.file, 'SELECT id FROM notes WHERE id = ?', note.id)).toEqual([]);
    expect(
      readRows(space.file, "SELECT DISTINCT source FROM operations WHERE kind LIKE '%.purge'"),
    ).toEqual([{ source: 'system' }]);
  });

  it('lo vencido ya no se restaura', () => {
    let days = 0;
    const { workspace, subject } = withSubject({ clock: { now: () => demoClock(days).now() } });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const { trashEntryId } = workspace.notes.remove({ noteId: note.id });
    days = 31;
    expect(workspace.trash.restore({ entryId: trashEntryId })).toEqual({ restored: false });
  });
});
