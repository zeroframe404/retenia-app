import { afterEach, describe, expect, it } from 'vitest';
import {
  DuplicateNameError,
  SubjectNotFoundError,
  TopicNotFoundError,
} from '../../src/data/organization-errors';
import { topicSchema, topicsListResponse } from '../../src/preload/contract/organization';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// Temas de una materia (H-09): se crean, se renombran guardando el nombre viejo en «Otros nombres»,
// se archivan y se eliminan (a la Papelera). Los nombres no se repiten dentro de la materia.

afterEach(closeSpaces);

function withSubject() {
  const space = openSpace();
  const subject = space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  return { ...space, subject };
}

describe('crear un tema', () => {
  it('[CA-040] crear el tema «Regresión» lo deja en la lista de la materia, vacío y sin otros nombres', () => {
    const { workspace, subject } = withSubject();

    const created = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });

    expect(created).toEqual({
      id: expect.any(String),
      subjectId: subject.id,
      name: 'Regresión',
      archived: false,
      aliases: [],
      noteCount: 0,
    });
    expect(topicSchema.safeParse(created).success).toBe(true);
    expect(workspace.topics.list({ subjectId: subject.id })).toEqual({ topics: [created] });
  });

  it('los temas salen en el orden en que se crearon', () => {
    const { workspace, subject } = withSubject();
    for (const name of ['Media y dispersión', 'Intervalos de confianza', 'Pruebas de hipótesis']) {
      workspace.topics.create({ subjectId: subject.id, name });
    }
    expect(
      workspace.topics.list({ subjectId: subject.id }).topics.map((topic) => topic.name),
    ).toEqual(['Media y dispersión', 'Intervalos de confianza', 'Pruebas de hipótesis']);
  });

  it('cada materia tiene sus temas', () => {
    const { workspace, subject } = withSubject();
    const history = workspace.subjects.create({ name: 'Historia argentina', makeActive: false });
    workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.create({ subjectId: history.id, name: 'Independencia' });
    expect(
      workspace.topics.list({ subjectId: history.id }).topics.map((topic) => topic.name),
    ).toEqual(['Independencia']);
  });

  it('el alta agrega una operación «topic.create» del usuario', () => {
    const space = withSubject();
    const created = space.workspace.topics.create({
      subjectId: space.subject.id,
      name: 'Regresión',
    });
    expect(
      readRows(space.file, 'SELECT kind, entity_type, entity_id, source FROM operations'),
    ).toEqual([
      { kind: 'topic.create', entity_type: 'topic', entity_id: created.id, source: 'user' },
    ]);
  });

  it('el tema se guarda sin los espacios de los bordes y sigue ahí al cerrar y abrir', () => {
    const space = withSubject();
    space.workspace.topics.create({ subjectId: space.subject.id, name: '  Regresión ' });
    const reopened = space.reopen();
    expect(reopened.topics.list({ subjectId: space.subject.id }).topics.map((t) => t.name)).toEqual(
      ['Regresión'],
    );
  });

  it('el nombre de un tema no se repite dentro de la materia, sin distinguir mayúsculas ni espacios de más', () => {
    const { workspace, subject } = withSubject();
    workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    for (const name of ['regresión', ' REGRESIÓN ', 'Regresión']) {
      expect(() => workspace.topics.create({ subjectId: subject.id, name })).toThrow(
        DuplicateNameError,
      );
    }
    expect(workspace.topics.list({ subjectId: subject.id }).topics).toHaveLength(1);
  });

  it('un tema archivado sigue ocupando su nombre', () => {
    const { workspace, subject } = withSubject();
    const created = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.archive({ topicId: created.id });
    expect(() => workspace.topics.create({ subjectId: subject.id, name: 'Regresión' })).toThrow(
      DuplicateNameError,
    );
  });

  it('el mismo nombre en otra materia sí se puede', () => {
    const { workspace, subject } = withSubject();
    const other = workspace.subjects.create({ name: 'Física', makeActive: false });
    workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    expect(workspace.topics.create({ subjectId: other.id, name: 'Regresión' }).name).toBe(
      'Regresión',
    );
  });

  it('una materia que no existe es un error', () => {
    const { workspace } = withSubject();
    expect(() =>
      workspace.topics.create({
        subjectId: '01969f1e-0000-7000-8000-000000000001',
        name: 'Regresión',
      }),
    ).toThrow(SubjectNotFoundError);
  });

  it('la lista pasa el esquema del canal', () => {
    const { workspace, subject } = withSubject();
    workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    expect(
      topicsListResponse.safeParse(workspace.topics.list({ subjectId: subject.id })).success,
    ).toBe(true);
  });
});

