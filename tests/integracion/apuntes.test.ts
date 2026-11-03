import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/data/ids';
import {
  ImageNotFoundError,
  NoteNotFoundError,
  TopicNotFoundError,
} from '../../src/data/organization-errors';
import {
  noteSchema,
  noteSummarySchema,
  notesMentionsResponse,
  notesTitlesResponse,
} from '../../src/preload/contract/notes';
import { texts } from '../../src/preload/contract/texts';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, line, openSpace } from '../apoyo/espacio';

// Notas (H-10): renglones con sangría, guardado, archivar, mover entre temas, enlaces «[[» y
// «Mencionada en».

afterEach(closeSpaces);

function withSubject() {
  const space = openSpace();
  const subject = space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  // El mismo objeto (no una copia): `reopen` le cambia el espacio de trabajo.
  return Object.assign(space, { subject });
}

const textOf = (block: { content: readonly { type: string; text?: string }[] }) =>
  block.content.map((node) => node.text ?? '').join('');

describe('crear una nota', () => {
  it('nace sin título, con un renglón vacío, en el tema que se elige', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });

    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });

    expect(note).toEqual({
      id: expect.any(String),
      subjectId: subject.id,
      topicId: topic.id,
      title: '',
      archived: false,
      blocks: [{ id: expect.any(String), parentId: null, collapsed: false, content: [] }],
    });
    expect(noteSchema.safeParse(note).success).toBe(true);
    expect(workspace.notes.get({ noteId: note.id })).toEqual(note);
  });

  it('el alta agrega una operación «note.create» del usuario', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    expect(
      readRows(space.file, 'SELECT kind, entity_type, entity_id, source FROM operations'),
    ).toEqual([{ kind: 'note.create', entity_type: 'note', entity_id: note.id, source: 'user' }]);
  });

  it('el tema tiene que ser de esa materia y no estar eliminado', () => {
    const { workspace, subject } = withSubject();
    const other = workspace.subjects.create({ name: 'Física', makeActive: false });
    const foreign = workspace.topics.create({ subjectId: other.id, name: 'Ondas' });
    const removed = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.remove({ topicId: removed.id });
    for (const topicId of [foreign.id, removed.id, '01969f1e-0000-7000-8000-000000000001']) {
      expect(() => workspace.notes.create({ subjectId: subject.id, topicId })).toThrow(
        TopicNotFoundError,
      );
    }
    expect(workspace.notes.list({ subjectId: subject.id }).notes).toEqual([]);
  });
});

