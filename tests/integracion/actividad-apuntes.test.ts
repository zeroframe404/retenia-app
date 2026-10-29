import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { activityRecentResponse } from '../../src/preload/contract/activity';
import { eventsById, readRows } from '../apoyo/base-cruda';
import { closeSpaces, line, openSpace } from '../apoyo/espacio';

// «Actividad reciente» y «Deshacer» para materias, temas, notas y Bandeja (H-06, CA-045): cada
// cambio es una operación, deshacerlo agrega la inversa y solo se ofrece mientras la cosa siga
// como la dejó ese cambio.

afterEach(closeSpaces);

function withSubject(options?: Parameters<typeof openSpace>[0]) {
  const space = openSpace(options);
  const subject = space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const topic = space.workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
  // Lo de arriba es de preparación: «Actividad reciente» empieza desde acá.
  const recent = () => space.workspace.activity.recent();
  const undo = (operationId: string | undefined) =>
    space.workspace.activity.undo({ operationId: operationId ?? '' });
  return { ...space, subject, topic, recent, undo };
}

const kinds = (items: { kind: string }[]) => items.map((item) => item.kind);

describe('«Hacer activa» y «Deshacer»', () => {
  it('[CA-038] deshacer devuelve la activa de antes y deja a la otra como estaba (en pausa)', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const example = workspace.subjects.createExample({ activate: false });
    expect(example.status).toBe('paused');

    workspace.subjects.activate({ subjectId: example.id });
    const activation = recent().find((item) => item.kind === 'subject.activate');
    expect(undo(activation?.id)).toEqual({ undone: true });

    const byId = Object.fromEntries(
      workspace.subjects.list().subjects.map((entry) => [entry.id, entry.status]),
    );
    expect(byId).toEqual({ [subject.id]: 'active', [example.id]: 'paused' });
  });
});

describe('qué muestra «Actividad reciente»', () => {
  it('muestra altas, movimientos, archivados y borrados de notas y temas, con su nombre de hoy', () => {
    const { workspace, subject, topic, recent } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: 'Intervalos de confianza',
      blocks: [line('', { id: note.blocks[0]?.id })],
    });
    workspace.notes.move({ noteId: note.id, topicId: topic.id });
    workspace.notes.archive({ noteId: note.id });
    workspace.topics.rename({ topicId: topic.id, name: 'Regresión lineal' });

    const items = recent();

    expect(items.map(({ kind, label }) => [kind, label])).toEqual([
      ['topic.rename', 'Regresión lineal'],
      ['note.archive', 'Intervalos de confianza'],
      ['note.move', 'Intervalos de confianza'],
      ['note.create', 'Intervalos de confianza'],
      ['topic.create', 'Regresión lineal'],
    ]);
    expect(items[0]).toMatchObject({ day: '2027-03-15', time: '10:00', undoneKind: null });
    expect(activityRecentResponse.safeParse({ items }).success).toBe(true);
  });

  it('una nota sin título aparece con la etiqueta vacía, no nula', () => {
    const { workspace, subject, recent } = withSubject();
    workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(recent()[0]).toMatchObject({ kind: 'note.create', label: '' });
  });

  it('«Hacer activa» aparece con el nombre de la materia', () => {
    const { workspace, recent } = withSubject();
    const chemistry = workspace.subjects.create({ name: 'Química orgánica', makeActive: false });
    workspace.subjects.activate({ subjectId: chemistry.id });
    expect(recent()[0]).toMatchObject({ kind: 'subject.activate', label: 'Química orgánica' });
  });

  it('un elemento de la Bandeja eliminado aparece con su texto', () => {
    const { workspace, recent } = withSubject();
    workspace.inbox.capture({ text: 'Una idea' });
    workspace.inbox.remove({ itemId: workspace.inbox.list().items[0]?.id ?? '' });
    expect(recent()[0]).toMatchObject({ kind: 'inbox.delete', label: 'Una idea' });
  });

  it('escribir en una nota no deja renglones en «Actividad reciente»', () => {
    const { workspace, subject, recent } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const before = recent().length;
    for (const text of ['a', 'ab', 'abc']) {
      workspace.notes.save({
        noteId: note.id,
        title: text,
        blocks: [line(text, { id: note.blocks[0]?.id })],
      });
    }
    expect(recent()).toHaveLength(before);
  });

  it('anotar en la Bandeja y mover un elemento a un tema tampoco dejan renglones', () => {
    const { workspace, topic, recent } = withSubject();
    const before = recent().length;
    workspace.inbox.capture({ text: 'Una idea' });
    workspace.inbox.move({ itemId: workspace.inbox.list().items[0]?.id ?? '', topicId: topic.id });
    expect(recent()).toHaveLength(before);
  });

  it('no muestra lo del ejemplo ni lo del sistema', () => {
    const { workspace } = openSpace();
    const subject = workspace.subjects.create({ name: 'Materia', makeActive: true });
    workspace.topics.create({ subjectId: subject.id, name: 'Del sistema' }, { source: 'system' });
    workspace.topics.create({ subjectId: subject.id, name: 'De la demo' }, { source: 'demo' });
    expect(workspace.activity.recent()).toEqual([]);
  });
});

