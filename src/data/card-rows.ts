import { and, eq, isNull } from 'drizzle-orm';
import {
  type CardSpec,
  type ExistingRowCard,
  plainOfContent,
  type RowContent,
  reconcileRowCards,
  rowCardSpecs,
} from '../core/cards';
import type { Clock } from '../core/clock';
import { canonicalJson } from '../core/organization';
import { texts } from '../preload/contract/texts';
import { hasHistoryOf, parseContent, restoreTrashEntry, trashCard } from './content';
import { newId } from './ids';
import { appendOperation, type EventSource } from './ledger';
import type { Writer } from './orm';
import { recomputeCardSchedule } from './projections';
import { cards, cardVersions, notes, topics, trashEntries } from './schema';

// Las tarjetas que nacen en un renglón (H-12). Cada vez que se guarda una nota, los renglones que
// cambiaron se comparan con las tarjetas que ya tienen: la tarjeta es «la del renglón» o «la del
// hueco» (por su identificador), nunca la que coincide por texto. Editar el renglón edita la
// tarjeta con una versión nueva; sacarle la marca o borrarlo la suelta. Todo va en la misma
// transacción que el guardado de la nota, y sus operaciones son del sistema (no aparecen en
// «Actividad reciente»: el cambio es tuyo en la nota, no en la tarjeta).

interface RowCardNotice {
  cardId: string;
  question: string;
}

export interface RowCardsResult {
  // Perdieron su renglón y tienen historial: queda por preguntar qué hacer.
  lostCards: RowCardNotice[];
  // Cambiaron de texto y tienen historial: queda por preguntar si cambió lo que hay que recordar.
  editedCards: RowCardNotice[];
}

// Un contenido sin imágenes ni huecos guardado como texto plano se lee como un solo texto.
const plainContent = (text: string): RowContent => [{ type: 'text', text }];

function storedContent(json: string | null, fallback: string): RowContent {
  return parseContent(json) ?? plainContent(fallback);
}

// El texto de un lado de la tarjeta. Un lado que es solo una imagen se llama como la imagen (o «Imagen
// de la nota»): nunca queda vacío, así la lista y las preguntas tienen qué mostrar.
function sideText(content: RowContent): string {
  const text = plainOfContent(content).trim();
  if (text !== '') {
    return text;
  }
  const image = content.find((node) => node.type === 'image');
  return image?.type === 'image' && image.alt.trim() !== ''
    ? image.alt.trim()
    : texts.notes.editor.imageAlt;
}

function contentJson(content: RowContent): string {
  return canonicalJson(content);
}

