import { and, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { isTrashExpired } from '../core/trash';
import { purgeTrashEntry, restoreTrashEntry } from './content';
import { purgeInboxRow, restoreInboxEntry } from './inbox';
import { appendOperation, type EventSource } from './ledger';
import { purgeNoteRows, restoreNoteEntry } from './notes';
import type { Writer } from './orm';
import { trashEntries } from './schema';
import { purgeTopicRows, restoreTopicEntry } from './topics';
import { markPurged } from './trash-entries';

// «Restaurar» y «Vaciar papelera» sirven para todo lo que se elimina: cada entrada de la Papelera
// dice qué clase de cosa guarda, y acá se reparte el trabajo.

type Entry = typeof trashEntries.$inferSelect;

// Devuelve si restauró (una entrada ya restaurada, vaciada o vencida no cambia nada).
export function restoreAnyEntry(
  tx: Writer,
  clock: Clock,
  entryId: string,
  options: { source: EventSource; undoesId?: string | null },
): boolean {
  const entry = tx
    .select()
    .from(trashEntries)
    .where(
      and(
        eq(trashEntries.id, entryId),
        isNull(trashEntries.restoredAt),
        isNull(trashEntries.purgedAt),
      ),
    )
    .get();
  if (!entry || isTrashExpired(new Date(entry.expiresAt), clock.now())) {
    return false;
  }
  switch (entry.entityType) {
    case 'card':
      return restoreTrashEntry(tx, clock, entryId, options);
    case 'note':
      return restoreNoteEntry(tx, clock, entry, options);
    case 'topic':
      return restoreTopicEntry(tx, clock, entry, options);
    case 'inbox':
      return restoreInboxEntry(tx, clock, entry, options);
    default:
      return false;
  }
}

// Elimina para siempre lo que guarda la entrada y anota la operación «purge». El historial
// (observaciones, evaluaciones y operaciones) queda.
export function purgeAnyEntry(tx: Writer, clock: Clock, entry: Entry, source: EventSource): void {
  const finish = (entityType: 'note' | 'topic' | 'inbox') => {
    markPurged(tx, clock, entry.id);
    appendOperation(tx, clock, {
      kind: `${entityType}.purge`,
      entityType,
      entityId: entry.entityId,
      trashEntryId: entry.id,
      source,
    });
  };
  switch (entry.entityType) {
    case 'card':
      purgeTrashEntry(tx, clock, entry, source);
      return;
    case 'note':
      purgeNoteRows(tx, entry.entityId);
      finish('note');
      return;
    case 'topic':
      purgeTopicRows(tx, entry.entityId);
      finish('topic');
      return;
    case 'inbox':
      purgeInboxRow(tx, entry.entityId);
      finish('inbox');
      return;
    default:
      return;
  }
}
