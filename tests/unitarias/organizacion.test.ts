import { describe, expect, it } from 'vitest';
import {
  activateSubject,
  type BlockPlan,
  canonicalJson,
  type IncomingBlock,
  mentionIdsOf,
  type NoteSnapshot,
  type OrganizationOperation,
  planBlocks,
  renameTopic,
  type StoredBlock,
  SUBJECT_STATUSES,
  type SubjectSnapshot,
  sameName,
  type TopicSnapshot,
  type TrashableSnapshot,
  textPlainOf,
  undoOrganizationPlan,
} from '../../src/core/organization';

// Las reglas puras de la organización (Fase 07): materia activa única, nombres, «Otros nombres»,
// renglones y qué se puede deshacer.

describe('estados de una materia', () => {
  it('son cuatro, en este orden: activa, en mantenimiento, en pausa y archivada', () => {
    expect([...SUBJECT_STATUSES]).toEqual(['active', 'maintenance', 'paused', 'archived']);
  });
});

describe('activar una materia', () => {
  const statistics = { id: 'estadistica', status: 'active' as const };
  const history = { id: 'historia', status: 'maintenance' as const };
  const english = { id: 'ingles', status: 'paused' as const };
  const old = { id: 'vieja', status: 'archived' as const };
  const chemistry = { id: 'quimica', status: 'maintenance' as const };

  it('[CA-038] hacer activa «Química orgánica» deja a «Estadística básica» en mantenimiento', () => {
    const result = activateSubject([statistics, chemistry], 'quimica');
    expect(result).toEqual([
      { id: 'estadistica', status: 'maintenance' },
      { id: 'quimica', status: 'active' },
    ]);
  });

  it('las que estaban en pausa o archivadas no se tocan', () => {
    const result = activateSubject([statistics, history, english, old, chemistry], 'quimica');
    expect(result.map((subject) => [subject.id, subject.status])).toEqual([
      ['estadistica', 'maintenance'],
      ['historia', 'maintenance'],
      ['ingles', 'paused'],
      ['vieja', 'archived'],
      ['quimica', 'active'],
    ]);
  });

  it('activar la que ya está activa no cambia nada', () => {
    expect(activateSubject([statistics, history], 'estadistica')).toEqual([statistics, history]);
  });

  it('activar una que estaba en pausa o archivada la deja activa', () => {
    expect(
      activateSubject([statistics, english], 'ingles').map((subject) => subject.status),
    ).toEqual(['maintenance', 'active']);
    expect(activateSubject([statistics, old], 'vieja').map((subject) => subject.status)).toEqual([
      'maintenance',
      'active',
    ]);
  });

  it('nunca queda más de una activa, ni siquiera si venían dos', () => {
    const result = activateSubject(
      [statistics, { id: 'otra', status: 'active' as const }, chemistry],
      'quimica',
    );
    expect(result.filter((subject) => subject.status === 'active').map((s) => s.id)).toEqual([
      'quimica',
    ]);
  });

  it('no cambia la lista que recibe y conserva lo demás de cada materia', () => {
    const subjects = [
      { ...statistics, name: 'Estadística básica' },
      { ...chemistry, name: 'Química orgánica' },
    ];
    const result = activateSubject(subjects, 'quimica');
    expect(subjects[0]?.status).toBe('active');
    expect(result[0]).toEqual({
      id: 'estadistica',
      status: 'maintenance',
      name: 'Estadística básica',
    });
  });

  it('un identificador que no existe es un error', () => {
    expect(() => activateSubject([statistics], 'no-existe')).toThrow();
  });
});

