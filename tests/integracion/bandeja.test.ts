import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { InboxItemNotFoundError, TopicNotFoundError } from '../../src/data/organization-errors';
import { MAX_TITLE_LENGTH, noteSummarySchema } from '../../src/preload/contract/notes';
import {
  inboxCaptureResponse,
  inboxListResponse,
  MAX_INBOX_LENGTH,
} from '../../src/preload/contract/organization';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// La Bandeja (H-11): se anota una línea sin elegir materia ni tema y después se la mueve a un tema,
// donde pasa a ser una nota.

afterEach(closeSpaces);

function withTopic() {
  const space = openSpace();
  const subject = space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const topic = space.workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
  return { ...space, subject, topic };
}

describe('anotar en la Bandeja', () => {
  it('[CA-046] anotar «Revisar el supuesto de normalidad» queda en la Bandeja, sin pedir materia ni tema', () => {
    const { workspace } = openSpace();

    expect(workspace.inbox.capture({ text: 'Revisar el supuesto de normalidad' })).toEqual({
      count: 1,
    });

    const list = workspace.inbox.list();
    expect(list).toEqual({
      items: [
        { id: expect.any(String), text: 'Revisar el supuesto de normalidad', day: '2027-03-15' },
      ],
      count: 1,
    });
    expect(inboxListResponse.safeParse(list).success).toBe(true);
    expect(inboxCaptureResponse.safeParse({ count: 1 }).success).toBe(true);
    expect(workspace.subjects.count()).toBe(0);
  });

  it('[CA-046] lo anotado sigue en la Bandeja al cerrar y abrir', () => {
    const space = openSpace();
    space.workspace.inbox.capture({ text: 'Una idea' });
    expect(space.reopen().inbox.list().count).toBe(1);
  });

  it('el contador sube con cada línea y la más nueva va primera', () => {
    const { workspace } = openSpace();
    expect(workspace.inbox.capture({ text: 'Primera' }).count).toBe(1);
    expect(workspace.inbox.capture({ text: 'Segunda' }).count).toBe(2);
    expect(workspace.inbox.capture({ text: 'Tercera' }).count).toBe(3);
    expect(workspace.inbox.list().items.map((item) => item.text)).toEqual([
      'Tercera',
      'Segunda',
      'Primera',
    ]);
  });

  it('guarda el texto sin los espacios de los bordes', () => {
    const { workspace } = openSpace();
    workspace.inbox.capture({ text: '  Con espacios \n' });
    expect(workspace.inbox.list().items[0]?.text).toBe('Con espacios');
  });

  it('el día es el de Buenos Aires en que se anotó', () => {
    let days = 0;
    const space = openSpace({ clock: { now: () => demoClock(days).now() } });
    space.workspace.inbox.capture({ text: 'Hoy' });
    days = 3;
    space.workspace.inbox.capture({ text: 'Más tarde' });
    expect(space.workspace.inbox.list().items.map((item) => item.day)).toEqual([
      '2027-03-18',
      '2027-03-15',
    ]);
  });

  it('anotar no deja una operación en «Actividad reciente»', () => {
    const space = openSpace();
    space.workspace.inbox.capture({ text: 'Una idea' });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual([{ n: 0 }]);
    expect(space.workspace.activity.recent()).toEqual([]);
  });
});

