import { afterEach, describe, expect, it } from 'vitest';
import { DuplicateNameError, SubjectNotFoundError } from '../../src/data/organization-errors';
import {
  inboxListResponse,
  subjectSchema,
  subjectsListResponse,
} from '../../src/preload/contract/organization';
import { texts } from '../../src/preload/contract/texts';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// Materias (H-09): una sola activa, «Hacer activa» pasa a la anterior a «En mantenimiento», abrir
// una para mirarla no cambia la activa, y la primera vez es «no hay ninguna materia».

afterEach(closeSpaces);

describe('materias: crear y hacer activa', () => {
  it('[CA-038] crear «Química orgánica» y «Hacer activa»: «Estadística básica» pasa a «En mantenimiento»', () => {
    const { workspace } = openSpace();
    const statistics = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    const chemistry = workspace.subjects.create({ name: 'Química orgánica', makeActive: false });
    expect(workspace.subjects.list().subjects.map(({ name, status }) => [name, status])).toEqual([
      ['Estadística básica', 'active'],
      ['Química orgánica', 'maintenance'],
    ]);

    const { subjects } = workspace.subjects.activate({ subjectId: chemistry.id });

    expect(subjects.map(({ name, status }) => [name, status])).toEqual([
      ['Química orgánica', 'active'],
      ['Estadística básica', 'maintenance'],
    ]);
    expect(workspace.subjects.list()).toEqual({ subjects });
    expect(subjects.find((subject) => subject.id === statistics.id)?.status).toBe('maintenance');
  });

  it('[CA-038] lo que se activó queda al cerrar y abrir Retenia', () => {
    const space = openSpace();
    space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    const chemistry = space.workspace.subjects.create({
      name: 'Química orgánica',
      makeActive: false,
    });
    space.workspace.subjects.activate({ subjectId: chemistry.id });

    const reopened = space.reopen();

    expect(reopened.subjects.list().subjects.map(({ name, status }) => [name, status])).toEqual([
      ['Química orgánica', 'active'],
      ['Estadística básica', 'maintenance'],
    ]);
  });

  it('[CA-038] «Hacer activa» agrega una operación con la materia que estaba activa antes', () => {
    const space = openSpace();
    const statistics = space.workspace.subjects.create({
      name: 'Estadística básica',
      makeActive: true,
    });
    const chemistry = space.workspace.subjects.create({
      name: 'Química orgánica',
      makeActive: false,
    });
    space.workspace.subjects.activate({ subjectId: chemistry.id });

    const rows = readRows(
      space.file,
      "SELECT kind, entity_type, entity_id, source, detail FROM operations WHERE kind = 'subject.activate'",
    );
    expect(rows).toEqual([
      {
        kind: 'subject.activate',
        entity_type: 'subject',
        entity_id: chemistry.id,
        source: 'user',
        detail: JSON.stringify({ previousActiveId: statistics.id }),
      },
    ]);
  });

  it('activar la que ya está activa no cambia nada ni agrega una operación', () => {
    const space = openSpace();
    const statistics = space.workspace.subjects.create({
      name: 'Estadística básica',
      makeActive: true,
    });
    const before = space.workspace.subjects.list();
    expect(space.workspace.subjects.activate({ subjectId: statistics.id })).toEqual(before);
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual([{ n: 0 }]);
  });

  it('activar una materia que no existe es un error y no cambia la activa', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    expect(() =>
      workspace.subjects.activate({ subjectId: '01969f1e-0000-7000-8000-000000000001' }),
    ).toThrow(SubjectNotFoundError);
    expect(workspace.subjects.list().subjects[0]?.status).toBe('active');
  });

  it('una materia nueva desde «Nueva materia» nace en mantenimiento y no genera operación', () => {
    const space = openSpace();
    const created = space.workspace.subjects.create({ name: 'Inglés', makeActive: false });
    expect(created).toMatchObject({ name: 'Inglés', status: 'maintenance', isExample: false });
    expect(subjectSchema.safeParse(created).success).toBe(true);
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual([{ n: 0 }]);
  });

  it('crear una con «makeActive» deja a la activa anterior en mantenimiento', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    const second = workspace.subjects.create({ name: 'Historia argentina', makeActive: true });
    expect(second.status).toBe('active');
    expect(workspace.subjects.list().subjects.map(({ name, status }) => [name, status])).toEqual([
      ['Historia argentina', 'active'],
      ['Estadística básica', 'maintenance'],
    ]);
  });

  it('el nombre se guarda sin los espacios de los bordes', () => {
    const { workspace } = openSpace();
    expect(workspace.subjects.create({ name: '  Inglés  ', makeActive: false }).name).toBe(
      'Inglés',
    );
  });

  it('el nombre de una materia no se repite, sin distinguir mayúsculas ni espacios de más', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    for (const name of ['estadística básica', '  ESTADÍSTICA   básica ']) {
      expect(() => workspace.subjects.create({ name, makeActive: false })).toThrow(
        DuplicateNameError,
      );
    }
    expect(workspace.subjects.count()).toBe(1);
  });

  it('la lista pone primero la activa y después mantenimiento, pausa y archivadas, cada grupo por creación', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Primera', makeActive: false });
    workspace.subjects.create({ name: 'Segunda', makeActive: false });
    workspace.subjects.createExample({ activate: false });
    const third = workspace.subjects.create({ name: 'Tercera', makeActive: false });
    workspace.subjects.activate({ subjectId: third.id });
    expect(workspace.subjects.list().subjects.map(({ name, status }) => [name, status])).toEqual([
      ['Tercera', 'active'],
      ['Primera', 'maintenance'],
      ['Segunda', 'maintenance'],
      [texts.example.subject, 'paused'],
    ]);
  });

  it('la lista pasa el esquema del canal', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    expect(subjectsListResponse.safeParse(workspace.subjects.list()).success).toBe(true);
  });
});

