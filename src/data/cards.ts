import { and, count, desc, eq, isNull } from 'drizzle-orm';
import {
  matchesFilter,
  mergeSheet,
  needsMeaningQuestion,
  normalizeSheet,
  type Sheet,
  USER_SHEET_STATES,
} from '../core/cards';
import type { Clock } from '../core/clock';
import { type Grade, verdictOfGrade } from '../core/memory';
import { canonicalJson } from '../core/organization';
import { studyDayOf } from '../core/study-day';
import type {
  Card,
  CardDetail,
  CardHistory,
  CardSheetInput,
  SheetStateValue,
} from '../preload/contract/cards';
import {
  InverseNotAllowedError,
  LinkedCardTextError,
  MeaningQuestionRequiredError,
  SheetStateNotAllowedError,
} from './card-errors';
import {
  activeCard,
  CardNotFoundError,
  type CardRow,
  cardOf,
  findCard,
  hasHistoryOf,
  parseContent,
  selectCards,
  sheetOf,
  toCard,
  trashCard,
} from './content';
import type { ReteniaDatabase } from './database';
import { plantCard, plantHistoryOf, type SeedCard, type SeedReview } from './demo-cards';
import { newId } from './ids';
import { appendEvaluation, appendObservation, appendOperation, type EventSource } from './ledger';
import { SubjectNotFoundError, TopicNotFoundError } from './organization-errors';
import type { Writer } from './orm';
import { cardHistory, recomputeCardSchedule } from './projections';
import {
  blocks,
  cards,
  cardVersions,
  notes,
  observations,
  operations,
  subjects,
  topics,
} from './schema';

export { CardNotFoundError };

// El mismo intento llegó con otra tarjeta: no es un repaso repetido, es un pedido equivocado.
class AttemptConflictError extends Error {
  constructor() {
    super('Ese repaso ya se guardó con otra tarjeta');
    this.name = 'AttemptConflictError';
  }
}

export interface ListInput {
  subjectId?: string | undefined;
  topicId?: string | undefined;
  sheetState?: SheetStateValue | undefined;
  kind?: 'qa' | 'cloze' | undefined;
}

export interface CardsStore {
  create(
    input: {
      question: string;
      answer: string;
      subjectId?: string | null | undefined;
      topicId?: string | null | undefined;
    },
    options?: { source?: EventSource },
  ): Card;
  list(input?: ListInput): Card[];
  // La lista filtrada y cuántas tiene la materia sin filtrar.
  listWithTotal(input?: ListInput): { cards: Card[]; total: number };
  get(input: { cardId: string }): CardDetail;
  review(input: { cardId: string; grade: Grade; attemptId: string }): Card;
  // Editar la tarjeta y su ficha. Con historial, cambiar la pregunta o la respuesta exige contestar
  // «¿Cambió lo que hay que recordar?» (`meaningChanged`).
  edit(input: {
    cardId: string;
    question: string;
    answer: string;
    sheet?: CardSheetInput | undefined;
    meaningChanged?: boolean | undefined;
  }): CardDetail;
  // Después de un cambio hecho en la nota: la tarjeta se programa como nueva.
  markMeaningChanged(input: { cardId: string }): Card;
  setPaused(input: { cardId: string; paused: boolean }): Card;
  // «Crear inversa»: una hermana con la pregunta y la respuesta cambiadas.
  createInverse(input: { cardId: string }): { card: Card; created: boolean };
  // «Eliminar»: a la Papelera por 30 días.
  remove(input: { cardId: string }): { trashEntryId: string };
  history(input: { cardId: string }): CardHistory;
  count(): number;
  // Solo para la demostración: tarjetas sueltas con su historial, y el historial de una que nació
  // en una nota. Devuelven cuántas tarjetas hay después.
  plantCast(entries: readonly SeedCard[]): number;
  plantHistory(
    entries: readonly { cardId: string; createdAt: Date; reviews: readonly SeedReview[] }[],
  ): void;
  // ¿Hay alguna tarjeta que escribiste en Tarjetas (no nacida en una nota)?
  hasManualCards(): boolean;
  // Nunca tuvo tarjetas ni cambios: recién ahí se siembra el ejemplo de la demostración.
  isPristine(): boolean;
}

