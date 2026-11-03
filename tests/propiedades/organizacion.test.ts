import fc from 'fast-check';
import { afterAll, describe, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import {
  activateSubject,
  type IncomingBlock,
  planBlocks,
  renameTopic,
  type StoredBlock,
  SUBJECT_STATUSES,
  sameName,
} from '../../src/core/organization';
import { openWorkspace } from '../../src/data/workspace';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';

const SEED = 20270315;

// Nombres como los escribe una persona: con mayúsculas, tildes y espacios de más.
const name = fc
  .array(fc.constantFrom('a', 'A', 'e', 'é', 'É', 'n', 'ñ', 'r', ' ', '  ', 'x'), {
    minLength: 1,
    maxLength: 8,
  })
  .map((parts) => parts.join(''))
  .filter((value) => value.trim() !== '');

describe('materia activa única', () => {
  it('después de activar una, hay exactamente una activa y es la elegida', () => {
    const status = fc.constantFrom(...SUBJECT_STATUSES);
    fc.assert(
      fc.property(fc.array(status, { minLength: 1, maxLength: 8 }), fc.nat(), (statuses, pick) => {
        const subjects = statuses.map((value, index) => ({ id: `m${index}`, status: value }));
        const chosen = subjects[pick % subjects.length]?.id ?? '';
        const result = activateSubject(subjects, chosen);
        const active = result.filter((subject) => subject.status === 'active');
        return active.length === 1 && active[0]?.id === chosen;
      }),
      { seed: SEED, numRuns: 200 },
    );
  });

  it('solo cambian la elegida y la que estaba activa: pausa y archivadas quedan como estaban', () => {
    const status = fc.constantFrom(...SUBJECT_STATUSES);
    fc.assert(
      fc.property(fc.array(status, { minLength: 1, maxLength: 8 }), fc.nat(), (statuses, pick) => {
        const subjects = statuses.map((value, index) => ({ id: `m${index}`, status: value }));
        const chosen = subjects[pick % subjects.length]?.id ?? '';
        return activateSubject(subjects, chosen).every((after, index) => {
          const before = subjects[index];
          if (before === undefined) {
            return false;
          }
          if (after.id === chosen) {
            return after.status === 'active';
          }
          return before.status === 'active'
            ? after.status === 'maintenance'
            : after.status === before.status;
        });
      }),
      { seed: SEED, numRuns: 200 },
    );
  });

  it('activar dos veces la misma da lo mismo que activarla una', () => {
    const status = fc.constantFrom(...SUBJECT_STATUSES);
    fc.assert(
      fc.property(fc.array(status, { minLength: 1, maxLength: 8 }), fc.nat(), (statuses, pick) => {
        const subjects = statuses.map((value, index) => ({ id: `m${index}`, status: value }));
        const chosen = subjects[pick % subjects.length]?.id ?? '';
        const once = activateSubject(subjects, chosen);
        return JSON.stringify(activateSubject(once, chosen)) === JSON.stringify(once);
      }),
      { seed: SEED, numRuns: 100 },
    );
  });
});

describe('«Otros nombres» de un tema', () => {
  it('renombrar varias veces nunca repite un otro nombre ni deja el nombre vigente entre ellos', () => {
    fc.assert(
      fc.property(name, fc.array(name, { minLength: 1, maxLength: 12 }), (first, renames) => {
        let topic = { name: first, aliases: [] as string[] };
        for (const next of renames) {
          topic = renameTopic(topic, next);
          const repeated = topic.aliases.some((alias, index) =>
            topic.aliases.some(
              (other, otherIndex) => index !== otherIndex && sameName(alias, other),
            ),
          );
          if (repeated || topic.aliases.some((alias) => sameName(alias, topic.name))) {
            return false;
          }
        }
        return true;
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('el nombre que tenía antes siempre queda disponible: o es el vigente o está entre los otros nombres', () => {
    fc.assert(
      fc.property(name, name, (before, after) => {
        const renamed = renameTopic({ name: before, aliases: [] }, after);
        return (
          sameName(renamed.name, after) &&
          (sameName(before, after) || renamed.aliases.some((alias) => sameName(alias, before)))
        );
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('renombrar al mismo nombre exacto no cambia nada', () => {
    fc.assert(
      fc.property(name, fc.array(name, { maxLength: 4 }), (current, aliases) => {
        const clean = aliases.filter((alias) => !sameName(alias, current));
        const topic = { name: current, aliases: clean };
        return JSON.stringify(renameTopic(topic, current)) === JSON.stringify(topic);
      }),
      { seed: SEED, numRuns: 200 },
    );
  });
});

// Un árbol de renglones en orden de lectura: cada padre seguido de sus hijos, uno tras otro.
const outline = fc
  .array(
    fc.record({
      parent: fc.nat(),
      collapsed: fc.boolean(),
      text: fc.constantFrom('', 'uno', 'dos', 'tres', 'cuatro'),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map((rows) => {
    const created: IncomingBlock[] = [];
    rows.forEach((row, index) => {
      const parent =
        index === 0 || row.parent % (index + 1) === index ? null : created[row.parent % index];
      created.push({
        id: `b${index}`,
        parentId: parent?.id ?? null,
        collapsed: row.collapsed,
        content: row.text === '' ? [] : [{ type: 'text', text: row.text }],
      });
    });
    const walk = (parentId: string | null): IncomingBlock[] =>
      created
        .filter((block) => block.parentId === parentId)
        .flatMap((block) => [block, ...walk(block.id)]);
    return walk(null);
  });

// Aplica un plan a lo que había, como lo hace el almacén, para ver que el resultado es lo que llegó.
function apply(
  existing: readonly StoredBlock[],
  incoming: readonly IncomingBlock[],
): StoredBlock[] {
  const plan = planBlocks(existing, incoming);
  const rows = new Map(existing.map((row) => [row.id, { ...row }]));
  for (const block of [...plan.created, ...plan.revived]) {
    rows.set(block.id, { ...block, deleted: false });
  }
  for (const block of plan.edited) {
    const row = rows.get(block.id);
    if (row) {
      row.content = block.content;
    }
  }
  for (const block of [...plan.moved, ...plan.folded]) {
    const row = rows.get(block.id);
    if (row) {
      row.parentId = block.parentId;
      row.position = block.position;
      row.collapsed = block.collapsed;
    }
  }
  for (const id of plan.removed) {
    const row = rows.get(id);
    if (row) {
      row.deleted = true;
    }
  }
  return [...rows.values()];
}

// Los renglones vivos como los lee el editor: en orden de lectura.
function readingOrder(rows: readonly StoredBlock[]): IncomingBlock[] {
  const live = rows.filter((row) => !row.deleted);
  const walk = (parentId: string | null): IncomingBlock[] =>
    live
      .filter((row) => row.parentId === parentId)
      .sort((a, b) => a.position - b.position)
      .flatMap((row) => [
        { id: row.id, parentId: row.parentId, collapsed: row.collapsed, content: row.content },
        ...walk(row.id),
      ]);
  return walk(null);
}

function asStored(blocks: readonly IncomingBlock[]): StoredBlock[] {
  const counts = new Map<string | null, number>();
  return blocks.map((block) => {
    const position = counts.get(block.parentId) ?? 0;
    counts.set(block.parentId, position + 1);
    return { ...block, position, deleted: false };
  });
}

describe('guardar un árbol de renglones en la base real', () => {
  const data = tempDataFolder();
  const workspace = openWorkspace({
    dataDir: data.folder,
    clock: demoClock(),
    appVersion: '0.0.0-prueba',
  });
  afterAll(() => {
    workspace.close();
    data.remove();
  });
  const subject = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const note = workspace.notes.create({ subjectId: subject.id, topicId: null });

  const shape = (blocks: readonly IncomingBlock[]) =>
    JSON.stringify(
      blocks.map(({ id, parentId, collapsed, content }) => ({ id, parentId, collapsed, content })),
    );

  it('guardar un árbol y volver a abrir la nota da el mismo árbol, parta del estado que parta', () => {
    fc.assert(
      fc.property(outline, outline, (before, after) => {
        workspace.notes.save({ noteId: note.id, title: '', blocks: before });
        workspace.notes.save({ noteId: note.id, title: '', blocks: after });
        return shape(workspace.notes.get({ noteId: note.id }).blocks) === shape(after);
      }),
      { seed: SEED, numRuns: 40 },
    );
    // Cada guardado espera el disco (synchronous FULL): en una máquina lenta tarda unos segundos.
  }, 60_000);

  it('guardar lo mismo otra vez nunca agrega versiones', () => {
    fc.assert(
      fc.property(outline, (blocks) => {
        workspace.notes.save({ noteId: note.id, title: '', blocks });
        const versions = () => readRows(data.file, 'SELECT count(*) AS n FROM block_versions');
        const before = versions();
        workspace.notes.save({ noteId: note.id, title: '', blocks });
        return (
          JSON.stringify(versions()) === JSON.stringify(before) &&
          shape(workspace.notes.get({ noteId: note.id }).blocks) === shape(blocks)
        );
      }),
      { seed: SEED, numRuns: 30 },
    );
  }, 60_000);
});

describe('guardar un árbol de renglones', () => {
  it('guardar un árbol y volver a leerlo da el mismo árbol, parta de lo que parta', () => {
    fc.assert(
      fc.property(outline, outline, (before, after) => {
        const saved = apply(asStored(before), after);
        return JSON.stringify(readingOrder(saved)) === JSON.stringify(after);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('guardar sobre una base vacía crea todos los renglones y guardar lo mismo después no hace nada', () => {
    fc.assert(
      fc.property(outline, (blocks) => {
        const first = planBlocks([], blocks);
        const saved = apply([], blocks);
        const second = planBlocks(saved, blocks);
        return (
          first.created.length === blocks.length &&
          second.created.length +
            second.revived.length +
            second.edited.length +
            second.moved.length +
            second.folded.length +
            second.removed.length ===
            0
        );
      }),
      { seed: SEED, numRuns: 200 },
    );
  });

  it('cada renglón cae en una sola categoría de creación, y nada se borra si sigue en lo que llegó', () => {
    fc.assert(
      fc.property(outline, outline, (before, after) => {
        const plan = planBlocks(asStored(before), after);
        const kept = new Set(after.map((block) => block.id));
        const known = new Set(before.map((block) => block.id));
        return (
          plan.removed.every((id) => !kept.has(id) && known.has(id)) &&
          plan.created.every((block) => !known.has(block.id)) &&
          plan.revived.length === 0
        );
      }),
      { seed: SEED, numRuns: 200 },
    );
  });
});
