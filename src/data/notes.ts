import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../core/clock';
import {
  canonicalJson,
  type IncomingBlock,
  mentionIdsOf,
  type NoteSnapshot,
  planBlocks,
  type StoredBlock,
  textPlainOf,
} from '../core/organization';
import {
  type Block,
  type InlineNode,
  inlineNodeSchema,
  type Note,
  type NoteSummary,
} from '../preload/contract/notes';
import { texts } from '../preload/contract/texts';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendOperation, type EventSource } from './ledger';
import {
  BlockOwnershipError,
  ImageNotFoundError,
  NoteNotFoundError,
  SubjectNotFoundError,
  TopicNotFoundError,
} from './organization-errors';
import type { Writer } from './orm';
import {
  blockLinks,
  blocks,
  blockVersions,
  images,
  notes,
  purgePermits,
  subjects,
  topics,
} from './schema';
import { activeTrashEntryOf, markRestored, sendToTrash } from './trash-entries';

// Las notas (H-10): cada una es una lista de renglones con sangría. Un renglón es una fila con su
// lugar y sus versiones inmutables; guardar compara lo que manda la ventana con lo que hay y
// escribe solo lo que cambió.

const EXCERPT_LENGTH = 160;
const MAX_TITLES = 8;

export interface NotesStore {
  list(input: { subjectId: string }): { notes: NoteSummary[] };
  create(
    input: { subjectId: string; topicId: string | null },
    options?: { source?: EventSource },
  ): Note;
  get(input: { noteId: string }): Note;
  save(input: {
    noteId: string;
    title: string;
    blocks: readonly IncomingBlock[];
  }): Record<string, never>;
  move(input: { noteId: string; topicId: string | null }): NoteSummary;
  archive(input: { noteId: string }): NoteSummary;
  unarchive(input: { noteId: string }): NoteSummary;
  // «Eliminar»: la nota va a la Papelera por 30 días.
  remove(input: { noteId: string }): { trashEntryId: string };
  titles(input: { query: string }): {
    notes: { id: string; title: string; topicName: string | null }[];
  };
  mentions(input: { noteId: string }): {
    mentions: { noteId: string; noteTitle: string; blockId: string; excerpt: string }[];
  };
}

type NoteRow = typeof notes.$inferSelect;

function findNote(db: Writer, noteId: string): NoteRow | undefined {
  return db.select().from(notes).where(eq(notes.id, noteId)).get();
}

// Una nota que está en la lista (no en la Papelera ni eliminada para siempre). Una archivada sí.
function activeNote(db: Writer, noteId: string): NoteRow {
  const row = findNote(db, noteId);
  if (!row || row.deletedAt !== null) {
    throw new NoteNotFoundError();
  }
  return row;
}

// Un tema que existe y no está en la Papelera.
function isLiveTopic(db: Writer, topicId: string): boolean {
  const row = db
    .select({ deletedAt: topics.deletedAt })
    .from(topics)
    .where(eq(topics.id, topicId))
    .get();
  return row !== undefined && row.deletedAt === null;
}

// El tema de la nota para mostrar: nulo si no tiene o si está en la Papelera.
function summaryOf(db: Writer, row: NoteRow): NoteSummary {
  return {
    id: row.id,
    subjectId: row.subjectId,
    topicId: row.topicId !== null && isLiveTopic(db, row.topicId) ? row.topicId : null,
    title: row.title,
    archived: row.archivedAt !== null,
  };
}

export function noteSummaryOf(db: Writer, noteId: string): NoteSummary {
  return summaryOf(db, activeNote(db, noteId));
}

const contentSchema = z.array(inlineNodeSchema);

function parseContent(json: string): InlineNode[] {
  return contentSchema.parse(JSON.parse(json));
}