describe('«Sin tema» y «Mover a…»', () => {
  it('[CA-040] una nota sin tema aparece en «Sin tema» y «Mover a…» la pasa al tema «Regresión»', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(workspace.notes.list({ subjectId: subject.id }).notes).toEqual([
      { id: note.id, subjectId: subject.id, topicId: null, title: '', archived: false },
    ]);
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.noteCount).toBe(0);

    const moved = workspace.notes.move({ noteId: note.id, topicId: topic.id });

    expect(moved).toEqual({
      id: note.id,
      subjectId: subject.id,
      topicId: topic.id,
      title: '',
      archived: false,
    });
    expect(noteSummarySchema.safeParse(moved).success).toBe(true);
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.topicId).toBe(topic.id);
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.noteCount).toBe(1);
  });

  it('[CA-040] «Sin tema» también es un destino: la nota vuelve a quedar sin tema', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    expect(workspace.notes.move({ noteId: note.id, topicId: null }).topicId).toBeNull();
  });

  it('[CA-040] lo movido sigue al cerrar y abrir Retenia', () => {
    const space = withSubject();
    const topic = space.workspace.topics.create({ subjectId: space.subject.id, name: 'Regresión' });
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    space.workspace.notes.move({ noteId: note.id, topicId: topic.id });
    const reopened = space.reopen();
    expect(reopened.notes.list({ subjectId: space.subject.id }).notes[0]?.topicId).toBe(topic.id);
  });

  it('mover guarda de qué tema a qué tema en la operación', () => {
    const space = withSubject();
    const topic = space.workspace.topics.create({ subjectId: space.subject.id, name: 'Regresión' });
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    space.workspace.notes.move({ noteId: note.id, topicId: topic.id });
    expect(
      readRows(space.file, "SELECT source, detail FROM operations WHERE kind = 'note.move'"),
    ).toEqual([{ source: 'user', detail: JSON.stringify({ from: null, to: topic.id }) }]);
  });

  it('mover al lugar donde ya está no cambia nada ni agrega una operación', () => {
    const space = withSubject();
    const topic = space.workspace.topics.create({ subjectId: space.subject.id, name: 'Regresión' });
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: topic.id });
    const before = readRows(space.file, 'SELECT count(*) AS n FROM operations');
    space.workspace.notes.move({ noteId: note.id, topicId: topic.id });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual(before);
  });

  it('solo se mueve a un tema de la misma materia que no esté eliminado', () => {
    const { workspace, subject } = withSubject();
    const other = workspace.subjects.create({ name: 'Física', makeActive: false });
    const foreign = workspace.topics.create({ subjectId: other.id, name: 'Ondas' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(() => workspace.notes.move({ noteId: note.id, topicId: foreign.id })).toThrow(
      TopicNotFoundError,
    );
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.topicId).toBeNull();
  });

  it('una nota de un tema eliminado aparece en «Sin tema» y vuelve al tema si se restaura', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    const { trashEntryId } = workspace.topics.remove({ topicId: topic.id });
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]).toMatchObject({
      id: note.id,
      topicId: null,
    });
    expect(workspace.notes.get({ noteId: note.id }).topicId).toBeNull();

    workspace.trash.restore({ entryId: trashEntryId });

    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]?.topicId).toBe(topic.id);
  });

  it('la lista pone primero la nota más nueva', () => {
    const { workspace, subject } = withSubject();
    const first = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const second = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const third = workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(workspace.notes.list({ subjectId: subject.id }).notes.map((note) => note.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
  });
});