describe('abrir una materia para mirarla', () => {
  it('[CA-039] abrir «Historia argentina» (ver sus temas y sus notas) no cambia la activa ni agrega operaciones', () => {
    const space = openSpace();
    const { workspace } = space;
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    const history = workspace.subjects.create({ name: 'Historia argentina', makeActive: false });
    const independence = workspace.topics.create({ subjectId: history.id, name: 'Independencia' });
    workspace.notes.create({ subjectId: history.id, topicId: independence.id });
    const before = workspace.subjects.list();
    const operations = readRows(space.file, 'SELECT count(*) AS n FROM operations');

    workspace.topics.list({ subjectId: history.id });
    workspace.notes.list({ subjectId: history.id });

    expect(workspace.subjects.list()).toEqual(before);
    expect(workspace.subjects.list().subjects[0]).toMatchObject({
      name: 'Estadística básica',
      status: 'active',
    });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM operations')).toEqual(operations);
  });
});

describe('la primera vez', () => {
  it('[CA-041] sin materias es la primera vez; escribir «Química orgánica» la deja activa y ya no lo es', () => {
    const { workspace } = openSpace();
    expect(workspace.subjects.count()).toBe(0);
    expect(workspace.subjects.list()).toEqual({ subjects: [] });

    const created = workspace.subjects.create({ name: 'Química orgánica', makeActive: true });

    expect(created).toMatchObject({ name: 'Química orgánica', status: 'active', isExample: false });
    expect(workspace.subjects.count()).toBe(1);
    expect(workspace.subjects.list().subjects).toEqual([created]);
  });

  it('[CA-041] la primera vez no hay nada en la Bandeja ni notas: Materiales queda vacío', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    expect(workspace.inbox.list()).toEqual({ items: [], count: 0 });
    expect(inboxListResponse.safeParse(workspace.inbox.list()).success).toBe(true);
  });
});