describe('deshacer notas', () => {
  it('[CA-045] archivar una nota: «Deshacer» la devuelve a la lista y agrega la operación inversa', () => {
    const space = withSubject();
    const { workspace, subject, recent, undo } = space;
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.archive({ noteId: note.id });
    const [archive] = recent();
    expect(archive).toMatchObject({ kind: 'note.archive', canUndo: true });
    const events = eventsById(space.file);

    expect(undo(archive?.id)).toEqual({ undone: true });

    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.archived).toBe(false);
    const [inverse, original] = recent();
    expect(inverse).toMatchObject({
      kind: 'note.unarchive',
      undoneKind: 'note.archive',
      canUndo: true,
    });
    expect(original).toMatchObject({ id: archive?.id, canUndo: false });
    expect(
      readRows(
        space.file,
        "SELECT undoes_id, source FROM operations WHERE kind = 'note.unarchive'",
      ),
    ).toEqual([{ undoes_id: archive?.id, source: 'user' }]);
    // Deshacer agregó; no cambió ni borró nada de antes.
    const after = eventsById(space.file);
    for (const [id, row] of events) {
      expect(after.get(id), id).toBe(row);
    }
  });

  it('[CA-045] deshacer lo deshecho vuelve a archivarla', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.archive({ noteId: note.id });
    undo(recent()[0]?.id);
    undo(recent()[0]?.id);
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.archived).toBe(true);
  });

  it('[CA-045] si la nota ya no está archivada, ese renglón no se deshace y pedirlo no cambia nada', () => {
    const space = withSubject();
    const { workspace, subject, recent, undo } = space;
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.archive({ noteId: note.id });
    const [archive] = recent();
    workspace.notes.unarchive({ noteId: note.id });
    expect(recent().find((item) => item.id === archive?.id)?.canUndo).toBe(false);
    const operations = readRows(space.file, 'SELECT count(*) AS n FROM operations');
    expect(undo(archive?.id)).toEqual({ undone: false });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual(operations);
  });

  it('deshacer un alta manda la nota a la Papelera, y deshacer ese borrado la devuelve', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const [creation] = recent();
    expect(creation).toMatchObject({ kind: 'note.create', canUndo: true });

    undo(creation?.id);

    expect(workspace.notes.list({ subjectId: subject.id }).notes).toEqual([]);
    expect(workspace.trash.listOrganization().items.map((item) => item.kind)).toEqual(['note']);
    const [removal] = recent();
    expect(removal).toMatchObject({
      kind: 'note.delete',
      undoneKind: 'note.create',
      canUndo: true,
    });

    undo(removal?.id);

    expect(workspace.notes.list({ subjectId: subject.id }).notes.map((n) => n.id)).toEqual([
      note.id,
    ]);
    expect(workspace.trash.listOrganization().items).toEqual([]);
    expect(recent()[0]).toMatchObject({ kind: 'note.restore', undoneKind: 'note.delete' });
  });

  it('deshacer un borrado restaura la nota con sus renglones, igual que «Restaurar» en la Papelera', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: 'Con texto',
      blocks: [line('uno', { id: note.blocks[0]?.id })],
    });
    workspace.notes.remove({ noteId: note.id });
    expect(recent()[0]).toMatchObject({ kind: 'note.delete', canUndo: true });
    expect(undo(recent()[0]?.id)).toEqual({ undone: true });
    expect(workspace.notes.get({ noteId: note.id }).title).toBe('Con texto');
  });

  it('una restauración se deshace mandando la nota otra vez a la Papelera', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const { trashEntryId } = workspace.notes.remove({ noteId: note.id });
    workspace.trash.restore({ entryId: trashEntryId });
    expect(recent()[0]).toMatchObject({ kind: 'note.restore', canUndo: true });
    undo(recent()[0]?.id);
    expect(workspace.notes.list({ subjectId: subject.id }).notes).toEqual([]);
  });

  it('un borrado ya restaurado desde la Papelera no se deshace', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const { trashEntryId } = workspace.notes.remove({ noteId: note.id });
    workspace.trash.restore({ entryId: trashEntryId });
    const removal = recent().find((item) => item.kind === 'note.delete');
    expect(removal?.canUndo).toBe(false);
    expect(undo(removal?.id)).toEqual({ undone: false });
  });

  it('mover una nota se deshace volviéndola a su tema, y ya no si se movió de nuevo', () => {
    const { workspace, subject, topic, recent, undo } = withSubject();
    const other = workspace.topics.create({ subjectId: subject.id, name: 'Correlación' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.move({ noteId: note.id, topicId: topic.id });
    const [firstMove] = recent();
    expect(firstMove).toMatchObject({ kind: 'note.move', canUndo: true });
    undo(firstMove?.id);
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.topicId).toBeNull();

    workspace.notes.move({ noteId: note.id, topicId: topic.id });
    const [secondMove] = recent();
    workspace.notes.move({ noteId: note.id, topicId: other.id });
    expect(recent().find((item) => item.id === secondMove?.id)?.canUndo).toBe(false);
    expect(undo(secondMove?.id)).toEqual({ undone: false });
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.topicId).toBe(other.id);
  });

  it('mover no se deshace si el tema de antes se eliminó', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const origin = workspace.topics.create({ subjectId: subject.id, name: 'Origen' });
    const target = workspace.topics.create({ subjectId: subject.id, name: 'Destino' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: origin.id });
    workspace.notes.move({ noteId: note.id, topicId: target.id });
    const [move] = recent();
    workspace.topics.remove({ topicId: origin.id });
    expect(recent().find((item) => item.id === move?.id)?.canUndo).toBe(false);
    expect(undo(move?.id)).toEqual({ undone: false });
  });
});