// Los renglones vivos en orden de lectura (primero el padre y después sus hijos), con el nombre de
// cada enlace puesto al de hoy de la nota enlazada.
function readBlocks(db: Writer, noteId: string): Block[] {
  const rows = db
    .select({
      id: blocks.id,
      parentId: blocks.parentBlockId,
      position: blocks.position,
      collapsed: blocks.collapsed,
      content: blockVersions.content,
    })
    .from(blocks)
    .innerJoin(blockVersions, eq(blockVersions.id, blocks.currentVersionId))
    .where(and(eq(blocks.noteId, noteId), isNull(blocks.deletedAt)))
    .all();
  const children = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const siblings = children.get(row.parentId);
    if (siblings) {
      siblings.push(row);
    } else {
      children.set(row.parentId, [row]);
    }
  }
  const parsed = new Map(rows.map((row) => [row.id, parseContent(row.content)]));
  const linked = [
    ...new Set(
      [...parsed.values()].flatMap((content) =>
        content.flatMap((node) => (node.type === 'mention' ? [node.id] : [])),
      ),
    ),
  ];
  const titles = new Map<string, string>(
    linked.length === 0
      ? []
      : db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(inArray(notes.id, linked))
          .all()
          .map((note): [string, string] => [note.id, note.title]),
  );
  const labelled = (content: InlineNode[]): InlineNode[] =>
    content.map((node) => {
      if (node.type !== 'mention' || !titles.has(node.id)) {
        return node;
      }
      const title = titles.get(node.id) ?? '';
      return { ...node, label: title === '' ? texts.notes.list.untitled : title };
    });
  const ordered: Block[] = [];
  const walk = (parentId: string | null) => {
    const siblings = [...(children.get(parentId) ?? [])].sort(
      (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1),
    );
    for (const row of siblings) {
      ordered.push({
        id: row.id,
        parentId: row.parentId,
        collapsed: row.collapsed,
        content: labelled(parsed.get(row.id) ?? []),
      });
      walk(row.id);
    }
  };
  walk(null);
  return ordered;
}

export function noteOf(db: Writer, noteId: string): Note {
  const row = activeNote(db, noteId);
  return { ...summaryOf(db, row), blocks: readBlocks(db, noteId) };
}

// Un renglón nuevo con su primera versión.
function insertBlock(
  tx: Writer,
  clock: Clock,
  block: {
    id: string;
    noteId: string;
    parentId: string | null;
    position: number;
    collapsed: boolean;
    content: readonly InlineNode[];
  },
): void {
  const now = clock.now().toISOString();
  const versionId = newId();
  tx.insert(blocks)
    .values({
      id: block.id,
      noteId: block.noteId,
      parentBlockId: block.parentId,
      position: block.position,
      collapsed: block.collapsed,
      currentVersionId: versionId,
      createdAt: now,
    })
    .run();
  insertVersion(tx, clock, block.id, block.content, versionId);
}

function insertVersion(
  tx: Writer,
  clock: Clock,
  blockId: string,
  content: readonly InlineNode[],
  versionId = newId(),
): string {
  tx.insert(blockVersions)
    .values({
      id: versionId,
      blockId,
      content: canonicalJson(content),
      textPlain: textPlainOf(content),
      createdAt: clock.now().toISOString(),
      cause: 'edit',
    })
    .run();
  return versionId;
}

// Una nota nueva con un renglón vacío (o con el texto que se le dé). Anota la operación solo si
// se pide (mover un elemento de la Bandeja a un tema no la anota).
export function createNoteRow(
  tx: Writer,
  clock: Clock,
  input: {
    subjectId: string;
    topicId: string | null;
    title?: string;
    content?: readonly InlineNode[];
  },
  options: { source: EventSource; record: boolean },
): string {
  const subject = tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), isNull(subjects.deletedAt)))
    .get();
  if (!subject) {
    throw new SubjectNotFoundError();
  }
  if (input.topicId !== null) {
    const topic = tx.select().from(topics).where(eq(topics.id, input.topicId)).get();
    if (!topic || topic.deletedAt !== null || topic.subjectId !== input.subjectId) {
      throw new TopicNotFoundError();
    }
  }
  const noteId = newId();
  tx.insert(notes)
    .values({
      id: noteId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      title: input.title ?? '',
      createdAt: clock.now().toISOString(),
    })
    .run();
  insertBlock(tx, clock, {
    id: newId(),
    noteId,
    parentId: null,
    position: 0,
    collapsed: false,
    content: input.content ?? [],
  });
  if (options.record) {
    appendOperation(tx, clock, {
      kind: 'note.create',
      entityType: 'note',
      entityId: noteId,
      source: options.source,
    });
  }
  return noteId;
}

