import { and, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { localDateTime } from '../core/study-day';
import { purgeTrashEntry, restoreTrashEntry } from './content';
import type { ReteniaDatabase } from './database';
import { cards, cardVersions, trashEntries } from './schema';

// La Papelera (H-06): lo eliminado espera 30 días. «Restaurar» lo devuelve con su historial;
// «Vaciar papelera» o el vencimiento lo eliminan para siempre (el historial de repasos queda).

interface TrashItem {
  readonly id: string;
  readonly cardId: string;
  readonly question: string;
  // Fechas de calendario de Buenos Aires: cuándo se eliminó y cuándo se elimina para siempre.
  readonly deletedDay: string;
  readonly expiresDay: string;
}

export interface TrashStore {
  list(): TrashItem[];
  restore(input: { entryId: string }): { restored: boolean };
  empty(): { purged: number };
  // Al abrir (después de la copia automática): elimina lo que ya cumplió 30 días.
  purgeExpired(): { purged: number };
}

const pending = and(isNull(trashEntries.restoredAt), isNull(trashEntries.purgedAt));

export function createTrashStore(db: ReteniaDatabase, clock: Clock): TrashStore {
  const { orm } = db;

  return {
    // Lo vencido deja de verse aunque todavía no se haya eliminado.
    list() {
      return orm
        .select({
          id: trashEntries.id,
          cardId: trashEntries.entityId,
          question: cardVersions.question,
          deletedAt: trashEntries.deletedAt,
          expiresAt: trashEntries.expiresAt,
        })
        .from(trashEntries)
        .innerJoin(cards, eq(cards.id, trashEntries.entityId))
        .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
        .where(and(pending, gt(trashEntries.expiresAt, clock.now().toISOString())))
        .orderBy(desc(trashEntries.deletedAt), desc(trashEntries.id))
        .all()
        .map((row) => ({
          id: row.id,
          cardId: row.cardId,
          question: row.question,
          deletedDay: localDateTime(new Date(row.deletedAt)).day,
          expiresDay: localDateTime(new Date(row.expiresAt)).day,
        }));
    },

    restore({ entryId }) {
      return {
        restored: orm.transaction((tx) =>
          restoreTrashEntry(tx, clock, entryId, { source: 'user' }),
        ),
      };
    },

    empty() {
      return orm.transaction((tx) => {
        const entries = tx.select().from(trashEntries).where(pending).all();
        for (const entry of entries) {
          purgeTrashEntry(tx, clock, entry, 'user');
        }
        return { purged: entries.length };
      });
    },

    purgeExpired() {
      return orm.transaction((tx) => {
        const entries = tx
          .select()
          .from(trashEntries)
          .where(and(pending, lte(trashEntries.expiresAt, clock.now().toISOString())))
          .all();
        for (const entry of entries) {
          purgeTrashEntry(tx, clock, entry, 'system');
        }
        return { purged: entries.length };
      });
    },
  };
}