describe('«Mover a…» un tema', () => {
  it('[CA-047] pasa como nota del tema y el contador baja en uno', () => {
    const { workspace, subject, topic } = withTopic();
    workspace.inbox.capture({ text: 'Revisar el supuesto de normalidad' });
    workspace.inbox.capture({ text: 'Otra idea' });
    const [item] = workspace.inbox.list().items.filter((i) => i.text.startsWith('Revisar'));

    const note = workspace.inbox.move({ itemId: item?.id ?? '', topicId: topic.id });

    expect(note).toEqual({
      id: expect.any(String),
      subjectId: subject.id,
      topicId: topic.id,
      title: 'Revisar el supuesto de normalidad',
      archived: false,
    });
    expect(noteSummarySchema.safeParse(note).success).toBe(true);
    expect(workspace.inbox.list().count).toBe(1);
    expect(workspace.inbox.list().items.map((i) => i.text)).toEqual(['Otra idea']);
    expect(workspace.notes.list({ subjectId: subject.id }).notes).toEqual([note]);
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.noteCount).toBe(1);
  });

  it('[CA-047] la nota trae un renglón vacío y queda al cerrar y abrir', () => {
    const space = withTopic();
    space.workspace.inbox.capture({ text: 'Idea' });
    const note = space.workspace.inbox.move({
      itemId: space.workspace.inbox.list().items[0]?.id ?? '',
      topicId: space.topic.id,
    });
    const reopened = space.reopen();
    expect(reopened.notes.get({ noteId: note.id })).toMatchObject({
      title: 'Idea',
      blocks: [{ parentId: null, collapsed: false, content: [] }],
    });
    expect(reopened.inbox.list().count).toBe(0);
  });

  it('un elemento ya movido no se puede mover de nuevo', () => {
    const { workspace, topic } = withTopic();
    workspace.inbox.capture({ text: 'Idea' });
    const itemId = workspace.inbox.list().items[0]?.id ?? '';
    workspace.inbox.move({ itemId, topicId: topic.id });
    expect(() => workspace.inbox.move({ itemId, topicId: topic.id })).toThrow(
      InboxItemNotFoundError,
    );
  });

  it('a un tema que no existe o está eliminado no se mueve y el elemento queda en la Bandeja', () => {
    const { workspace, subject } = withTopic();
    const removed = workspace.topics.create({ subjectId: subject.id, name: 'Eliminado' });
    workspace.topics.remove({ topicId: removed.id });
    workspace.inbox.capture({ text: 'Idea' });
    const itemId = workspace.inbox.list().items[0]?.id ?? '';
    for (const topicId of [removed.id, '01969f1e-0000-7000-8000-000000000001']) {
      expect(() => workspace.inbox.move({ itemId, topicId })).toThrow(TopicNotFoundError);
    }
    expect(workspace.inbox.list().count).toBe(1);
  });

  it('un elemento que no existe es un error', () => {
    const { workspace, topic } = withTopic();
    expect(() =>
      workspace.inbox.move({ itemId: '01969f1e-0000-7000-8000-000000000001', topicId: topic.id }),
    ).toThrow(InboxItemNotFoundError);
  });

  it('un texto más largo que un título no se pierde: el título se corta y el texto entero va en el renglón', () => {
    const { workspace, topic } = withTopic();
    const text = `${'ñ'.repeat(MAX_TITLE_LENGTH)}fin`;
    expect(text.length).toBeLessThanOrEqual(MAX_INBOX_LENGTH);
    workspace.inbox.capture({ text });
    const note = workspace.inbox.move({
      itemId: workspace.inbox.list().items[0]?.id ?? '',
      topicId: topic.id,
    });
    expect(note.title).toBe('ñ'.repeat(MAX_TITLE_LENGTH));
    expect(workspace.notes.get({ noteId: note.id }).blocks[0]?.content).toEqual([
      { type: 'text', text },
    ]);
  });
});

describe('eliminar de la Bandeja', () => {
  it('«Eliminar» lo manda a la Papelera, baja el contador y deja la operación «inbox.delete»', () => {
    const space = openSpace();
    space.workspace.inbox.capture({ text: 'Idea' });
    const item = space.workspace.inbox.list().items[0];

    const { trashEntryId } = space.workspace.inbox.remove({ itemId: item?.id ?? '' });

    expect(space.workspace.inbox.list()).toEqual({ items: [], count: 0 });
    expect(
      readRows(
        space.file,
        'SELECT entity_type, entity_id FROM trash_entries WHERE id = ?',
        trashEntryId,
      ),
    ).toEqual([{ entity_type: 'inbox', entity_id: item?.id }]);
    expect(
      readRows(
        space.file,
        "SELECT source, trash_entry_id FROM operations WHERE kind = 'inbox.delete'",
      ),
    ).toEqual([{ source: 'user', trash_entry_id: trashEntryId }]);
  });

  it('un elemento que no existe es un error', () => {
    const { workspace } = openSpace();
    expect(() =>
      workspace.inbox.remove({ itemId: '01969f1e-0000-7000-8000-000000000001' }),
    ).toThrow(InboxItemNotFoundError);
  });
});