describe('escribir y guardar', () => {
  it('[CA-043] guardar y volver a abrir el espacio de trabajo devuelve el texto', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    const first = note.blocks[0]?.id ?? '';
    const second = newId();
    space.workspace.notes.save({
      noteId: note.id,
      title: 'Intervalos de confianza',
      blocks: [
        line('El 95 % habla del procedimiento.', { id: first }),
        line('Ñandú, café y 🙂', { id: second }),
      ],
    });

    const reopened = space.reopen();
    const saved = reopened.notes.get({ noteId: note.id });

    expect(saved.title).toBe('Intervalos de confianza');
    expect(saved.blocks.map(textOf)).toEqual([
      'El 95 % habla del procedimiento.',
      'Ñandú, café y 🙂',
    ]);
    expect(saved.blocks.map((block) => block.id)).toEqual([first, second]);
    expect(reopened.notes.list({ subjectId: space.subject.id }).notes[0]?.title).toBe(
      'Intervalos de confianza',
    );
  });

  it('guarda el título sin los espacios de los bordes', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: '  Media y desvío  ',
      blocks: [line('', { id: note.blocks[0]?.id })],
    });
    expect(workspace.notes.get({ noteId: note.id }).title).toBe('Media y desvío');
  });

  it('[CA-042] Tab mete el renglón adentro del anterior y Mayús+Tab lo saca, y queda guardado', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    const a = note.blocks[0]?.id ?? '';
    const b = newId();
    const c = newId();
    const save = (blocks: ReturnType<typeof line>[]) =>
      space.workspace.notes.save({ noteId: note.id, title: '', blocks });

    save([line('uno', { id: a }), line('dos', { id: b }), line('tres', { id: c })]);
    // Tab sobre «dos»: pasa a ser hijo de «uno».
    save([line('uno', { id: a }), line('dos', { id: b, parentId: a }), line('tres', { id: c })]);
    let saved = space.reopen().notes.get({ noteId: note.id });
    expect(saved.blocks.map((block) => [textOf(block), block.parentId])).toEqual([
      ['uno', null],
      ['dos', a],
      ['tres', null],
    ]);

    // Mayús+Tab sobre «dos»: vuelve a la raíz, después de «uno».
    save([line('uno', { id: a }), line('dos', { id: b }), line('tres', { id: c })]);
    saved = space.reopen().notes.get({ noteId: note.id });
    expect(saved.blocks.map((block) => [textOf(block), block.parentId])).toEqual([
      ['uno', null],
      ['dos', null],
      ['tres', null],
    ]);
  });

  it('[CA-042] los renglones se leen en orden de lectura: el padre y después sus hijos', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const a = note.blocks[0]?.id ?? '';
    const [b, c, d] = [newId(), newId(), newId()];
    workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [
        line('a', { id: a }),
        line('a1', { id: b, parentId: a }),
        line('a1x', { id: c, parentId: b }),
        line('a2', { id: d, parentId: a }),
        line('z'),
      ],
    });
    expect(workspace.notes.get({ noteId: note.id }).blocks.map(textOf)).toEqual([
      'a',
      'a1',
      'a1x',
      'a2',
      'z',
    ]);
  });

  it('[CA-042] subir y bajar un renglón cambia el orden y se guarda', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    const a = note.blocks[0]?.id ?? '';
    const b = newId();
    space.workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [line('uno', { id: a }), line('dos', { id: b })],
    });
    space.workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [line('dos', { id: b }), line('uno', { id: a })],
    });
    expect(space.reopen().notes.get({ noteId: note.id }).blocks.map(textOf)).toEqual([
      'dos',
      'uno',
    ]);
  });

  it('[CA-042] el renglón plegado sigue plegado al cerrar y abrir', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    const a = note.blocks[0]?.id ?? '';
    const b = newId();
    space.workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [line('uno', { id: a, collapsed: true }), line('dos', { id: b, parentId: a })],
    });
    const saved = space.reopen().notes.get({ noteId: note.id });
    expect(saved.blocks.map((block) => block.collapsed)).toEqual([true, false]);
  });

  it('un renglón que ya no está deja de aparecer, pero queda guardado (borrado lógico)', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    const a = note.blocks[0]?.id ?? '';
    const b = newId();
    space.workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [line('uno', { id: a }), line('dos', { id: b })],
    });
    space.workspace.notes.save({ noteId: note.id, title: '', blocks: [line('uno', { id: a })] });
    expect(space.workspace.notes.get({ noteId: note.id }).blocks.map(textOf)).toEqual(['uno']);
    const stored = readRows(
      space.file,
      'SELECT b.id, b.deleted_at, v.text_plain FROM blocks b JOIN block_versions v ON v.id = b.current_version_id WHERE b.id = ?',
      b,
    );
    expect(stored).toEqual([{ id: b, deleted_at: expect.any(String), text_plain: 'dos' }]);
  });

  it('un renglón borrado que vuelve a aparecer (con el mismo identificador) se ve de nuevo', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const a = note.blocks[0]?.id ?? '';
    const b = newId();
    const both = [line('uno', { id: a }), line('dos', { id: b })];
    workspace.notes.save({ noteId: note.id, title: '', blocks: both });
    workspace.notes.save({ noteId: note.id, title: '', blocks: [line('uno', { id: a })] });
    workspace.notes.save({ noteId: note.id, title: '', blocks: both });
    expect(workspace.notes.get({ noteId: note.id }).blocks.map(textOf)).toEqual(['uno', 'dos']);
  });

  it('guardar en una nota eliminada o que no existe es un error', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.remove({ noteId: note.id });
    expect(() =>
      workspace.notes.save({
        noteId: note.id,
        title: 'x',
        blocks: [line('', { id: note.blocks[0]?.id })],
      }),
    ).toThrow(NoteNotFoundError);
    expect(() => workspace.notes.get({ noteId: note.id })).toThrow(NoteNotFoundError);
    expect(() => workspace.notes.get({ noteId: '01969f1e-0000-7000-8000-000000000001' })).toThrow(
      NoteNotFoundError,
    );
  });

  it('un renglón que pertenece a otra nota no se puede guardar en esta, y no se guarda nada', () => {
    const { workspace, subject } = withSubject();
    const first = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const second = workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(() =>
      workspace.notes.save({
        noteId: second.id,
        title: 'Cambiado',
        blocks: [line('robado', { id: first.blocks[0]?.id })],
      }),
    ).toThrow();
    expect(workspace.notes.get({ noteId: first.id }).blocks.map(textOf)).toEqual(['']);
    expect(workspace.notes.get({ noteId: second.id }).title).toBe('');
  });

  it('una imagen cuya huella no está guardada es un error y no se guarda nada', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(() =>
      workspace.notes.save({
        noteId: note.id,
        title: 'Con imagen',
        blocks: [
          {
            id: note.blocks[0]?.id ?? '',
            parentId: null,
            collapsed: false,
            content: [{ type: 'image', sha: 'a'.repeat(64), width: 10, height: 10, alt: 'x' }],
          },
        ],
      }),
    ).toThrow(ImageNotFoundError);
    expect(workspace.notes.get({ noteId: note.id }).title).toBe('');
  });
});