describe('la materia «Ejemplo»', () => {
  it('[CA-041] «Probar con un ejemplo (3 min)» carga «Ejemplo» con la etiqueta EJEMPLO y la deja activa', () => {
    const { workspace } = openSpace();

    const example = workspace.subjects.createExample();

    expect(example).toEqual({
      id: expect.any(String),
      name: texts.example.subject,
      status: 'active',
      isExample: true,
    });
    expect(texts.example.subject).toBe('Ejemplo');
    expect(workspace.subjects.list().subjects).toEqual([example]);
  });

  it('[CA-041] el ejemplo trae su tema y su nota con los renglones del catálogo, con su sangría', () => {
    const { workspace } = openSpace();
    const example = workspace.subjects.createExample();

    const { topics } = workspace.topics.list({ subjectId: example.id });
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ name: texts.example.topic, archived: false, noteCount: 1 });

    const { notes } = workspace.notes.list({ subjectId: example.id });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: texts.example.note, topicId: topics[0]?.id });
    const note = workspace.notes.get({ noteId: notes[0]?.id ?? '' });

    expect(
      note.blocks.map((block) => ({
        text: block.content.map((node) => (node.type === 'text' ? node.text : '')).join(''),
        nested: block.parentId !== null,
      })),
    ).toEqual(
      texts.example.blocks.map((block) => ({ text: block.text, nested: block.depth === 1 })),
    );
    // Cada hijo cuelga del renglón de profundidad 0 que lo precede.
    const ids = note.blocks.map((block) => block.id);
    texts.example.blocks.forEach((block, index) => {
      if (block.depth === 1) {
        expect(note.blocks[index]?.parentId).toBe(ids[index - 1]);
      }
    });
  });

  it('es idempotente: pedirlo otra vez no crea otra materia ni otra nota', () => {
    const { workspace } = openSpace();
    const first = workspace.subjects.createExample();
    const second = workspace.subjects.createExample();
    expect(second).toEqual(first);
    expect(workspace.subjects.count()).toBe(1);
    expect(workspace.notes.list({ subjectId: first.id }).notes).toHaveLength(1);
    expect(workspace.topics.list({ subjectId: first.id }).topics).toHaveLength(1);
  });

  it('con «activate: false» queda en pausa, y pedirlo activo después la activa sin duplicarla', () => {
    const { workspace } = openSpace();
    const paused = workspace.subjects.createExample({ activate: false });
    expect(paused.status).toBe('paused');
    const active = workspace.subjects.createExample();
    expect(active).toEqual({ ...paused, status: 'active' });
    expect(workspace.subjects.count()).toBe(1);
  });

  it('al activarla, la que estaba activa pasa a mantenimiento', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    workspace.subjects.createExample();
    expect(workspace.subjects.list().subjects.map(({ name, status }) => [name, status])).toEqual([
      [texts.example.subject, 'active'],
      ['Estadística básica', 'maintenance'],
    ]);
  });

  it('con «activate: false» no toca la materia activa', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    workspace.subjects.createExample({ activate: false });
    expect(workspace.subjects.list().subjects[0]).toMatchObject({
      name: 'Estadística básica',
      status: 'active',
    });
  });

  it('lo que crea el ejemplo no aparece en «Actividad reciente»', () => {
    const { workspace } = openSpace();
    workspace.subjects.createExample();
    expect(workspace.activity.recent()).toEqual([]);
  });

  it('con la fuente «demo» sus operaciones quedan anotadas como de la demostración', () => {
    const space = openSpace();
    space.workspace.subjects.createExample({ activate: false }, { source: 'demo' });
    expect(
      readRows(space.file, 'SELECT DISTINCT kind, source FROM operations ORDER BY kind'),
    ).toEqual([
      { kind: 'note.create', source: 'demo' },
      { kind: 'topic.create', source: 'demo' },
    ]);
  });

  it('la nota del ejemplo se puede abrir al cerrar y abrir Retenia', () => {
    const space = openSpace();
    const example = space.workspace.subjects.createExample();
    const reopened = space.reopen();
    const [note] = reopened.notes.list({ subjectId: example.id }).notes;
    expect(reopened.notes.get({ noteId: note?.id ?? '' }).blocks).toHaveLength(
      texts.example.blocks.length,
    );
  });
});