describe('deshacer temas y materias', () => {
  it('deshacer el alta de un tema lo manda a la Papelera', () => {
    const { workspace, subject, topic, recent, undo } = withSubject();
    const creation = recent().find((item) => item.kind === 'topic.create');
    expect(creation).toMatchObject({ canUndo: true, label: 'Regresión' });
    undo(creation?.id);
    expect(workspace.topics.list({ subjectId: subject.id }).topics).toEqual([]);
    expect(workspace.trash.listOrganization().items[0]).toMatchObject({
      kind: 'topic',
      name: topic.name,
    });
  });

  it('renombrar un tema se deshace volviendo al nombre de antes', () => {
    const { workspace, subject, topic, recent, undo } = withSubject();
    workspace.topics.rename({ topicId: topic.id, name: 'Regresión lineal' });
    const [rename] = recent();
    expect(rename).toMatchObject({ kind: 'topic.rename', canUndo: true });
    undo(rename?.id);
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]).toMatchObject({
      name: 'Regresión',
      aliases: ['Regresión lineal'],
    });
    expect(recent()[0]).toMatchObject({ kind: 'topic.rename', undoneKind: 'topic.rename' });
  });

  it('renombrar no se deshace si el tema volvió a cambiar de nombre o si otro usa el de antes', () => {
    const { workspace, subject, topic, recent, undo } = withSubject();
    workspace.topics.rename({ topicId: topic.id, name: 'Regresión lineal' });
    const [rename] = recent();
    workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    expect(recent().find((item) => item.id === rename?.id)?.canUndo).toBe(false);
    expect(undo(rename?.id)).toEqual({ undone: false });
    workspace.topics.rename({ topicId: topic.id, name: 'Otro más' });
    expect(undo(rename?.id)).toEqual({ undone: false });
  });

  it('archivar un tema se deshace desarchivándolo', () => {
    const { workspace, subject, topic, recent, undo } = withSubject();
    workspace.topics.archive({ topicId: topic.id });
    const [archive] = recent();
    expect(archive).toMatchObject({ kind: 'topic.archive', canUndo: true });
    undo(archive?.id);
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.archived).toBe(false);
  });

  it('eliminar un tema se deshace restaurándolo con sus notas', () => {
    const { workspace, subject, topic, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    workspace.topics.remove({ topicId: topic.id });
    undo(recent()[0]?.id);
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]).toMatchObject({
      id: topic.id,
      noteCount: 1,
    });
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]).toMatchObject({
      id: note.id,
      topicId: topic.id,
    });
  });

  it('[CA-038] «Hacer activa» se deshace activando la materia que estaba antes', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const chemistry = workspace.subjects.create({ name: 'Química orgánica', makeActive: false });
    workspace.subjects.activate({ subjectId: chemistry.id });
    const [activation] = recent();
    expect(activation).toMatchObject({ kind: 'subject.activate', canUndo: true });

    undo(activation?.id);

    expect(workspace.subjects.list().subjects.map(({ id, status }) => [id, status])).toEqual([
      [subject.id, 'active'],
      [chemistry.id, 'maintenance'],
    ]);
  });

  it('«Hacer activa» no se deshace si después se activó otra', () => {
    const { workspace, recent, undo } = withSubject();
    const chemistry = workspace.subjects.create({ name: 'Química orgánica', makeActive: false });
    const history = workspace.subjects.create({ name: 'Historia argentina', makeActive: false });
    workspace.subjects.activate({ subjectId: chemistry.id });
    const [first] = recent();
    workspace.subjects.activate({ subjectId: history.id });
    expect(recent().find((item) => item.id === first?.id)?.canUndo).toBe(false);
    expect(undo(first?.id)).toEqual({ undone: false });
  });
});