describe('archivar una nota', () => {
  it('[CA-045] archivar una nota la marca como archivada y sigue pudiendo abrirse', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });

    const archived = workspace.notes.archive({ noteId: note.id });

    expect(archived).toMatchObject({ id: note.id, archived: true });
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]).toMatchObject({
      id: note.id,
      archived: true,
    });
    expect(workspace.notes.get({ noteId: note.id }).archived).toBe(true);
  });

  it('[CA-045] desarchivar la devuelve a la lista', () => {
    const { workspace, subject } = withSubject();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.archive({ noteId: note.id });
    expect(workspace.notes.unarchive({ noteId: note.id }).archived).toBe(false);
  });

  it('[CA-045] un archivado sigue al cerrar y abrir y cada cambio deja su operación', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    space.workspace.notes.archive({ noteId: note.id });
    const reopened = space.reopen();
    expect(reopened.notes.list({ subjectId: space.subject.id }).notes[0]?.archived).toBe(true);
    reopened.notes.unarchive({ noteId: note.id });
    expect(readRows(space.file, 'SELECT kind FROM operations ORDER BY seq')).toEqual([
      { kind: 'note.create' },
      { kind: 'note.archive' },
      { kind: 'note.unarchive' },
    ]);
  });

  it('archivar una ya archivada no cambia nada ni agrega una operación', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    space.workspace.notes.archive({ noteId: note.id });
    const before = readRows(space.file, 'SELECT count(*) AS n FROM operations');
    space.workspace.notes.archive({ noteId: note.id });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual(before);
  });
});

describe('eliminar una nota', () => {
  it('«Eliminar» la manda a la Papelera, la saca de la lista y deja la operación «note.delete»', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });

    const { trashEntryId } = space.workspace.notes.remove({ noteId: note.id });

    expect(space.workspace.notes.list({ subjectId: space.subject.id }).notes).toEqual([]);
    expect(
      readRows(
        space.file,
        'SELECT entity_type, entity_id, restored_at FROM trash_entries WHERE id = ?',
        trashEntryId,
      ),
    ).toEqual([{ entity_type: 'note', entity_id: note.id, restored_at: null }]);
    expect(
      readRows(
        space.file,
        "SELECT trash_entry_id, source FROM operations WHERE kind = 'note.delete'",
      ),
    ).toEqual([{ trash_entry_id: trashEntryId, source: 'user' }]);
  });
});

describe('fórmulas', () => {
  it('[CA-373] lo escrito entre $ se guarda tal cual: al volver a entrar se ve el texto original', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    const formula = 'El intervalo para la media: $\\bar{x} \\pm t \\cdot s/\\sqrt{n}$';
    space.workspace.notes.save({
      noteId: note.id,
      title: 'Intervalos',
      blocks: [line(formula, { id: note.blocks[0]?.id })],
    });

    const reopened = space.reopen();

    expect(reopened.notes.get({ noteId: note.id }).blocks.map(textOf)).toEqual([formula]);
  });

  it('[CA-373] el texto de la fórmula queda en el texto plano que usará el buscador', () => {
    const space = withSubject();
    const note = space.workspace.notes.create({ subjectId: space.subject.id, topicId: null });
    space.workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [line('Vale $x^2$ siempre', { id: note.blocks[0]?.id })],
    });
    expect(
      readRows(space.file, 'SELECT text_plain FROM block_versions ORDER BY id DESC LIMIT 1'),
    ).toEqual([{ text_plain: 'Vale $x^2$ siempre' }]);
  });
});