function assertPlace(tx: Writer, subjectId: string | null, topicId: string | null): void {
  if (subjectId !== null) {
    const subject = tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)))
      .get();
    if (!subject) {
      throw new SubjectNotFoundError();
    }
  }
  if (topicId !== null) {
    const topic = tx.select().from(topics).where(eq(topics.id, topicId)).get();
    if (!topic || topic.deletedAt !== null || topic.subjectId !== subjectId) {
      throw new TopicNotFoundError();
    }
  }
}

function listCards(db: Writer, input: ListInput): { cards: Card[]; total: number } {
  const rows = selectCards(db)
    .where(
      input.subjectId === undefined
        ? isNull(cards.deletedAt)
        : and(isNull(cards.deletedAt), eq(cards.subjectId, input.subjectId)),
    )
    .orderBy(desc(cards.createdAt), desc(cards.id))
    .all();
  const filter = {
    topicId: input.topicId,
    sheetState: input.sheetState,
    kind: input.kind,
  };
  const shown = rows.map(toCard).filter((card) => matchesFilter(card, filter));
  return { cards: shown, total: rows.length };
}

function detailOf(db: Writer, row: CardRow): CardDetail {
  const subject =
    row.subjectId === null
      ? undefined
      : db
          .select({ name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, row.subjectId))
          .get();
  const note =
    row.noteId === null
      ? undefined
      : db
          .select({ id: notes.id, title: notes.title, deletedAt: notes.deletedAt })
          .from(notes)
          .where(eq(notes.id, row.noteId))
          .get();
  const block =
    row.blockId === null
      ? undefined
      : db
          .select({ deletedAt: blocks.deletedAt })
          .from(blocks)
          .where(eq(blocks.id, row.blockId))
          .get();
  const canOpenNote =
    row.detachedAt === null &&
    note !== undefined &&
    note.deletedAt === null &&
    block !== undefined &&
    block.deletedAt === null;
  const inverse = db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.inverseOfCardId, row.id), isNull(cards.deletedAt)))
    .get();
  return {
    ...toCard(row),
    questionContent: parseContent(row.questionContent) ?? [{ type: 'text', text: row.question }],
    answerContent: parseContent(row.answerContent) ?? [{ type: 'text', text: row.answer }],
    sheet: sheetOf(row),
    path: {
      subjectName: subject?.name ?? null,
      topicName: row.topicName,
      noteTitle: canOpenNote ? (note?.title ?? null) : null,
      noteId: canOpenNote ? row.noteId : null,
      blockId: canOpenNote ? row.blockId : null,
      canOpenNote,
    },
    siblingGroupId: row.siblingGroupId,
    inverseOfCardId: row.inverseOfCardId,
    hasInverse: inverse !== undefined,
    linked: row.origin === 'note' && canOpenNote,
    hasHistory: hasHistoryOf(db, row.id),
  };
}

// Las listas de la ficha, como se comparan para saber si algo cambió.
const sheetKey = (sheet: Sheet) => canonicalJson(sheet);

