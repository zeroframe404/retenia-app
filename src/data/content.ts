import { and, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import { isTrashExpired, trashExpiry } from '../core/trash';
import type { CardState } from '../core/undo';
import type { Card } from '../preload/contract/cards';
import { newId } from './ids';
import { appendOperation, type EventSource } from './ledger';
import type { Writer } from './orm';
import { cardSchedule, cards, cardVersions, purgePermits, trashEntries } from './schema';

// El contenido de una tarjeta y sus cambios: cada uno agrega una operación al registro de
// «Actividad reciente». Eliminar no borra nada (va a la Papelera); solo vaciarla o el vencimiento
// de 30 días eliminan el contenido, y nunca un evento del historial.

export class CardNotFoundError extends Error {
  constructor() {
    super('No encontré la tarjeta');
    this.name = 'CardNotFoundError';
  }
}

export interface CardRow {
  id: string;
  versionId: string;
  question: string;
  answer: string;
  reps: number;
  dueAt: string;
  deletedAt: string | null;
}

// Mientras no se repasó, la tarjeta no tiene próximo repaso que mostrar.
export function toCard(row: CardRow): Card {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    nextReviewDay: row.reps === 0 ? null : studyDayOf(new Date(row.dueAt)),
  };
}

// La tarjeta con su versión vigente y su agenda.
export function selectCards(db: Writer) {
  return db
    .select({
      id: cards.id,
      versionId: cardVersions.id,
      question: cardVersions.question,
      answer: cardVersions.answer,
      reps: cardSchedule.reps,
      dueAt: cardSchedule.dueAt,
      deletedAt: cards.deletedAt,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id));
}

export function findCard(db: Writer, cardId: string): CardRow | undefined {
  return selectCards(db).where(eq(cards.id, cardId)).get();
}

// Una tarjeta que está en la lista (no en la Papelera ni eliminada para siempre).
export function activeCard(db: Writer, cardId: string): CardRow {
  const row = selectCards(db)
    .where(and(eq(cards.id, cardId), isNull(cards.deletedAt)))
    .get();
  if (!row) {
    throw new CardNotFoundError();
  }
  return row;
}

export function cardOf(db: Writer, cardId: string): Card {
  const row = findCard(db, cardId);
  if (!row) {
    throw new CardNotFoundError();
  }
  return toCard(row);
}

// La entrada vigente de la Papelera de una tarjeta: ni restaurada, ni vaciada, ni vencida (una
// vencida ya no se ve aunque todavía no se haya purgado).
function activeTrashEntryOf(db: Writer, cardId: string, now: Date) {
  const entry = db
    .select()
    .from(trashEntries)
    .where(
      and(
        eq(trashEntries.entityType, 'card'),
        eq(trashEntries.entityId, cardId),
        isNull(trashEntries.restoredAt),
        isNull(trashEntries.purgedAt),
      ),
    )
    .get();
  return entry && !isTrashExpired(new Date(entry.expiresAt), now) ? entry : undefined;
}

// Cómo está una tarjeta, para saber si un cambio todavía se puede deshacer.
export function cardState(db: Writer, cardId: string, now: Date): CardState {
  const row = findCard(db, cardId);
  if (!row) {
    return { status: 'gone', content: null, activeTrashEntryId: null };
  }
  const content = { question: row.question, answer: row.answer };
  if (row.deletedAt === null) {
    return { status: 'active', content, activeTrashEntryId: null };
  }
  return {
    status: 'trashed',
    content,
    activeTrashEntryId: activeTrashEntryOf(db, cardId, now)?.id ?? null,
  };
}

export function versionContent(
  db: Writer,
  versionId: string | null,
): { question: string; answer: string } | null {
  if (versionId === null) {
    return null;
  }
  return (
    db
      .select({ question: cardVersions.question, answer: cardVersions.answer })
      .from(cardVersions)
      .where(eq(cardVersions.id, versionId))
      .get() ?? null
  );
}