describe('nombres de materias y de temas', () => {
  it('[CA-044] «Regresión» y «  regresión » son el mismo nombre', () => {
    expect(sameName('Regresión', '  regresión ')).toBe(true);
  });

  it('no distingue mayúsculas, espacios de los bordes ni espacios repetidos', () => {
    expect(sameName('Media   y  dispersión', 'media y dispersión')).toBe(true);
    expect(sameName('ÁRBOL', 'árbol')).toBe(true);
    expect(sameName('Intervalos', 'Intervalos de confianza')).toBe(false);
  });

  it('una tilde es una diferencia de verdad, pero la misma letra armada de otra forma no', () => {
    expect(sameName('Regresion', 'Regresión')).toBe(false);
    expect(sameName('Regresio\u0301n', 'Regresión')).toBe(true);
  });
});

describe('renombrar un tema: «Otros nombres»', () => {
  it('[CA-044] el nombre viejo queda en «Otros nombres»', () => {
    expect(renameTopic({ name: 'Regresión', aliases: [] }, 'Regresión lineal')).toEqual({
      name: 'Regresión lineal',
      aliases: ['Regresión'],
    });
  });

  it('cada nombre viejo se suma al final', () => {
    const first = renameTopic({ name: 'A', aliases: [] }, 'B');
    const second = renameTopic(first, 'C');
    expect(second).toEqual({ name: 'C', aliases: ['A', 'B'] });
  });

  it('con el mismo nombre exacto no cambia nada', () => {
    expect(renameTopic({ name: 'A', aliases: ['Z'] }, 'A')).toEqual({ name: 'A', aliases: ['Z'] });
  });

  it('si el nombre nuevo era uno de los otros nombres, ese deja de estar ahí', () => {
    expect(renameTopic({ name: 'B', aliases: ['A'] }, 'A')).toEqual({
      name: 'A',
      aliases: ['B'],
    });
  });

  it('un cambio de mayúsculas cambia el nombre pero no suma un otro nombre repetido', () => {
    expect(renameTopic({ name: 'regresión', aliases: [] }, 'Regresión')).toEqual({
      name: 'Regresión',
      aliases: [],
    });
  });

  it('el nombre viejo no se repite si ya estaba entre los otros nombres', () => {
    expect(renameTopic({ name: 'B', aliases: ['b', 'C'] }, 'D')).toEqual({
      name: 'D',
      aliases: ['b', 'C'],
    });
  });
});

describe('contenido de un renglón', () => {
  const sha = 'a'.repeat(64);
  const note = '01969f1e-0000-7000-8000-000000000001';
  const other = '01969f1e-0000-7000-8000-000000000002';

  it('el texto plano junta los textos, un enlace aporta su nombre y una imagen no aporta nada', () => {
    expect(
      textPlainOf([
        { type: 'text', text: 'Ver también ' },
        { type: 'mention', id: note, label: 'Media y desvío' },
        { type: 'image', sha, width: 320, height: 200, alt: 'Curva normal' },
        { type: 'text', text: ' y $x^2$' },
      ]),
    ).toBe('Ver también Media y desvío y $x^2$');
  });

  it('[CA-373] el texto de una fórmula entre $ queda tal cual en el texto plano', () => {
    expect(textPlainOf([{ type: 'text', text: 'El intervalo: $\\bar{x} \\pm t$' }])).toBe(
      'El intervalo: $\\bar{x} \\pm t$',
    );
  });

  it('un renglón vacío tiene texto plano vacío', () => {
    expect(textPlainOf([])).toBe('');
  });

  it('los enlaces de un renglón, sin repetir y en orden', () => {
    expect(
      mentionIdsOf([
        { type: 'mention', id: other, label: 'B' },
        { type: 'text', text: ' ' },
        { type: 'mention', id: note, label: 'A' },
        { type: 'mention', id: other, label: 'B' },
      ]),
    ).toEqual([other, note]);
    expect(mentionIdsOf([{ type: 'text', text: 'nada' }])).toEqual([]);
  });

  it('el JSON canónico no depende del orden de las claves', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
      canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }),
    );
    expect(canonicalJson([{ type: 'text', text: 'a' }])).not.toBe(
      canonicalJson([{ type: 'text', text: 'b' }]),
    );
  });
});

