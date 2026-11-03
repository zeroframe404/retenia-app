import { and, asc, count, eq, isNull, max, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { renameTopic, sameName, type TopicSnapshot } from '../core/organization';
import type { Topic } from '../preload/contract/organization';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendOperation, type EventSource } from './ledger';
import {
  DuplicateNameError,
  SubjectNotFoundError,
  TopicNotFoundError,
} from './organization-errors';
import type { Writer } from './orm';
import { notes, subjects, topicAliases, topics } from './schema';
import { activeTrashEntryOf, markRestored, sendToTrash } from './trash-entries';

// Los temas de una materia (H-09). Cada cambio que se puede deshacer agrega una operación.

export interface TopicsStore {
  list(input: { subjectId: string }): { topics: Topic[] };
  create(input: { subjectId: string; name: string }, options?: { source?: EventSource }): Topic;
  rename(input: { topicId: string; name: string }): Topic;
  archive(input: { topicId: string }): Topic;
  unarchive(input: { topicId: string }): Topic;
  // «Eliminar»: el tema va a la Papelera por 30 días.
  remove(input: { topicId: string }): { trashEntryId: string };
}

type TopicRow = typeof topics.$inferSelect;

function findTopic(db: Writer, topicId: string): TopicRow | undefined {
  return db.select().from(topics).where(eq(topics.id, topicId)).get();
}

// Un tema que está en la lista (no en la Papelera ni eliminado para siempre).
function activeTopic(db: Writer, topicId: string): TopicRow {
  const row = findTopic(db, topicId);
  if (!row || row.deletedAt !== null) {
    throw new TopicNotFoundError();
  }
  return row;
}

// Los temas vigentes de la materia (archivados incluidos).
function liveTopics(db: Writer, subjectId: string): TopicRow[] {
  return db
    .select()
    .from(topics)
    .where(and(eq(topics.subjectId, subjectId), isNull(topics.deletedAt)))
    .orderBy(asc(topics.position), asc(topics.id))
    .all();
}

function aliasesOf(db: Writer, topicId: string): string[] {
  return db
    .select({ name: topicAliases.name })
    .from(topicAliases)
    .where(eq(topicAliases.topicId, topicId))
    .orderBy(sql`rowid`)
    .all()
    .map((row) => row.name);
}

function noteCountOf(db: Writer, topicId: string): number {
  return (
    db
      .select({ total: count() })
      .from(notes)
      .where(and(eq(notes.topicId, topicId), isNull(notes.archivedAt), isNull(notes.deletedAt)))
      .get()?.total ?? 0
  );
}

function toTopic(db: Writer, row: TopicRow): Topic {
  return {
    id: row.id,
    subjectId: row.subjectId,
    name: row.name,
    archived: row.archivedAt !== null,
    aliases: aliasesOf(db, row.id),
    noteCount: noteCountOf(db, row.id),
  };
}

function topicOf(db: Writer, topicId: string): Topic {
  return toTopic(db, activeTopic(db, topicId));
}

// El nombre no se repite dentro de la materia, archivados incluidos.
function assertNameFree(
  db: Writer,
  subjectId: string,
  name: string,
  exceptId: string | null,
): void {
  const taken = liveTopics(db, subjectId).some(
    (other) => other.id !== exceptId && sameName(other.name, name),
  );
  if (taken) {
    throw new DuplicateNameError();
  }
}

export function createTopicRow(
  tx: Writer,
  clock: Clock,
  { subjectId, name }: { subjectId: string; name: string },
  { source }: { source: EventSource },
): string {
  const subject = tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)))
    .get();
  if (!subject) {
    throw new SubjectNotFoundError();
  }
  const clean = name.trim();
  assertNameFree(tx, subjectId, clean, null);
  const last = tx
    .select({ position: max(topics.position) })
    .from(topics)
    .where(eq(topics.subjectId, subjectId))
    .get();
  const topicId = newId();
  tx.insert(topics)
    .values({
      id: topicId,
      subjectId,
      name: clean,
      position: (last?.position ?? -1) + 1,
      createdAt: clock.now().toISOString(),
    })
    .run();
  appendOperation(tx, clock, {
    kind: 'topic.create',
    entityType: 'topic',
    entityId: topicId,
    source,
  });
  return topicId;
}

// Renombra guardando el nombre viejo en «Otros nombres». Con el mismo nombre exacto no hace nada.
export function renameTopicRow(
  tx: Writer,
  clock: Clock,
  topicId: string,
  newName: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): void {
  const current = activeTopic(tx, topicId);
  const name = newName.trim();
  if (current.name === name) {
    return;
  }
  assertNameFree(tx, current.subjectId, name, topicId);
  const before = aliasesOf(tx, topicId);
  const renamed = renameTopic({ name: current.name, aliases: before }, name);
  const now = clock.now().toISOString();
  tx.update(topics).set({ name: renamed.name }).where(eq(topics.id, topicId)).run();
  for (const alias of before) {
    if (!renamed.aliases.includes(alias)) {
      tx.delete(topicAliases)
        .where(and(eq(topicAliases.topicId, topicId), eq(topicAliases.name, alias)))
        .run();
    }
  }
  for (const alias of renamed.aliases) {
    if (!before.includes(alias)) {
      tx.insert(topicAliases).values({ topicId, name: alias, since: now }).run();
    }
  }
  appendOperation(tx, clock, {
    kind: 'topic.rename',
    entityType: 'topic',
    entityId: topicId,
    detail: { before: current.name, after: name },
    undoesId,
    source,
  });
}