// «Eliminar»: a la Papelera por 30 días. La agenda y el historial quedan como estaban.
export function trashCard(
  tx: Writer,
  clock: Clock,
  cardId: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): { trashEntryId: string } {
  const current = activeCard(tx, cardId);
  const now = clock.now();
  const trashEntryId = newId();
  tx.insert(trashEntries)
    .values({
      id: trashEntryId,
      entityType: 'card',
      entityId: cardId,
      deletedAt: now.toISOString(),
      expiresAt: trashExpiry(now).toISOString(),
    })
    .run();
  tx.update(cards).set({ deletedAt: now.toISOString() }).where(eq(cards.id, cardId)).run();
  appendOperation(tx, clock, {
    kind: 'card.delete',
    entityId: cardId,
    versionBeforeId: current.versionId,
    versionAfterId: current.versionId,
    trashEntryId,
    undoesId,
    source,
  });
  return { trashEntryId };
}

// «Restaurar» desde la Papelera: vuelve a la lista con su historial y su agenda. Devuelve si
// restauró (una entrada ya restaurada, vaciada o vencida no cambia nada).
export function restoreTrashEntry(
  tx: Writer,
  clock: Clock,
  entryId: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): boolean {
  const now = clock.now();
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
  if (!entry || isTrashExpired(new Date(entry.expiresAt), now)) {
    return false;
  }
  const card = findCard(tx, entry.entityId);
  if (!card || card.deletedAt === null) {
    return false;
  }
  tx.update(cards).set({ deletedAt: null }).where(eq(cards.id, card.id)).run();
  tx.update(trashEntries)
    .set({ restoredAt: now.toISOString() })
    .where(eq(trashEntries.id, entry.id))
    .run();
  appendOperation(tx, clock, {
    kind: 'card.restore',
    entityId: card.id,
    versionBeforeId: card.versionId,
    versionAfterId: card.versionId,
    trashEntryId: entry.id,
    undoesId,
    source,
  });
  return true;
}

// Eliminar para siempre lo que está en la Papelera: la agenda, las versiones (con el permiso que
// piden los disparadores, que vive solo dentro de esta transacción) y la tarjeta. Las
// observaciones, las evaluaciones y las operaciones que la nombran quedan.
export function purgeTrashEntry(
  tx: Writer,
  clock: Clock,
  entry: typeof trashEntries.$inferSelect,
  source: EventSource,
): void {
  const card = tx
    .select({ versionId: cards.currentVersionId })
    .from(cards)
    .where(eq(cards.id, entry.entityId))
    .get();
  if (card) {
    tx.delete(cardSchedule).where(eq(cardSchedule.cardId, entry.entityId)).run();
    tx.insert(purgePermits).values({ entityType: 'card', entityId: entry.entityId }).run();
    tx.delete(cardVersions).where(eq(cardVersions.cardId, entry.entityId)).run();
    tx.delete(purgePermits)
      .where(and(eq(purgePermits.entityType, 'card'), eq(purgePermits.entityId, entry.entityId)))
      .run();
    tx.delete(cards).where(eq(cards.id, entry.entityId)).run();
  }
  tx.update(trashEntries)
    .set({ purgedAt: clock.now().toISOString() })
    .where(eq(trashEntries.id, entry.id))
    .run();
  appendOperation(tx, clock, {
    kind: 'card.purge',
    entityId: entry.entityId,
    versionBeforeId: card?.versionId ?? null,
    trashEntryId: entry.id,
    source,
  });
}

// Deshacer una edición: una versión nueva igual a la que había (nunca se reescribe la vieja).
export function restoreVersion(
  tx: Writer,
  clock: Clock,
  cardId: string,
  versionId: string,
  { undoesId }: { undoesId: string },
): void {
  const current = activeCard(tx, cardId);
  const content = versionContent(tx, versionId);
  if (content === null) {
    throw new CardNotFoundError();
  }
  const restoredId = newId();
  tx.insert(cardVersions)
    .values({
      id: restoredId,
      cardId,
      question: content.question,
      answer: content.answer,
      createdAt: clock.now().toISOString(),
      cause: 'undo',
    })
    .run();
  tx.update(cards).set({ currentVersionId: restoredId }).where(eq(cards.id, cardId)).run();
  appendOperation(tx, clock, {
    kind: 'card.edit',
    entityId: cardId,
    versionBeforeId: current.versionId,
    versionAfterId: restoredId,
    undoesId,
    source: 'user',
  });
}
