import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import type { InboxSnapshot } from '../core/organization';
import { localDateTime } from '../core/study-day';
import { MAX_TITLE_LENGTH, type NoteSummary } from '../preload/contract/notes';
import type { InboxItem } from '../preload/contract/organization';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendOperation, type EventSource } from './ledger';
import { createNoteRow, noteSummaryOf } from './notes';
import { InboxItemNotFoundError, TopicNotFoundError } from './organization-errors';
import type { Writer } from './orm';
import { inboxItems, topics } from './schema';
import { activeTrashEntryOf, markRestored, sendToTrash } from './trash-entries';

// La Bandeja (H-11): líneas sueltas, sin materia ni tema, hasta que se las mueve a un tema, donde
// pasan a ser una nota.

export interface InboxStore {
  list(): { items: InboxItem[]; count: number };
  capture(input: { text: string }): { count: number };
  move(input: { itemId: string; topicId: string }): NoteSummary;
  // «Eliminar»: el elemento va a la Papelera por 30 días.
  remove(input: { itemId: string }): { trashEntryId: string };
}

type ItemRow = typeof inboxItems.$inferSelect;

function findItem(db: Writer, itemId: string): ItemRow | undefined {
  return db.select().from(inboxItems).where(eq(inboxItems.id, itemId)).get();
}

// Un elemento que está en la Bandeja: ni movido a un tema, ni en la Papelera, ni eliminado.
function activeItem(db: Writer, itemId: string): ItemRow {
  const row = findItem(db, itemId);
  if (!row || row.movedToNoteId !== null || row.deletedAt !== null) {
    throw new InboxItemNotFoundError();
  }
  return row;
}

function waiting(db: Writer): ItemRow[] {
  return db
    .select()
    .from(inboxItems)
    .where(and(isNull(inboxItems.movedToNoteId), isNull(inboxItems.deletedAt)))
    .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id))
    .all();
}

export function trashInboxItem(
  tx: Writer,
  clock: Clock,
  itemId: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): { trashEntryId: string } {
  activeItem(tx, itemId);
  const trashEntryId = sendToTrash(tx, clock, 'inbox', itemId);
  tx.update(inboxItems)
    .set({ deletedAt: clock.now().toISOString() })
    .where(eq(inboxItems.id, itemId))
    .run();
  appendOperation(tx, clock, {
    kind: 'inbox.delete',
    entityType: 'inbox',
    entityId: itemId,
    trashEntryId,
    undoesId,
    source,
  });
  return { trashEntryId };
}

// Restaurar: el elemento vuelve a la Bandeja.
export function restoreInboxEntry(
  tx: Writer,
  clock: Clock,
  entry: { id: string; entityId: string },
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): boolean {
  const item = findItem(tx, entry.entityId);
  if (!item || item.deletedAt === null) {
    return false;
  }
  tx.update(inboxItems).set({ deletedAt: null }).where(eq(inboxItems.id, item.id)).run();
  markRestored(tx, clock, entry.id);
  appendOperation(tx, clock, {
    kind: 'inbox.restore',
    entityType: 'inbox',
    entityId: item.id,
    trashEntryId: entry.id,
    undoesId,
    source,
  });
  return true;
}

export function purgeInboxRow(tx: Writer, itemId: string): void {
  tx.delete(inboxItems).where(eq(inboxItems.id, itemId)).run();
}

// Cómo está un elemento, para saber si un cambio todavía se puede deshacer. Uno que ya se movió a
// un tema dejó de ser de la Bandeja.
export function inboxState(db: Writer, itemId: string, now: Date): InboxSnapshot {
  const row = findItem(db, itemId);
  if (!row || row.movedToNoteId !== null) {
    return { entity: 'inbox', status: 'gone', activeTrashEntryId: null };
  }
  if (row.deletedAt === null) {
    return { entity: 'inbox', status: 'active', activeTrashEntryId: null };
  }
  return {
    entity: 'inbox',
    status: 'trashed',
    activeTrashEntryId: activeTrashEntryOf(db, 'inbox', itemId, now)?.id ?? null,
  };
}

export function createInboxStore(db: ReteniaDatabase, clock: Clock): InboxStore {
  const { orm } = db;

  return {
    list() {
      const items = waiting(orm).map((row) => ({
        id: row.id,
        text: row.text,
        day: localDateTime(new Date(row.createdAt)).day,
      }));
      return { items, count: items.length };
    },

    capture({ text }) {
      const clean = text.trim();
      if (clean === '') {
        throw new Error('El texto no puede estar vacío');
      }
      return orm.transaction((tx) => {
        tx.insert(inboxItems)
          .values({ id: newId(), text: clean, createdAt: clock.now().toISOString() })
          .run();
        return { count: waiting(tx).length };
      });
    },

    move({ itemId, topicId }) {
      return orm.transaction((tx) => {
        const item = activeItem(tx, itemId);
        const topic = tx.select().from(topics).where(eq(topics.id, topicId)).get();
        if (!topic || topic.deletedAt !== null) {
          throw new TopicNotFoundError();
        }
        // Un texto más largo que un título no se pierde: el título se corta y el texto entero va
        // en el renglón.
        const fits = item.text.length <= MAX_TITLE_LENGTH;
        const noteId = createNoteRow(
          tx,
          clock,
          {
            subjectId: topic.subjectId,
            topicId: topic.id,
            title: item.text.slice(0, MAX_TITLE_LENGTH),
            content: fits ? [] : [{ type: 'text', text: item.text }],
          },
          { source: 'user', record: false },
        );
        tx.update(inboxItems)
          .set({ movedToNoteId: noteId, movedAt: clock.now().toISOString() })
          .where(eq(inboxItems.id, itemId))
          .run();
        return noteSummaryOf(tx, noteId);
      });
    },

    remove({ itemId }) {
      return orm.transaction((tx) => trashInboxItem(tx, clock, itemId, { source: 'user' }));
    },
  };
}