function storedBlocksOf(tx: Writer, noteId: string): StoredBlock[] {
  return tx
    .select({
      id: blocks.id,
      parentId: blocks.parentBlockId,
      position: blocks.position,
      collapsed: blocks.collapsed,
      deletedAt: blocks.deletedAt,
      content: blockVersions.content,
    })
    .from(blocks)
    .innerJoin(blockVersions, eq(blockVersions.id, blocks.currentVersionId))
    .where(eq(blocks.noteId, noteId))
    .all()
    .map((row) => ({
      id: row.id,
      parentId: row.parentId,
      position: row.position,
      collapsed: row.collapsed,
      deleted: row.deletedAt !== null,
      content: parseContent(row.content),
    }));
}

function relink(tx: Writer, blockId: string, content: readonly InlineNode[]): void {
  tx.delete(blockLinks).where(eq(blockLinks.blockId, blockId)).run();
  for (const targetNoteId of mentionIdsOf(content)) {
    tx.insert(blockLinks).values({ blockId, targetNoteId }).run();
  }
}

// Guarda lo que cambió y nada más: renglones nuevos, versiones nuevas, lugares y plegados, y los
// que ya no están (borrado lógico: sus versiones se conservan). No genera operación.
export function saveNoteRows(
  tx: Writer,
  clock: Clock,
  {
    noteId,
    title,
    blocks: incoming,
  }: { noteId: string; title: string; blocks: readonly IncomingBlock[] },
): void {
  const note = activeNote(tx, noteId);
  const plan = planBlocks(storedBlocksOf(tx, noteId), incoming);

  const known = new Set<string>();
  for (const block of [...plan.created, ...plan.revived, ...plan.edited]) {
    for (const node of block.content) {
      if (node.type === 'image' && !known.has(node.sha)) {
        const image = tx
          .select({ id: images.id })
          .from(images)
          .where(eq(images.sha256, node.sha))
          .get();
        if (!image) {
          throw new ImageNotFoundError();
        }
        known.add(node.sha);
      }
    }
  }

  for (const block of plan.created) {
    const owner = tx.select({ id: blocks.id }).from(blocks).where(eq(blocks.id, block.id)).get();
    if (owner) {
      throw new BlockOwnershipError();
    }
    insertBlock(tx, clock, { ...block, noteId, parentId: block.parentId });
    relink(tx, block.id, block.content);
  }
  for (const block of plan.revived) {
    tx.update(blocks)
      .set({
        deletedAt: null,
        parentBlockId: block.parentId,
        position: block.position,
        collapsed: block.collapsed,
      })
      .where(eq(blocks.id, block.id))
      .run();
    relink(tx, block.id, block.content);
  }
  for (const block of plan.edited) {
    const versionId = insertVersion(tx, clock, block.id, block.content);
    tx.update(blocks).set({ currentVersionId: versionId }).where(eq(blocks.id, block.id)).run();
    relink(tx, block.id, block.content);
  }
  for (const block of plan.moved) {
    tx.update(blocks)
      .set({ parentBlockId: block.parentId, position: block.position })
      .where(eq(blocks.id, block.id))
      .run();
  }
  for (const block of plan.folded) {
    tx.update(blocks).set({ collapsed: block.collapsed }).where(eq(blocks.id, block.id)).run();
  }
  for (const blockId of plan.removed) {
    tx.update(blocks)
      .set({ deletedAt: clock.now().toISOString() })
      .where(eq(blocks.id, blockId))
      .run();
    tx.delete(blockLinks).where(eq(blockLinks.blockId, blockId)).run();
  }

  const clean = title.trim();
  if (clean !== note.title) {
    tx.update(notes).set({ title: clean }).where(eq(notes.id, noteId)).run();
  }
}