describe('«[[»: elegir la nota de una lista', () => {
  function withNotes() {
    const space = withSubject();
    const { workspace, subject } = space;
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Media y dispersión' });
    const titled = (title: string, topicId: string | null = null) => {
      const note = workspace.notes.create({ subjectId: subject.id, topicId });
      workspace.notes.save({
        noteId: note.id,
        title,
        blocks: [line('', { id: note.blocks[0]?.id })],
      });
      return note;
    };
    return { ...space, topic, titled };
  }

  it('[CA-374] las primeras letras encuentran la nota, sin importar mayúsculas ni tildes', () => {
    const { workspace, topic, titled } = withNotes();
    const media = titled('Media y desvío', topic.id);
    titled('Intervalos de confianza');

    expect(workspace.notes.titles({ query: 'MED' })).toEqual({
      notes: [{ id: media.id, title: 'Media y desvío', topicName: 'Media y dispersión' }],
    });
    expect(workspace.notes.titles({ query: 'desvio' }).notes.map((note) => note.id)).toEqual([
      media.id,
    ]);
    expect(notesTitlesResponse.safeParse(workspace.notes.titles({ query: 'me' })).success).toBe(
      true,
    );
  });

  it('[CA-374] las que empiezan con las letras van antes que las que solo las contienen', () => {
    const { workspace, titled } = withNotes();
    titled('Notas sobre la media');
    titled('Media y desvío');
    titled('La media móvil');
    expect(workspace.notes.titles({ query: 'media' }).notes.map((note) => note.title)).toEqual([
      'Media y desvío',
      'La media móvil',
      'Notas sobre la media',
    ]);
  });

  it('[CA-374] una nota sin tema trae «topicName» nulo', () => {
    const { workspace, titled } = withNotes();
    titled('Suelta');
    expect(workspace.notes.titles({ query: 'sue' }).notes[0]?.topicName).toBeNull();
  });

  it('no ofrece notas archivadas ni eliminadas', () => {
    const { workspace, titled } = withNotes();
    const archived = titled('Media archivada');
    const removed = titled('Media eliminada');
    titled('Media viva');
    workspace.notes.archive({ noteId: archived.id });
    workspace.notes.remove({ noteId: removed.id });
    expect(workspace.notes.titles({ query: 'media' }).notes.map((note) => note.title)).toEqual([
      'Media viva',
    ]);
  });

  it('ofrece notas de todas las materias', () => {
    const { workspace, titled } = withNotes();
    titled('Media y desvío');
    const physics = workspace.subjects.create({ name: 'Física', makeActive: false });
    const note = workspace.notes.create({ subjectId: physics.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: 'Media de la velocidad',
      blocks: [line('', { id: note.blocks[0]?.id })],
    });
    expect(workspace.notes.titles({ query: 'media' }).notes).toHaveLength(2);
  });

  it('con la consulta vacía ofrece las ocho más nuevas, y nunca más de ocho', () => {
    const { workspace, titled } = withNotes();
    for (let index = 1; index <= 10; index++) {
      titled(`Nota ${index}`);
    }
    const { notes } = workspace.notes.titles({ query: '' });
    expect(notes.map((note) => note.title)).toEqual([
      'Nota 10',
      'Nota 9',
      'Nota 8',
      'Nota 7',
      'Nota 6',
      'Nota 5',
      'Nota 4',
      'Nota 3',
    ]);
    expect(workspace.notes.titles({ query: 'nota' }).notes).toHaveLength(8);
  });

  it('[CA-374] elegir una nota deja un enlace que apunta a su identificador y se puede abrir', () => {
    const space = withNotes();
    const { workspace, subject, titled } = space;
    const target = titled('Media y desvío');
    const source = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: source.id,
      title: 'Intervalos',
      blocks: [
        {
          id: source.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [
            { type: 'text', text: 'Ver también ' },
            { type: 'mention', id: target.id, label: 'Media y desvío' },
          ],
        },
      ],
    });

    const reopened = space.reopen();
    const [block] = reopened.notes.get({ noteId: source.id }).blocks;
    expect(block?.content).toEqual([
      { type: 'text', text: 'Ver también ' },
      { type: 'mention', id: target.id, label: 'Media y desvío' },
    ]);
    // Un clic en el enlace abre la nota a la que apunta.
    expect(reopened.notes.get({ noteId: target.id }).title).toBe('Media y desvío');
    expect(readRows(space.file, 'SELECT block_id, target_note_id FROM block_links')).toEqual([
      { block_id: block?.id, target_note_id: target.id },
    ]);
  });
});

