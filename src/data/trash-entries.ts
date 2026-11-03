import { and, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { isTrashExpired, trashExpiry } from '../core/trash';
import { newId } from './ids';
import type { Writer } from './orm';
import { trashEntries } from './schema';

// Las entradas de la Papelera de notas, temas y Bandeja: iguales a las de las tarjetas (30 días,
// restaurar o vaciar), solo cambia la clase de cosa que guardan.

export type OrganizationEntity = 'note' | 'topic' | 'inbox';

// Manda algo a la Papelera por 30 días y devuelve el identificador de la entrada.
export function sendToTrash(
  tx: Writer,
  clock: Clock,
  entityType: OrganizationEntity,
  entityId: string,
): string {
  const now = clock.now();
  const id = newId();
  tx.insert(trashEntries)
    .values({
      id,
      entityType,
      entityId,
      deletedAt: now.toISOString(),
      expiresAt: trashExpiry(now).toISOString(),
    })
    .run();
  return id;
}

// La entrada vigente de algo que está en la Papelera: ni restaurada, ni vaciada, ni vencida (una
// vencida ya no se ve aunque todavía no se haya purgado).
export function activeTrashEntryOf(
  db: Writer,
  entityType: OrganizationEntity,
  entityId: string,
  now: Date,
): { id: string } | undefined {
  const entry = db
    .select()
    .from(trashEntries)
    .where(
      and(
        eq(trashEntries.entityType, entityType),
        eq(trashEntries.entityId, entityId),
        isNull(trashEntries.restoredAt),
        isNull(trashEntries.purgedAt),
      ),
    )
    .get();
  return entry && !isTrashExpired(new Date(entry.expiresAt), now) ? { id: entry.id } : undefined;
}

// Marca la entrada como restaurada.
export function markRestored(tx: Writer, clock: Clock, entryId: string): void {
  tx.update(trashEntries)
    .set({ restoredAt: clock.now().toISOString() })
    .where(eq(trashEntries.id, entryId))
    .run();
}

// Marca la entrada como vaciada.
export function markPurged(tx: Writer, clock: Clock, entryId: string): void {
  tx.update(trashEntries)
    .set({ purgedAt: clock.now().toISOString() })
    .where(eq(trashEntries.id, entryId))
    .run();
}