// Mover a un tema de la misma materia, o a «Sin tema» con nulo. Al lugar donde ya está, no hace nada.
export function moveNoteRow(
  tx: Writer,
  clock: Clock,
  noteId: string,
  topicId: string | null,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): void {
  const note = activeNote(tx, noteId);
  if (topicId !== null) {
    const topic = tx.select().from(topics).where(eq(topics.id, topicId)).get();
    if (!topic || topic.deletedAt !== null || topic.subjectId !== note.subjectId) {
      throw new TopicNotFoundError();
    }
  }
  if (note.topicId === topicId) {
    return;
  }
  tx.update(notes).set({ topicId }).where(eq(notes.id, noteId)).run();
  appendOperation(tx, clock, {
    kind: 'note.move',
    entityType: 'note',
    entityId: noteId,
    detail: { from: note.topicId, to: topicId },
    undoesId,
    source,
  });
}

export function setNoteArchived(
  tx: Writer,
  clock: Clock,
  noteId: string,
  archived: boolean,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): void {
  const note = activeNote(tx, noteId);
  if ((note.archivedAt !== null) === archived) {
    return;
  }
  tx.update(notes)
    .set({ archivedAt: archived ? clock.now().toISOString() : null })
    .where(eq(notes.id, noteId))
    .run();
  appendOperation(tx, clock, {
    kind: archived ? 'note.archive' : 'note.unarchive',
    entityType: 'note',
    entityId: noteId,
    undoesId,
    source,
  });
}

// «Eliminar»: a la Papelera por 30 días. Los renglones, las versiones y los enlaces quedan.
export function trashNote(
  tx: Writer,
  clock: Clock,
  noteId: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): { trashEntryId: string } {
  activeNote(tx, noteId);
  const trashEntryId = sendToTrash(tx, clock, 'note', noteId);
  tx.update(notes).set({ deletedAt: clock.now().toISOString() }).where(eq(notes.id, noteId)).run();
  appendOperation(tx, clock, {
    kind: 'note.delete',
    entityType: 'note',
    entityId: noteId,
    trashEntryId,
    undoesId,
    source,
  });
  return { trashEntryId };
}

// Restaurar desde la Papelera: vuelve con sus renglones, sus versiones y sus enlaces.
export function restoreNoteEntry(
  tx: Writer,
  clock: Clock,
  entry: { id: string; entityId: string },
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): boolean {
  const note = findNote(tx, entry.entityId);
  if (!note || note.deletedAt === null) {
    return false;
  }
  tx.update(notes).set({ deletedAt: null }).where(eq(notes.id, note.id)).run();
  markRestored(tx, clock, entry.id);
  appendOperation(tx, clock, {
    kind: 'note.restore',
    entityType: 'note',
    entityId: note.id,
    trashEntryId: entry.id,
    undoesId,
    source,
  });
  return true;
}

// Eliminar para siempre: las versiones de cada renglón (con el permiso que piden los
// disparadores, que vive solo dentro de esta transacción), sus enlaces y los que apuntan a la
// nota, los renglones y la nota.
export function purgeNoteRows(tx: Writer, noteId: string): void {
  const ids = tx
    .select({ id: blocks.id })
    .from(blocks)
    .where(eq(blocks.noteId, noteId))
    .all()
    .map((row) => row.id);
  for (const blockId of ids) {
    tx.delete(blockLinks).where(eq(blockLinks.blockId, blockId)).run();
    tx.insert(purgePermits).values({ entityType: 'block', entityId: blockId }).run();
    tx.delete(blockVersions).where(eq(blockVersions.blockId, blockId)).run();
    tx.delete(purgePermits)
      .where(and(eq(purgePermits.entityType, 'block'), eq(purgePermits.entityId, blockId)))
      .run();
  }
  tx.delete(blockLinks).where(eq(blockLinks.targetNoteId, noteId)).run();
  tx.delete(blocks).where(eq(blocks.noteId, noteId)).run();
  tx.delete(notes).where(eq(notes.id, noteId)).run();
}

// Cómo está una nota, para saber si un cambio todavía se puede deshacer.
export function noteState(db: Writer, noteId: string, now: Date): NoteSnapshot {
  const row = findNote(db, noteId);
  const base = {
    entity: 'note' as const,
    archived: row !== undefined && row.archivedAt !== null,
    topicId: row?.topicId ?? null,
    isTopicAvailable: (topicId: string) => isLiveTopic(db, topicId),
  };
  if (!row) {
    return { ...base, status: 'gone', activeTrashEntryId: null };
  }
  if (row.deletedAt === null) {
    return { ...base, status: 'active', activeTrashEntryId: null };
  }
  return {
    ...base,
    status: 'trashed',
    activeTrashEntryId: activeTrashEntryOf(db, 'note', noteId, now)?.id ?? null,
  };
}