describe('«Mencionada en»', () => {
  function linked() {
    const space = withSubject();
    const { workspace, subject } = space;
    const make = (title: string) => {
      const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
      workspace.notes.save({
        noteId: note.id,
        title,
        blocks: [line('', { id: note.blocks[0]?.id })],
      });
      return note;
    };
    const target = make('Media y desvío');
    const link = (note: { id: string }, rows: { id: string; text: string; links?: boolean }[]) =>
      workspace.notes.save({
        noteId: note.id,
        title: workspace.notes.get({ noteId: note.id }).title,
        blocks: rows.map((row) => ({
          id: row.id,
          parentId: null,
          collapsed: false,
          content: [
            { type: 'text' as const, text: row.text },
            ...(row.links === false
              ? []
              : [{ type: 'mention' as const, id: target.id, label: 'Media y desvío' }]),
          ],
        })),
      });
    return { ...space, make, target, link };
  }

  it('[CA-375] cada renglón que enlaza la nota aparece con el nombre de su nota de origen', () => {
    const { workspace, make, target, link } = linked();
    const intervals = make('Intervalos de confianza');
    const tests = make('Pruebas de hipótesis');
    const rowA = newId();
    const rowB = newId();
    const rowC = newId();
    link(intervals, [
      { id: rowA, text: 'Para ver cómo se usa en un intervalo: ' },
      { id: rowB, text: 'otro renglón sin enlace', links: false },
    ]);
    link(tests, [{ id: rowC, text: 'Antes repasá ' }]);

    const { mentions } = workspace.notes.mentions({ noteId: target.id });

    expect(mentions).toHaveLength(2);
    expect(mentions).toEqual(
      expect.arrayContaining([
        {
          noteId: intervals.id,
          noteTitle: 'Intervalos de confianza',
          blockId: rowA,
          excerpt: 'Para ver cómo se usa en un intervalo: Media y desvío',
        },
        {
          noteId: tests.id,
          noteTitle: 'Pruebas de hipótesis',
          blockId: rowC,
          excerpt: 'Antes repasá Media y desvío',
        },
      ]),
    );
    expect(notesMentionsResponse.safeParse({ mentions }).success).toBe(true);
  });

  it('[CA-375] un renglón que menciona dos veces la nota aparece una sola vez', () => {
    const { workspace, make, target } = linked();
    const source = make('Intervalos de confianza');
    const row = newId();
    workspace.notes.save({
      noteId: source.id,
      title: 'Intervalos de confianza',
      blocks: [
        {
          id: row,
          parentId: null,
          collapsed: false,
          content: [
            { type: 'mention', id: target.id, label: 'Media y desvío' },
            { type: 'text', text: ' y de nuevo ' },
            { type: 'mention', id: target.id, label: 'Media y desvío' },
          ],
        },
      ],
    });
    expect(workspace.notes.mentions({ noteId: target.id }).mentions).toHaveLength(1);
  });

  it('[CA-375] sin menciones la lista está vacía', () => {
    const { workspace, target } = linked();
    expect(workspace.notes.mentions({ noteId: target.id })).toEqual({ mentions: [] });
  });

  it('el fragmento se recorta a 160 caracteres', () => {
    const { workspace, make, target, link } = linked();
    const source = make('Larga');
    link(source, [{ id: newId(), text: 'x'.repeat(400) }]);
    const [mention] = workspace.notes.mentions({ noteId: target.id }).mentions;
    expect(mention?.excerpt).toHaveLength(160);
  });

  it('no aparecen los renglones borrados, ni los de notas eliminadas, ni los que dejaron de enlazar', () => {
    const { workspace, make, target, link } = linked();
    const kept = make('Queda');
    const removed = make('Eliminada');
    const edited = make('Cambiada');
    const dropped = make('Con renglón borrado');
    link(kept, [{ id: newId(), text: 'ahí ' }]);
    link(removed, [{ id: newId(), text: 'ahí ' }]);
    link(edited, [{ id: newId(), text: 'ahí ' }]);
    link(dropped, [{ id: newId(), text: 'ahí ' }]);
    workspace.notes.remove({ noteId: removed.id });
    // La nota «Cambiada» deja el renglón sin el enlace.
    workspace.notes.save({
      noteId: edited.id,
      title: 'Cambiada',
      blocks: [
        line('ya no enlaza', { id: workspace.notes.get({ noteId: edited.id }).blocks[0]?.id }),
      ],
    });
    // La nota «Con renglón borrado» reemplaza su renglón por otro nuevo.
    workspace.notes.save({
      noteId: dropped.id,
      title: 'Con renglón borrado',
      blocks: [line('nuevo')],
    });

    expect(
      workspace.notes.mentions({ noteId: target.id }).mentions.map((m) => m.noteTitle),
    ).toEqual(['Queda']);
  });
});