// Archivar solo saca el tema de la lista de temas: sus notas no se tocan.
export function setTopicArchived(
  tx: Writer,
  clock: Clock,
  topicId: string,
  archived: boolean,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): void {
  const current = activeTopic(tx, topicId);
  if ((current.archivedAt !== null) === archived) {
    return;
  }
  tx.update(topics)
    .set({ archivedAt: archived ? clock.now().toISOString() : null })
    .where(eq(topics.id, topicId))
    .run();
  appendOperation(tx, clock, {
    kind: archived ? 'topic.archive' : 'topic.unarchive',
    entityType: 'topic',
    entityId: topicId,
    undoesId,
    source,
  });
}

// «Eliminar»: a la Papelera por 30 días. Sus notas quedan como están (sin tema mientras tanto).
export function trashTopic(
  tx: Writer,
  clock: Clock,
  topicId: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): { trashEntryId: string } {
  activeTopic(tx, topicId);
  const trashEntryId = sendToTrash(tx, clock, 'topic', topicId);
  tx.update(topics)
    .set({ deletedAt: clock.now().toISOString() })
    .where(eq(topics.id, topicId))
    .run();
  appendOperation(tx, clock, {
    kind: 'topic.delete',
    entityType: 'topic',
    entityId: topicId,
    trashEntryId,
    undoesId,
    source,
  });
  return { trashEntryId };
}

// Restaurar: el tema vuelve con sus otros nombres y sus notas. Si otro tema de la materia ya usa
// el nombre, no se restaura.
export function restoreTopicEntry(
  tx: Writer,
  clock: Clock,
  entry: { id: string; entityId: string },
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): boolean {
  const topic = findTopic(tx, entry.entityId);
  if (!topic || topic.deletedAt === null) {
    return false;
  }
  const taken = liveTopics(tx, topic.subjectId).some((other) => sameName(other.name, topic.name));
  if (taken) {
    return false;
  }
  tx.update(topics).set({ deletedAt: null }).where(eq(topics.id, topic.id)).run();
  markRestored(tx, clock, entry.id);
  appendOperation(tx, clock, {
    kind: 'topic.restore',
    entityType: 'topic',
    entityId: topic.id,
    trashEntryId: entry.id,
    undoesId,
    source,
  });
  return true;
}

// Eliminar para siempre: sus otros nombres se van y sus notas quedan sin tema.
export function purgeTopicRows(tx: Writer, topicId: string): void {
  tx.delete(topicAliases).where(eq(topicAliases.topicId, topicId)).run();
  tx.update(notes).set({ topicId: null }).where(eq(notes.topicId, topicId)).run();
  tx.delete(topics).where(eq(topics.id, topicId)).run();
}

// Cómo está un tema, para saber si un cambio todavía se puede deshacer.
export function topicState(db: Writer, topicId: string, now: Date): TopicSnapshot {
  const row = findTopic(db, topicId);
  const name = row?.name ?? '';
  const usedByOther = (candidate: string) =>
    row !== undefined &&
    liveTopics(db, row.subjectId).some(
      (other) => other.id !== row.id && sameName(other.name, candidate),
    );
  const base = {
    entity: 'topic' as const,
    archived: row !== undefined && row.archivedAt !== null,
    name,
    isNameUsedByOther: usedByOther,
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
    activeTrashEntryId: activeTrashEntryOf(db, 'topic', topicId, now)?.id ?? null,
  };
}

export function createTopicsStore(db: ReteniaDatabase, clock: Clock): TopicsStore {
  const { orm } = db;

  return {
    list({ subjectId }) {
      return { topics: liveTopics(orm, subjectId).map((row) => toTopic(orm, row)) };
    },

    create(input, { source = 'user' } = {}) {
      return orm.transaction((tx) => {
        const topicId = createTopicRow(tx, clock, input, { source });
        return topicOf(tx, topicId);
      });
    },

    rename({ topicId, name }) {
      return orm.transaction((tx) => {
        renameTopicRow(tx, clock, topicId, name, { source: 'user' });
        return topicOf(tx, topicId);
      });
    },

    archive({ topicId }) {
      return orm.transaction((tx) => {
        setTopicArchived(tx, clock, topicId, true, { source: 'user' });
        return topicOf(tx, topicId);
      });
    },

    unarchive({ topicId }) {
      return orm.transaction((tx) => {
        setTopicArchived(tx, clock, topicId, false, { source: 'user' });
        return topicOf(tx, topicId);
      });
    },

    remove({ topicId }) {
      return orm.transaction((tx) => trashTopic(tx, clock, topicId, { source: 'user' }));
    },
  };
}