// Sin mayúsculas ni tildes, para buscar por las primeras letras.
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function createNotesStore(db: ReteniaDatabase, clock: Clock): NotesStore {
  const { orm } = db;

  return {
    list({ subjectId }) {
      return {
        notes: orm
          .select()
          .from(notes)
          .where(and(eq(notes.subjectId, subjectId), isNull(notes.deletedAt)))
          .orderBy(desc(notes.createdAt), desc(notes.id))
          .all()
          .map((row) => summaryOf(orm, row)),
      };
    },

    create(input, { source = 'user' } = {}) {
      return orm.transaction((tx) => {
        const noteId = createNoteRow(tx, clock, input, { source, record: true });
        return noteOf(tx, noteId);
      });
    },

    get({ noteId }) {
      return noteOf(orm, noteId);
    },

    save(input) {
      orm.transaction((tx) => saveNoteRows(tx, clock, input));
      return {};
    },

    move({ noteId, topicId }) {
      return orm.transaction((tx) => {
        moveNoteRow(tx, clock, noteId, topicId, { source: 'user' });
        return noteSummaryOf(tx, noteId);
      });
    },

    archive({ noteId }) {
      return orm.transaction((tx) => {
        setNoteArchived(tx, clock, noteId, true, { source: 'user' });
        return noteSummaryOf(tx, noteId);
      });
    },

    unarchive({ noteId }) {
      return orm.transaction((tx) => {
        setNoteArchived(tx, clock, noteId, false, { source: 'user' });
        return noteSummaryOf(tx, noteId);
      });
    },

    remove({ noteId }) {
      return orm.transaction((tx) => trashNote(tx, clock, noteId, { source: 'user' }));
    },

    titles({ query }) {
      const wanted = fold(query.trim());
      const rows = orm
        .select({ id: notes.id, title: notes.title, topicId: notes.topicId })
        .from(notes)
        .where(and(isNull(notes.deletedAt), isNull(notes.archivedAt)))
        .orderBy(desc(notes.createdAt), desc(notes.id))
        .all();
      const matching = rows.filter((row) => fold(row.title).includes(wanted));
      const starting = matching.filter((row) => fold(row.title).startsWith(wanted));
      const rest = matching.filter((row) => !fold(row.title).startsWith(wanted));
      return {
        notes: [...starting, ...rest].slice(0, MAX_TITLES).map((row) => {
          const topic =
            row.topicId === null
              ? undefined
              : orm
                  .select({ name: topics.name, deletedAt: topics.deletedAt })
                  .from(topics)
                  .where(eq(topics.id, row.topicId))
                  .get();
          return {
            id: row.id,
            title: row.title,
            topicName: topic && topic.deletedAt === null ? topic.name : null,
          };
        }),
      };
    },

    mentions({ noteId }) {
      const rows = orm
        .select({
          noteId: notes.id,
          noteTitle: notes.title,
          blockId: blocks.id,
          textPlain: blockVersions.textPlain,
        })
        .from(blockLinks)
        .innerJoin(blocks, and(eq(blocks.id, blockLinks.blockId), isNull(blocks.deletedAt)))
        .innerJoin(notes, and(eq(notes.id, blocks.noteId), isNull(notes.deletedAt)))
        .innerJoin(blockVersions, eq(blockVersions.id, blocks.currentVersionId))
        .where(eq(blockLinks.targetNoteId, noteId))
        .orderBy(asc(notes.createdAt), asc(notes.id), asc(blocks.position), asc(blocks.id))
        .all();
      return {
        mentions: rows.map((row) => ({
          noteId: row.noteId,
          noteTitle: row.noteTitle,
          blockId: row.blockId,
          excerpt: row.textPlain.slice(0, EXCERPT_LENGTH),
        })),
      };
    },
  };
}