describe('renombrar una nota enlazada', () => {
  it('[CA-376] los enlaces siguen apuntando y muestran el nombre nuevo', () => {
    const space = withSubject();
    const { workspace, subject } = space;
    const target = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: target.id,
      title: 'Media y desvío',
      blocks: [line('', { id: target.blocks[0]?.id })],
    });
    const source = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: source.id,
      title: 'Intervalos',
      blocks: [
        {
          id: source.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [{ type: 'mention', id: target.id, label: 'Media y desvío' }],
        },
      ],
    });

    workspace.notes.save({
      noteId: target.id,
      title: 'Media y desvío estándar',
      blocks: [line('', { id: target.blocks[0]?.id })],
    });

    const [block] = space.reopen().notes.get({ noteId: source.id }).blocks;
    expect(block?.content).toEqual([
      { type: 'mention', id: target.id, label: 'Media y desvío estándar' },
    ]);
    expect(space.workspace.notes.mentions({ noteId: target.id }).mentions).toHaveLength(1);
  });

  it('[CA-376] una nota enlazada que se queda sin título se muestra como «Sin título»', () => {
    const { workspace, subject } = withSubject();
    const target = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: target.id,
      title: 'Con nombre',
      blocks: [line('', { id: target.blocks[0]?.id })],
    });
    const source = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: source.id,
      title: '',
      blocks: [
        {
          id: source.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [{ type: 'mention', id: target.id, label: 'Con nombre' }],
        },
      ],
    });
    workspace.notes.save({
      noteId: target.id,
      title: '',
      blocks: [line('', { id: target.blocks[0]?.id })],
    });
    expect(workspace.notes.get({ noteId: source.id }).blocks[0]?.content).toEqual([
      { type: 'mention', id: target.id, label: texts.notes.list.untitled },
    ]);
  });

  it('si la nota enlazada ya no existe (eliminada para siempre), queda el nombre guardado', () => {
    const { workspace, subject } = withSubject();
    const target = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: target.id,
      title: 'Se va',
      blocks: [line('', { id: target.blocks[0]?.id })],
    });
    const source = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: source.id,
      title: '',
      blocks: [
        {
          id: source.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [{ type: 'mention', id: target.id, label: 'Se va' }],
        },
      ],
    });
    workspace.notes.remove({ noteId: target.id });
    workspace.trash.empty();
    expect(workspace.notes.get({ noteId: source.id }).blocks[0]?.content).toEqual([
      { type: 'mention', id: target.id, label: 'Se va' },
    ]);
  });
});