describe('plan de guardado de los renglones', () => {
  const text = (value: string) => [{ type: 'text' as const, text: value }];
  const incoming = (
    id: string,
    parentId: string | null,
    value: string,
    collapsed = false,
  ): IncomingBlock => ({ id, parentId, collapsed, content: value === '' ? [] : text(value) });
  const stored = (
    id: string,
    parentId: string | null,
    position: number,
    value: string,
    options: { collapsed?: boolean; deleted?: boolean } = {},
  ): StoredBlock => ({
    ...incoming(id, parentId, value, options.collapsed ?? false),
    position,
    deleted: options.deleted ?? false,
  });
  const ids = (blocks: readonly { id: string }[]) => blocks.map((block) => block.id);
  const empty: BlockPlan = {
    created: [],
    revived: [],
    edited: [],
    moved: [],
    folded: [],
    removed: [],
  };

  it('guardar lo mismo no tiene nada para hacer', () => {
    const existing = [
      stored('a', null, 0, 'uno'),
      stored('b', 'a', 0, 'dos'),
      stored('c', null, 1, ''),
    ];
    const plan = planBlocks(existing, [
      incoming('a', null, 'uno'),
      incoming('b', 'a', 'dos'),
      incoming('c', null, ''),
    ]);
    expect(plan).toEqual(empty);
  });

  it('un renglón que no estaba es nuevo y trae su lugar', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno')],
      [incoming('a', null, 'uno'), incoming('b', null, 'dos'), incoming('c', 'b', 'tres')],
    );
    expect(plan.created).toEqual([
      { ...incoming('b', null, 'dos'), position: 1 },
      { ...incoming('c', 'b', 'tres'), position: 0 },
    ]);
    expect({ ...plan, created: [] }).toEqual(empty);
  });

  it('cambiar el texto es una versión nueva y nada más', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', null, 1, 'dos')],
      [incoming('a', null, 'uno cambiado'), incoming('b', null, 'dos')],
    );
    expect(ids(plan.edited)).toEqual(['a']);
    expect({ ...plan, edited: [] }).toEqual(empty);
  });

  it('el orden de las claves del contenido no cuenta como un cambio', () => {
    const existing: StoredBlock[] = [
      {
        id: 'a',
        parentId: null,
        collapsed: false,
        position: 0,
        deleted: false,
        content: [{ text: 'x', type: 'text' } as never],
      },
    ];
    expect(planBlocks(existing, [incoming('a', null, 'x')])).toEqual(empty);
  });

  it('[CA-042] meter un renglón adentro del anterior (Tab) solo cambia su lugar, sin versión', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', null, 1, 'dos')],
      [incoming('a', null, 'uno'), incoming('b', 'a', 'dos')],
    );
    expect(plan.moved).toEqual([{ ...incoming('b', 'a', 'dos'), position: 0 }]);
    expect({ ...plan, moved: [] }).toEqual(empty);
  });

  it('[CA-042] sacar un renglón (Mayús+Tab) lo deja al final de su abuelo y sin versión nueva', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', 'a', 0, 'dos')],
      [incoming('a', null, 'uno'), incoming('b', null, 'dos')],
    );
    expect(plan.moved).toEqual([{ ...incoming('b', null, 'dos'), position: 1 }]);
    expect(plan.edited).toEqual([]);
  });

  it('subir un renglón cambia el lugar de los dos hermanos', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', null, 1, 'dos')],
      [incoming('b', null, 'dos'), incoming('a', null, 'uno')],
    );
    expect(ids(plan.moved).sort()).toEqual(['a', 'b']);
    expect(plan.edited).toEqual([]);
  });

  it('plegar es solo del lugar: no crea versión ni cuenta como mover', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', 'a', 0, 'dos')],
      [incoming('a', null, 'uno', true), incoming('b', 'a', 'dos')],
    );
    expect(plan.folded).toEqual([{ ...incoming('a', null, 'uno', true), position: 0 }]);
    expect({ ...plan, folded: [] }).toEqual(empty);
  });

  it('los renglones que ya no están se marcan como borrados', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', 'a', 0, 'dos'), stored('c', null, 1, 'tres')],
      [incoming('c', null, 'tres')],
    );
    expect(plan.removed.sort()).toEqual(['a', 'b']);
    expect(plan.moved).toEqual([{ ...incoming('c', null, 'tres'), position: 0 }]);
  });

  it('un renglón borrado antes que vuelve a aparecer se revive, con una versión nueva si el texto cambió', () => {
    const existing = [stored('a', null, 0, 'uno'), stored('b', null, 1, 'dos', { deleted: true })];
    const same = planBlocks(existing, [incoming('a', null, 'uno'), incoming('b', null, 'dos')]);
    expect(same.revived).toEqual([{ ...incoming('b', null, 'dos'), position: 1 }]);
    expect(same.edited).toEqual([]);
    expect(same.created).toEqual([]);

    const changed = planBlocks(existing, [incoming('a', null, 'uno'), incoming('b', null, 'otro')]);
    expect(ids(changed.revived)).toEqual(['b']);
    expect(ids(changed.edited)).toEqual(['b']);
  });

  it('un renglón borrado que sigue sin estar no se vuelve a borrar', () => {
    const plan = planBlocks(
      [stored('a', null, 0, 'uno'), stored('b', null, 1, 'dos', { deleted: true })],
      [incoming('a', null, 'uno')],
    );
    expect(plan).toEqual(empty);
  });

  it('[CA-376] un enlace con otro nombre guardado es un cambio de contenido', () => {
    const note = '01969f1e-0000-7000-8000-000000000001';
    const existing: StoredBlock[] = [
      {
        id: 'a',
        parentId: null,
        collapsed: false,
        position: 0,
        deleted: false,
        content: [{ type: 'mention', id: note, label: 'Nombre viejo' }],
      },
    ];
    const plan = planBlocks(existing, [
      {
        id: 'a',
        parentId: null,
        collapsed: false,
        content: [{ type: 'mention', id: note, label: 'Nombre nuevo' }],
      },
    ]);
    expect(ids(plan.edited)).toEqual(['a']);
  });
});

