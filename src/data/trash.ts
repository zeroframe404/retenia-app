import { and, desc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { localDateTime } from '../core/study-day';
import type { ReteniaDatabase } from './database';
import { purgeAnyEntry, restoreAnyEntry } from './organization-trash';
import { cards, cardVersions, inboxItems, notes, topics, trashEntries } from './schema';

// La Papelera (H-06): lo eliminado espera 30 días. «Restaurar» lo devuelve con su historial;
// «Vaciar papelera» o el vencimiento lo eliminan para siempre (el historial de repasos queda).
// Sirve para tarjetas, notas, temas y elementos de la Bandeja.

interface TrashItem {
  readonly id: string;
  readonly cardId: string;
  readonly question: string;
  // Fechas de calendario de Buenos Aires: cuándo se eliminó y cuándo se elimina para siempre.
  readonly deletedDay: string;
  readonly expiresDay: string;
}

interface TrashOrganizationItem {
  readonly id: string;
  readonly kind: 'note' | 'topic' | 'inbox';
  // El título de la nota (vacío si no tenía), el nombre del tema o el texto de la Bandeja.
  readonly name: string;
  readonly deletedDay: string;
  readonly expiresDay: string;
}

export interface TrashStore {
  // Las tarjetas (no cambia desde la Fase 04).
  list(): TrashItem[];
  // Notas, temas y Bandeja.
  listOrganization(): { items: TrashOrganizationItem[] };
  restore(input: { entryId: string }): { restored: boolean };
  // Vacía todo, de cualquier tipo, y devuelve cuántas entradas eliminó.
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

    listOrganization() {
      const entries = orm
        .select()
        .from(trashEntries)
        .where(
          and(
            pending,
            gt(trashEntries.expiresAt, clock.now().toISOString()),
            inArray(trashEntries.entityType, ['note', 'topic', 'inbox']),
          ),
        )
        .orderBy(desc(trashEntries.deletedAt), desc(trashEntries.id))
        .all();
      const nameOf = (kind: 'note' | 'topic' | 'inbox', entityId: string): string | undefined => {
        switch (kind) {
          case 'note':
            return orm.select({ name: notes.title }).from(notes).where(eq(notes.id, entityId)).get()
              ?.name;
          case 'topic':
            return orm
              .select({ name: topics.name })
              .from(topics)
              .where(eq(topics.id, entityId))
              .get()?.name;
          case 'inbox':
            return orm
              .select({ name: inboxItems.text })
              .from(inboxItems)
              .where(eq(inboxItems.id, entityId))
              .get()?.name;
        }
      };
      return {
        items: entries.flatMap((entry) => {
          const kind = entry.entityType as 'note' | 'topic' | 'inbox';
          const name = nameOf(kind, entry.entityId);
          return name === undefined
            ? []
            : [
                {
                  id: entry.id,
                  kind,
                  name,
                  deletedDay: localDateTime(new Date(entry.deletedAt)).day,
                  expiresDay: localDateTime(new Date(entry.expiresAt)).day,
                },
              ];
        }),
      };
    },

    restore({ entryId }) {
      return {
        restored: orm.transaction((tx) => restoreAnyEntry(tx, clock, entryId, { source: 'user' })),
      };
    },

    empty() {
      return orm.transaction((tx) => {
        const entries = tx.select().from(trashEntries).where(pending).all();
        for (const entry of entries) {
          purgeAnyEntry(tx, clock, entry, 'user');
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
          purgeAnyEntry(tx, clock, entry, 'system');
        }
        return { purged: entries.length };
      });
    },
  };
}