// Cada cambio pasa por el libro mayor: el alta, la edición, el borrado y el repaso agregan
// eventos, y la agenda se recalcula desde el historial en la misma transacción (un corte deja
// todo o nada). Los repasos usan el reloj inyectado: en la variante de prueba, el de la
// demostración.
export function createCardsStore(db: ReteniaDatabase, clock: Clock): CardsStore {
  const { orm } = db;

  // Programa de nuevo como nueva una tarjeta con historial: un evento «cambió lo que hay que
  // recordar» de la versión que quedó vigente.
  function resetAsNew(tx: Writer, cardId: string, versionId: string): void {
    appendObservation(tx, clock, {
      kind: 'card.meaning_changed',
      payload: { cardId, versionId },
      idempotencyKey: `meaning:${versionId}`,
      source: 'user',
    });
    recomputeCardSchedule(tx, cardId);
  }

  return {
    create({ question, answer, subjectId = null, topicId = null }, { source = 'user' } = {}) {
      const now = clock.now().toISOString();
      const cardId = newId();
      const versionId = newId();
      return orm.transaction((tx) => {
        assertPlace(tx, subjectId, topicId);
        tx.insert(cards)
          .values({ id: cardId, currentVersionId: versionId, createdAt: now, subjectId, topicId })
          .run();
        tx.insert(cardVersions)
          .values({ id: versionId, cardId, question, answer, createdAt: now, cause: 'edit' })
          .run();
        recomputeCardSchedule(tx, cardId);
        appendOperation(tx, clock, {
          kind: 'card.create',
          entityId: cardId,
          versionAfterId: versionId,
          source,
        });
        return cardOf(tx, cardId);
      });
    },

    list(input = {}) {
      return listCards(orm, input).cards;
    },

    listWithTotal(input = {}) {
      return listCards(orm, input);
    },

    get({ cardId }) {
      return detailOf(orm, activeCard(orm, cardId));
    },

    review({ cardId, grade, attemptId }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        const observation = appendObservation(tx, clock, {
          kind: 'review.graded',
          payload: {
            cardId,
            grade,
            helpLevel: 'A0',
            dueAtThen: current.dueAt,
            versionId: current.versionId,
          },
          idempotencyKey: `review:${attemptId}`,
          source: 'user',
        });
        if (observation.inserted) {
          appendEvaluation(tx, clock, {
            attemptId: observation.id,
            verdict: verdictOfGrade(grade),
            source: 'user',
          });
          recomputeCardSchedule(tx, cardId);
        } else {
          // Un repaso repetido vale solo si es de la misma tarjeta.
          const saved = tx
            .select({ cardId: observations.cardId })
            .from(observations)
            .where(eq(observations.id, observation.id))
            .get();
          if (saved?.cardId !== cardId) {
            throw new AttemptConflictError();
          }
        }
        return cardOf(tx, cardId);
      });
    },

    edit({ cardId, question, answer, sheet, meaningChanged }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        const currentSheet = sheetOf(current);
        const patch = normalizeSheet(sheet ?? {});
        if (patch.state !== undefined && !USER_SHEET_STATES.some((s) => s === patch.state)) {
          throw new SheetStateNotAllowedError();
        }
        const nextSheet: Sheet = mergeSheet(currentSheet, patch);
        const textChanged = current.question !== question || current.answer !== answer;
        const sheetChanged = sheetKey(currentSheet) !== sheetKey(nextSheet);
        if (!textChanged && !sheetChanged) {
          return detailOf(tx, current);
        }
        const tiedToRow = current.origin === 'note' && current.detachedAt === null;
        if (textChanged && tiedToRow) {
          throw new LinkedCardTextError();
        }
        const hasHistory = hasHistoryOf(tx, cardId);
        if (
          needsMeaningQuestion(current, { question, answer }, hasHistory) &&
          meaningChanged === undefined
        ) {
          throw new MeaningQuestionRequiredError();
        }
        const previous = tx
          .select()
          .from(cardVersions)
          .where(eq(cardVersions.id, current.versionId))
          .get();
        if (!previous) {
          throw new CardNotFoundError();
        }
        const versionId = newId();
        tx.insert(cardVersions)
          .values({
            ...previous,
            id: versionId,
            question,
            answer,
            // El texto escrito a mano reemplaza al contenido con imágenes de antes.
            questionContent: textChanged ? null : previous.questionContent,
            answerContent: textChanged ? null : previous.answerContent,
            referenceAnswer: nextSheet.referenceAnswer,
            variants: JSON.stringify(nextSheet.variants),
            essentials: JSON.stringify(nextSheet.essentials),
            hints: JSON.stringify(nextSheet.hints),
            explanation: nextSheet.explanation,
            sourceText: nextSheet.source,
            formType: nextSheet.formType,
            sheetState: nextSheet.state,
            createdAt: clock.now().toISOString(),
            cause: 'edit',
          })
          .run();
        tx.update(cards).set({ currentVersionId: versionId }).where(eq(cards.id, cardId)).run();
        appendOperation(tx, clock, {
          kind: 'card.edit',
          entityId: cardId,
          versionBeforeId: current.versionId,
          versionAfterId: versionId,
          source: 'user',
        });
        if (meaningChanged === true && textChanged && hasHistory) {
          resetAsNew(tx, cardId, versionId);
        }
        return detailOf(tx, activeCard(tx, cardId));
      });
    },

    markMeaningChanged({ cardId }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        if (hasHistoryOf(tx, cardId)) {
          resetAsNew(tx, cardId, current.versionId);
        }
        return cardOf(tx, cardId);
      });
    },

    setPaused({ cardId, paused }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        if ((current.pausedAt !== null) !== paused) {
          tx.update(cards)
            .set({ pausedAt: paused ? clock.now().toISOString() : null })
            .where(eq(cards.id, cardId))
            .run();
        }
        return cardOf(tx, cardId);
      });
    },

    createInverse({ cardId }) {
      return orm.transaction((tx) => {
        const original = activeCard(tx, cardId);
        if (original.kind === 'cloze') {
          throw new InverseNotAllowedError();
        }
        const existing = tx
          .select({ id: cards.id })
          .from(cards)
          .where(and(eq(cards.inverseOfCardId, cardId), isNull(cards.deletedAt)))
          .get();
        if (existing) {
          return { card: cardOf(tx, existing.id), created: false };
        }
        const groupId = original.siblingGroupId ?? newId();
        if (original.siblingGroupId === null) {
          tx.update(cards).set({ siblingGroupId: groupId }).where(eq(cards.id, cardId)).run();
        }
        const inverseId = newId();
        const versionId = newId();
        const now = clock.now().toISOString();
        tx.insert(cards)
          .values({
            id: inverseId,
            currentVersionId: versionId,
            createdAt: now,
            subjectId: original.subjectId,
            topicId: original.topicId,
            siblingGroupId: groupId,
            inverseOfCardId: cardId,
          })
          .run();
        tx.insert(cardVersions)
          .values({
            id: versionId,
            cardId: inverseId,
            question: original.answer,
            answer: original.question,
            questionContent: original.answerContent,
            answerContent: original.questionContent,
            createdAt: now,
            cause: 'edit',
          })
          .run();
        recomputeCardSchedule(tx, inverseId);
        appendOperation(tx, clock, {
          kind: 'card.create',
          entityId: inverseId,
          versionAfterId: versionId,
          source: 'user',
        });
        return { card: cardOf(tx, inverseId), created: true };
      });
    },

    remove({ cardId }) {
      return orm.transaction((tx) => trashCard(tx, clock, cardId, { source: 'user' }));
    },

    history({ cardId }) {
      const row = findCard(orm, cardId);
      if (!row) {
        throw new CardNotFoundError();
      }
      return {
        question: row.question,
        entries: cardHistory(orm, cardId).map((event) => ({
          id: event.id,
          day: studyDayOf(event.occurredAt),
          result: event.result,
        })),
      };
    },

    count() {
      return orm.select({ total: count() }).from(cards).get()?.total ?? 0;
    },

    plantCast(entries) {
      orm.transaction((tx) => {
        for (const entry of entries) {
          plantCard(tx, clock, entry);
        }
      });
      return this.count();
    },

    plantHistory(entries) {
      orm.transaction((tx) => {
        for (const entry of entries) {
          plantHistoryOf(tx, clock, entry.cardId, entry.createdAt, entry.reviews);
        }
      });
    },

    hasManualCards() {
      return (
        orm.select({ id: cards.id }).from(cards).where(eq(cards.origin, 'manual')).get() !==
        undefined
      );
    },

    isPristine() {
      const operationCount = orm.select({ total: count() }).from(operations).get()?.total ?? 0;
      return this.count() === 0 && operationCount === 0;
    },
  };
}