describe('qué se puede deshacer de la organización', () => {
  const alive: TrashableSnapshot = { status: 'active', activeTrashEntryId: null };
  const inTrash = (entry: string | null): TrashableSnapshot => ({
    status: 'trashed',
    activeTrashEntryId: entry,
  });
  const gone: TrashableSnapshot = { status: 'gone', activeTrashEntryId: null };

  const op = (
    kind: OrganizationOperation['kind'],
    extra: Partial<OrganizationOperation> = {},
  ): OrganizationOperation => ({
    kind,
    entityId: 'e1',
    trashEntryId: null,
    detail: null,
    ...extra,
  });

  const note = (extra: Partial<NoteSnapshot> = {}): NoteSnapshot => ({
    entity: 'note',
    ...alive,
    archived: false,
    topicId: null,
    isTopicAvailable: () => true,
    ...extra,
  });
  const topic = (extra: Partial<TopicSnapshot> = {}): TopicSnapshot => ({
    entity: 'topic',
    ...alive,
    archived: false,
    name: 'Regresión',
    isNameUsedByOther: () => false,
    ...extra,
  });
  const subject = (extra: Partial<SubjectSnapshot> = {}): SubjectSnapshot => ({
    entity: 'subject',
    activeSubjectId: 'e1',
    isUsable: () => true,
    ...extra,
  });

  it('un alta o una restauración se deshace mandando a la Papelera, mientras siga en la lista', () => {
    expect(undoOrganizationPlan(op('note.create'), note())).toEqual({ action: 'trash' });
    expect(undoOrganizationPlan(op('note.restore'), note())).toEqual({ action: 'trash' });
    expect(undoOrganizationPlan(op('topic.create'), topic())).toEqual({ action: 'trash' });
    expect(undoOrganizationPlan(op('topic.restore'), topic())).toEqual({ action: 'trash' });
    expect(undoOrganizationPlan(op('inbox.restore'), { entity: 'inbox', ...alive })).toEqual({
      action: 'trash',
    });
  });

  it('un alta ya eliminada o eliminada para siempre no se deshace', () => {
    expect(undoOrganizationPlan(op('note.create'), note(inTrash('t1')))).toBeNull();
    expect(undoOrganizationPlan(op('note.create'), note(gone))).toBeNull();
    expect(undoOrganizationPlan(op('topic.create'), topic(inTrash('t1')))).toBeNull();
    expect(undoOrganizationPlan(op('inbox.restore'), { entity: 'inbox', ...gone })).toBeNull();
  });

  it('un borrado se deshace restaurando de la Papelera mientras la entrada siga vigente', () => {
    const deleted = (kind: 'note.delete' | 'topic.delete' | 'inbox.delete') =>
      op(kind, { trashEntryId: 't1' });
    expect(undoOrganizationPlan(deleted('note.delete'), note(inTrash('t1')))).toEqual({
      action: 'restore-from-trash',
      trashEntryId: 't1',
    });
    expect(undoOrganizationPlan(deleted('topic.delete'), topic(inTrash('t1')))).toEqual({
      action: 'restore-from-trash',
      trashEntryId: 't1',
    });
    expect(
      undoOrganizationPlan(deleted('inbox.delete'), { entity: 'inbox', ...inTrash('t1') }),
    ).toEqual({ action: 'restore-from-trash', trashEntryId: 't1' });
  });

  it('un borrado ya restaurado, vencido o vaciado no se deshace', () => {
    const deleted = op('note.delete', { trashEntryId: 't1' });
    expect(undoOrganizationPlan(deleted, note())).toBeNull();
    expect(undoOrganizationPlan(deleted, note(inTrash(null)))).toBeNull();
    expect(undoOrganizationPlan(deleted, note(inTrash('otra')))).toBeNull();
    expect(undoOrganizationPlan(deleted, note(gone))).toBeNull();
    expect(undoOrganizationPlan(op('note.delete'), note(inTrash('t1')))).toBeNull();
  });

  it('[CA-045] archivar una nota se deshace desarchivándola, y al revés, mientras siga como quedó', () => {
    expect(undoOrganizationPlan(op('note.archive'), note({ archived: true }))).toEqual({
      action: 'unarchive',
    });
    expect(undoOrganizationPlan(op('note.archive'), note({ archived: false }))).toBeNull();
    expect(undoOrganizationPlan(op('note.unarchive'), note({ archived: false }))).toEqual({
      action: 'archive',
    });
    expect(undoOrganizationPlan(op('note.unarchive'), note({ archived: true }))).toBeNull();
    expect(
      undoOrganizationPlan(op('note.archive'), note({ archived: true, ...inTrash('t') })),
    ).toBeNull();
  });

  it('archivar o desarchivar un tema se deshace igual', () => {
    expect(undoOrganizationPlan(op('topic.archive'), topic({ archived: true }))).toEqual({
      action: 'unarchive',
    });
    expect(undoOrganizationPlan(op('topic.unarchive'), topic({ archived: false }))).toEqual({
      action: 'archive',
    });
    expect(undoOrganizationPlan(op('topic.archive'), topic({ archived: false }))).toBeNull();
    expect(undoOrganizationPlan(op('topic.unarchive'), topic({ archived: true }))).toBeNull();
  });

  it('mover una nota se deshace volviendo al tema de antes si sigue en el de después', () => {
    const moved = op('note.move', { detail: { from: 'tema-a', to: 'tema-b' } });
    expect(undoOrganizationPlan(moved, note({ topicId: 'tema-b' }))).toEqual({
      action: 'move',
      topicId: 'tema-a',
    });
    expect(undoOrganizationPlan(moved, note({ topicId: 'tema-c' }))).toBeNull();
    expect(undoOrganizationPlan(moved, note({ topicId: null }))).toBeNull();
  });

  it('mover una nota desde «Sin tema» se deshace volviendo a «Sin tema»', () => {
    const moved = op('note.move', { detail: { from: null, to: 'tema-b' } });
    expect(undoOrganizationPlan(moved, note({ topicId: 'tema-b' }))).toEqual({
      action: 'move',
      topicId: null,
    });
  });

  it('no vuelve a un tema que se eliminó', () => {
    const moved = op('note.move', { detail: { from: 'tema-a', to: 'tema-b' } });
    expect(
      undoOrganizationPlan(
        moved,
        note({ topicId: 'tema-b', isTopicAvailable: (id) => id !== 'tema-a' }),
      ),
    ).toBeNull();
  });

  it('un detalle que no se entiende nunca se deshace', () => {
    expect(undoOrganizationPlan(op('note.move', { detail: null }), note())).toBeNull();
    expect(undoOrganizationPlan(op('note.move', { detail: { from: 1 } }), note())).toBeNull();
    expect(undoOrganizationPlan(op('topic.rename', { detail: 'x' }), topic())).toBeNull();
    expect(undoOrganizationPlan(op('subject.activate', { detail: {} }), subject())).toBeNull();
  });

  it('renombrar un tema se deshace volviendo al nombre de antes si hoy se llama como después', () => {
    const renamed = op('topic.rename', {
      detail: { before: 'Regresión', after: 'Regresión lineal' },
    });
    expect(undoOrganizationPlan(renamed, topic({ name: 'Regresión lineal' }))).toEqual({
      action: 'rename',
      name: 'Regresión',
    });
    expect(undoOrganizationPlan(renamed, topic({ name: 'Otro nombre' }))).toBeNull();
  });

  it('no vuelve a un nombre que hoy usa otro tema de la materia', () => {
    const renamed = op('topic.rename', {
      detail: { before: 'Regresión', after: 'Regresión lineal' },
    });
    expect(
      undoOrganizationPlan(
        renamed,
        topic({ name: 'Regresión lineal', isNameUsedByOther: (name) => name === 'Regresión' }),
      ),
    ).toBeNull();
  });

  it('[CA-038] activar una materia se deshace activando la que estaba antes, si sigue activa la nueva', () => {
    const activated = op('subject.activate', {
      entityId: 'quimica',
      detail: { previousActiveId: 'estadistica' },
    });
    expect(undoOrganizationPlan(activated, subject({ activeSubjectId: 'quimica' }))).toEqual({
      action: 'activate',
      subjectId: 'estadistica',
    });
    expect(undoOrganizationPlan(activated, subject({ activeSubjectId: 'historia' }))).toBeNull();
  });

  it('activar una materia no se deshace si la anterior ya no existe o está archivada, ni si no había anterior', () => {
    const activated = op('subject.activate', {
      entityId: 'quimica',
      detail: { previousActiveId: 'estadistica' },
    });
    expect(
      undoOrganizationPlan(
        activated,
        subject({ activeSubjectId: 'quimica', isUsable: () => false }),
      ),
    ).toBeNull();
    const first = op('subject.activate', {
      entityId: 'quimica',
      detail: { previousActiveId: null },
    });
    expect(undoOrganizationPlan(first, subject({ activeSubjectId: 'quimica' }))).toBeNull();
  });

  it('lo eliminado para siempre nunca se deshace', () => {
    expect(undoOrganizationPlan(op('note.purge'), note())).toBeNull();
    expect(undoOrganizationPlan(op('topic.purge'), topic())).toBeNull();
    expect(undoOrganizationPlan(op('inbox.purge'), { entity: 'inbox', ...alive })).toBeNull();
  });

  it('un estado de otra clase de cosa no sirve para esa operación', () => {
    expect(undoOrganizationPlan(op('note.create'), topic())).toBeNull();
    expect(
      undoOrganizationPlan(op('topic.rename', { detail: { before: 'a', after: 'b' } }), note()),
    ).toBeNull();
  });
});