describe('lo que no se puede deshacer', () => {
  it('lo eliminado para siempre no se deshace y su renglón ya no tiene nombre', () => {
    const { workspace, subject, recent, undo } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.remove({ noteId: note.id });
    workspace.trash.empty();

    const items = recent().filter((item) => item.kind.startsWith('note.'));

    expect(kinds(items)).toEqual(['note.purge', 'note.delete', 'note.create']);
    expect(items.every((item) => item.canUndo === false)).toBe(true);
    expect(items.every((item) => item.label === null)).toBe(true);
    for (const item of items) {
      expect(undo(item.id)).toEqual({ undone: false });
    }
  });

  it('un borrado vencido en la Papelera no ofrece «Deshacer», aunque todavía no se haya vaciado', () => {
    let days = 0;
    const { workspace, subject, recent, undo } = withSubject({
      clock: { now: () => demoClock(days).now() },
    });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.remove({ noteId: note.id });
    days = 35;
    const [removal] = recent();
    expect(removal).toMatchObject({ kind: 'note.delete', canUndo: false });
    expect(undo(removal?.id)).toEqual({ undone: false });
  });

  it('un identificador que no existe no se deshace', () => {
    const { undo } = withSubject();
    expect(undo('01969f1e-0000-7000-8000-000000000001')).toEqual({ undone: false });
  });

  it('lo de las tarjetas sigue como antes: editar y deshacer', () => {
    const { workspace, recent, undo } = withSubject();
    const card = workspace.cards.create({ question: 'A', answer: 'r' });
    workspace.cards.edit({ cardId: card.id, question: 'B', answer: 'r' });
    undo(recent()[0]?.id);
    expect(workspace.cards.list()[0]?.question).toBe('A');
  });
});
