import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/data/ids';
import { readRows, runRaw } from '../apoyo/base-cruda';
import { closeSpaces, line, openSpace } from '../apoyo/espacio';

// Los renglones se versionan (docs/modelo-de-datos.md, regla 3): editar agrega una versión nueva,
// la vieja queda igual, y una versión no se modifica ni se borra (disparadores de la base).

afterEach(closeSpaces);

function withNote() {
  const space = openSpace();
  const subject = space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const note = space.workspace.notes.create({ subjectId: subject.id, topicId: null });
  const first = note.blocks[0]?.id ?? '';
  const versions = (blockId = first) =>
    readRows(
      space.file,
      'SELECT id, text_plain, cause FROM block_versions WHERE block_id = ? ORDER BY id',
      blockId,
    );
  const save = (title: string, blocks: ReturnType<typeof line>[]) =>
    space.workspace.notes.save({ noteId: note.id, title, blocks });
  return { ...space, note, first, versions, save };
}

describe('versiones inmutables de los renglones', () => {
  it('un renglón nuevo nace con una versión', () => {
    const { versions } = withNote();
    expect(versions()).toEqual([{ id: expect.any(String), text_plain: '', cause: 'edit' }]);
  });

  it('cada cambio de texto agrega una versión nueva y la vieja queda igual', () => {
    const { versions, save, first } = withNote();
    const original = versions();

    save('', [line('uno', { id: first })]);
    save('', [line('uno y dos', { id: first })]);

    const all = versions();
    expect(all.map((row) => row.text_plain)).toEqual(['', 'uno', 'uno y dos']);
    expect(all.map((row) => row.cause)).toEqual(['edit', 'edit', 'edit']);
    expect(all[0]).toEqual(original[0]);
  });

  it('el renglón apunta a su versión más nueva', () => {
    const { file, save, first, versions } = withNote();
    save('', [line('uno', { id: first })]);
    save('', [line('dos', { id: first })]);
    const newest = versions().at(-1);
    expect(readRows(file, 'SELECT current_version_id FROM blocks WHERE id = ?', first)).toEqual([
      { current_version_id: newest?.id },
    ]);
  });

  it('guardar lo mismo dos veces no crea versiones', () => {
    const { versions, save, first } = withNote();
    save('Título', [line('uno', { id: first })]);
    const before = versions();
    save('Título', [line('uno', { id: first })]);
    save('Título', [line('uno', { id: first })]);
    expect(versions()).toEqual(before);
  });

  it('mover, anidar o plegar un renglón no crea una versión', () => {
    const { versions, save, first } = withNote();
    const second = newId();
    save('', [line('uno', { id: first }), line('dos', { id: second })]);
    const before = [versions(first), versions(second)];

    save('', [line('uno', { id: first }), line('dos', { id: second, parentId: first })]);
    save('', [
      line('uno', { id: first, collapsed: true }),
      line('dos', { id: second, parentId: first }),
    ]);
    save('', [line('dos', { id: second }), line('uno', { id: first })]);

    expect([versions(first), versions(second)]).toEqual(before);
  });

  it('cambiar solo el título no crea versiones de renglones', () => {
    const { versions, save, first } = withNote();
    save('A', [line('uno', { id: first })]);
    const before = versions();
    save('B', [line('uno', { id: first })]);
    expect(versions()).toEqual(before);
  });

  it('un renglón borrado conserva sus versiones', () => {
    const { versions, save, first } = withNote();
    const second = newId();
    save('', [line('uno', { id: first }), line('dos', { id: second })]);
    save('', [line('uno', { id: first })]);
    expect(versions(second).map((row) => row.text_plain)).toEqual(['dos']);
  });

  it('una versión no se puede modificar: el UPDATE directo falla y la versión queda como estaba', () => {
    const { file, versions, save, first } = withNote();
    save('', [line('uno', { id: first })]);
    const before = versions();
    expect(() => runRaw(file, "UPDATE block_versions SET text_plain = 'otra cosa'")).toThrow(
      /las versiones no se modifican/,
    );
    expect(() =>
      runRaw(file, "UPDATE block_versions SET content = '[]' WHERE block_id = ?", first),
    ).toThrow();
    expect(versions()).toEqual(before);
  });

  it('una versión no se puede borrar: el DELETE directo falla', () => {
    const { file, versions, save, first } = withNote();
    save('', [line('uno', { id: first })]);
    const before = versions();
    expect(() => runRaw(file, 'DELETE FROM block_versions')).toThrow(
      /las versiones no se borran salvo al vaciar la papelera/,
    );
    expect(versions()).toEqual(before);
  });

  it('solo se borran con el permiso de la purga de ese renglón', () => {
    const { file, versions, first } = withNote();
    runRaw(file, "INSERT INTO purge_permits (entity_type, entity_id) VALUES ('block', ?)", first);
    runRaw(file, 'DELETE FROM block_versions WHERE block_id = ?', first);
    expect(versions()).toEqual([]);
  });

  it('el permiso de otro renglón o de otra clase de cosa no alcanza', () => {
    const { file, versions, first } = withNote();
    runRaw(file, "INSERT INTO purge_permits (entity_type, entity_id) VALUES ('block', 'otro')");
    runRaw(file, "INSERT INTO purge_permits (entity_type, entity_id) VALUES ('card', ?)", first);
    expect(() => runRaw(file, 'DELETE FROM block_versions WHERE block_id = ?', first)).toThrow();
    expect(versions()).toHaveLength(1);
  });
});