describe('renombrar un tema: «Otros nombres»', () => {
  it('[CA-044] renombrar «Regresión» a «Regresión lineal» deja «Regresión» en «Otros nombres»', () => {
    const { workspace, subject } = withSubject();
    const created = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });

    const renamed = workspace.topics.rename({ topicId: created.id, name: 'Regresión lineal' });

    expect(renamed).toMatchObject({
      id: created.id,
      name: 'Regresión lineal',
      aliases: ['Regresión'],
    });
    expect(workspace.topics.list({ subjectId: subject.id }).topics).toEqual([renamed]);
  });

  it('[CA-044] los otros nombres siguen al cerrar y abrir y se suman en el orden en que se agregaron', () => {
    const space = withSubject();
    const created = space.workspace.topics.create({
      subjectId: space.subject.id,
      name: 'Regresión',
    });
    space.workspace.topics.rename({ topicId: created.id, name: 'Regresión lineal' });
    space.workspace.topics.rename({ topicId: created.id, name: 'Modelos lineales' });

    const reopened = space.reopen();

    expect(reopened.topics.list({ subjectId: space.subject.id }).topics[0]).toMatchObject({
      name: 'Modelos lineales',
      aliases: ['Regresión', 'Regresión lineal'],
    });
  });

  it('volver a un nombre de antes lo saca de «Otros nombres» y manda el actual ahí', () => {
    const { workspace, subject } = withSubject();
    const created = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.rename({ topicId: created.id, name: 'Regresión lineal' });
    expect(workspace.topics.rename({ topicId: created.id, name: 'Regresión' })).toMatchObject({
      name: 'Regresión',
      aliases: ['Regresión lineal'],
    });
  });

  it('renombrar con el mismo nombre exacto no cambia nada ni agrega una operación', () => {
    const space = withSubject();
    const created = space.workspace.topics.create({
      subjectId: space.subject.id,
      name: 'Regresión',
    });
    const before = readRows(space.file, 'SELECT count(*) AS n FROM operations');
    expect(space.workspace.topics.rename({ topicId: created.id, name: 'Regresión' })).toEqual(
      created,
    );
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual(before);
  });

  it('no deja renombrar a un nombre que usa otro tema de la materia', () => {
    const { workspace, subject } = withSubject();
    const first = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    workspace.topics.create({ subjectId: subject.id, name: 'Correlación' });
    expect(() => workspace.topics.rename({ topicId: first.id, name: 'correlación' })).toThrow(
      DuplicateNameError,
    );
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.name).toBe('Regresión');
  });

  it('la operación «topic.rename» guarda el nombre de antes y el de después', () => {
    const space = withSubject();
    const created = space.workspace.topics.create({
      subjectId: space.subject.id,
      name: 'Regresión',
    });
    space.workspace.topics.rename({ topicId: created.id, name: 'Regresión lineal' });
    expect(
      readRows(space.file, "SELECT source, detail FROM operations WHERE kind = 'topic.rename'"),
    ).toEqual([
      {
        source: 'user',
        detail: JSON.stringify({ before: 'Regresión', after: 'Regresión lineal' }),
      },
    ]);
  });

  it('un tema que no existe es un error', () => {
    const { workspace } = withSubject();
    expect(() =>
      workspace.topics.rename({ topicId: '01969f1e-0000-7000-8000-000000000001', name: 'X' }),
    ).toThrow(TopicNotFoundError);
  });
});

describe('archivar un tema', () => {
  it('archivar saca el tema de la lista de temas (queda marcado) y sus notas siguen donde estaban', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });

    const archived = workspace.topics.archive({ topicId: topic.id });

    expect(archived).toMatchObject({ id: topic.id, archived: true, noteCount: 1 });
    expect(workspace.topics.list({ subjectId: subject.id }).topics).toEqual([archived]);
    expect(workspace.notes.list({ subjectId: subject.id }).notes[0]).toMatchObject({
      id: note.id,
      topicId: topic.id,
      archived: false,
    });
  });

  it('desarchivar lo devuelve y cada cambio deja su operación', () => {
    const space = withSubject();
    const topic = space.workspace.topics.create({ subjectId: space.subject.id, name: 'Regresión' });
    space.workspace.topics.archive({ topicId: topic.id });
    const restored = space.workspace.topics.unarchive({ topicId: topic.id });
    expect(restored.archived).toBe(false);
    expect(readRows(space.file, 'SELECT kind FROM operations ORDER BY seq')).toEqual([
      { kind: 'topic.create' },
      { kind: 'topic.archive' },
      { kind: 'topic.unarchive' },
    ]);
  });

  it('archivar uno ya archivado no cambia nada ni agrega una operación', () => {
    const space = withSubject();
    const topic = space.workspace.topics.create({ subjectId: space.subject.id, name: 'Regresión' });
    space.workspace.topics.archive({ topicId: topic.id });
    const before = readRows(space.file, 'SELECT count(*) AS n FROM operations');
    expect(space.workspace.topics.archive({ topicId: topic.id }).archived).toBe(true);
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual(before);
  });
});

describe('cuántas notas tiene un tema', () => {
  it('cuenta las notas que no están archivadas ni en la Papelera', () => {
    const { workspace, subject } = withSubject();
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
    const kept = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    const archived = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    const removed = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    workspace.notes.create({ subjectId: subject.id, topicId: null });
    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.noteCount).toBe(3);

    workspace.notes.archive({ noteId: archived.id });
    workspace.notes.remove({ noteId: removed.id });

    expect(workspace.topics.list({ subjectId: subject.id }).topics[0]?.noteCount).toBe(1);
    expect(kept.id).not.toBe(archived.id);
  });
});