function existingCardsOf(tx: Writer, blockId: string) {
  return tx
    .select({
      id: cards.id,
      clozeId: cards.clozeId,
      deletedAt: cards.deletedAt,
      detachedAt: cards.detachedAt,
      versionId: cardVersions.id,
      question: cardVersions.question,
      answer: cardVersions.answer,
      questionContent: cardVersions.questionContent,
      answerContent: cardVersions.answerContent,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .where(eq(cards.blockId, blockId))
    .all();
}

// Una versión nueva con el texto nuevo y toda la ficha de la anterior.
function writeNoteVersion(
  tx: Writer,
  clock: Clock,
  cardId: string,
  spec: CardSpec,
  source: EventSource,
): string {
  const current = tx
    .select()
    .from(cardVersions)
    .innerJoin(cards, eq(cards.currentVersionId, cardVersions.id))
    .where(eq(cards.id, cardId))
    .get();
  if (!current) {
    throw new Error('No encontré la versión de la tarjeta');
  }
  const versionId = newId();
  tx.insert(cardVersions)
    .values({
      ...current.card_versions,
      id: versionId,
      question: sideText(spec.question),
      answer: sideText(spec.answer),
      questionContent: contentJson(spec.question),
      answerContent: contentJson(spec.answer),
      createdAt: clock.now().toISOString(),
      cause: 'note',
    })
    .run();
  tx.update(cards).set({ currentVersionId: versionId }).where(eq(cards.id, cardId)).run();
  appendOperation(tx, clock, {
    kind: 'card.edit',
    entityId: cardId,
    versionBeforeId: current.card_versions.id,
    versionAfterId: versionId,
    source,
  });
  return versionId;
}

function createFromRow(
  tx: Writer,
  clock: Clock,
  note: { id: string; subjectId: string; topicId: string | null },
  blockId: string,
  spec: CardSpec,
  source: EventSource,
): void {
  const cardId = newId();
  const versionId = newId();
  const now = clock.now().toISOString();
  tx.insert(cards)
    .values({
      id: cardId,
      currentVersionId: versionId,
      createdAt: now,
      subjectId: note.subjectId,
      topicId: note.topicId,
      noteId: note.id,
      blockId,
      clozeId: spec.clozeId,
      kind: spec.kind,
      origin: 'note',
      siblingGroupId: spec.kind === 'cloze' ? blockId : null,
    })
    .run();
  tx.insert(cardVersions)
    .values({
      id: versionId,
      cardId,
      question: sideText(spec.question),
      answer: sideText(spec.answer),
      questionContent: contentJson(spec.question),
      answerContent: contentJson(spec.answer),
      createdAt: now,
      cause: 'note',
    })
    .run();
  recomputeCardSchedule(tx, cardId);
  appendOperation(tx, clock, {
    kind: 'card.create',
    entityId: cardId,
    versionAfterId: versionId,
    source,
  });
}

// La entrada vigente de la Papelera de una tarjeta, si está ahí.
function pendingTrashEntryId(tx: Writer, cardId: string): string | null {
  return (
    tx
      .select({ id: trashEntries.id })
      .from(trashEntries)
      .where(
        and(
          eq(trashEntries.entityType, 'card'),
          eq(trashEntries.entityId, cardId),
          isNull(trashEntries.restoredAt),
          isNull(trashEntries.purgedAt),
        ),
      )
      .get()?.id ?? null
  );
}

// Reconcilia las tarjetas de los renglones que se tocaron. `rows` trae el contenido nuevo de cada
// uno; un renglón borrado va con contenido vacío.
export function syncRowCards(
  tx: Writer,
  clock: Clock,
  noteId: string,
  rows: readonly { id: string; content: RowContent }[],
  source: EventSource = 'system',
): RowCardsResult {
  const result: RowCardsResult = { lostCards: [], editedCards: [] };
  if (rows.length === 0) {
    return result;
  }
  const note = tx.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) {
    return result;
  }
  const liveTopic =
    note.topicId === null
      ? null
      : (tx
          .select({ id: topics.id })
          .from(topics)
          .where(and(eq(topics.id, note.topicId), isNull(topics.deletedAt)))
          .get()?.id ?? null);
  const place = { id: note.id, subjectId: note.subjectId, topicId: liveTopic };

  for (const row of rows) {
    const existing = existingCardsOf(tx, row.id);
    const specs = rowCardSpecs(row.content);
    if (existing.length === 0 && specs.length === 0) {
      continue;
    }
    const byId = new Map(existing.map((card) => [card.id, card]));
    const known: ExistingRowCard[] = existing.map((card) => ({
      cardId: card.id,
      clozeId: card.clozeId,
      question: storedContent(card.questionContent, card.question),
      answer: storedContent(card.answerContent, card.answer),
      trashed: card.deletedAt !== null,
      detached: card.detachedAt !== null,
      hasHistory: hasHistoryOf(tx, card.id),
    }));
    const plan = reconcileRowCards(known, specs);

    for (const spec of plan.create) {
      createFromRow(tx, clock, place, row.id, spec, source);
    }
    for (const { cardId, spec } of plan.update) {
      writeNoteVersion(tx, clock, cardId, spec, source);
      if (hasHistoryOf(tx, cardId)) {
        result.editedCards.push({ cardId, question: sideText(spec.question) });
      }
    }
    for (const { cardId, spec } of plan.reattach) {
      const card = byId.get(cardId);
      tx.update(cards).set({ detachedAt: null }).where(eq(cards.id, cardId)).run();
      if (card?.deletedAt !== null) {
        const entry = pendingTrashEntryId(tx, cardId);
        if (entry !== null) {
          restoreTrashEntry(tx, clock, entry, { source });
        }
      }
      const before = known.find((item) => item.cardId === cardId);
      if (
        before &&
        (contentJson(before.question) !== contentJson(spec.question) ||
          contentJson(before.answer) !== contentJson(spec.answer))
      ) {
        writeNoteVersion(tx, clock, cardId, spec, source);
        if (hasHistoryOf(tx, cardId)) {
          result.editedCards.push({ cardId, question: sideText(spec.question) });
        }
      }
    }
    for (const { cardId, hasHistory } of plan.lost) {
      tx.update(cards)
        .set({ detachedAt: clock.now().toISOString() })
        .where(eq(cards.id, cardId))
        .run();
      if (hasHistory) {
        result.lostCards.push({ cardId, question: byId.get(cardId)?.question ?? '' });
      } else {
        trashCard(tx, clock, cardId, { source });
      }
    }
  }
  return result;
}

// Las tarjetas de una nota siguen a su tema cuando la nota cambia de tema.
export function moveNoteCards(tx: Writer, noteId: string, topicId: string | null): void {
  tx.update(cards).set({ topicId }).where(eq(cards.noteId, noteId)).run();
}
