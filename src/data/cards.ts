import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { type Grade, verdictOfGrade } from '../core/memory';
import { studyDayOf } from '../core/study-day';
import type { Card, CardHistory } from '../preload/contract/cards';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendEvaluation, appendObservation, appendOperation, type EventSource } from './ledger';
import type { Writer } from './orm';
import { cardHistory, recomputeCardSchedule } from './projections';
import { cardSchedule, cards, cardVersions, operations } from './schema';

export class CardNotFoundError extends Error {
  constructor() {
    super('No encontré la tarjeta');
    this.name = 'CardNotFoundError';
  }
}

export interface CardsStore {
  create(input: { question: string; answer: string }, options?: { source?: EventSource }): Card;
  list(): Card[];
  review(input: { cardId: string; grade: Grade; attemptId: string }): Card;
  edit(input: { cardId: string; question: string; answer: string }): Card;
  history(input: { cardId: string }): CardHistory;
  count(): number;
  // Nunca tuvo tarjetas ni cambios: recién ahí se siembra el ejemplo de la demostración.
  isPristine(): boolean;
}

interface Row {
  id: string;
  versionId: string;
  question: string;
  answer: string;
  reps: number;
  dueAt: string;
  deletedAt: string | null;
}

// Mientras no se repasó, la tarjeta no tiene próximo repaso que mostrar.
function toCard(row: Row): Card {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    nextReviewDay: row.reps === 0 ? null : studyDayOf(new Date(row.dueAt)),
  };
}

// La tarjeta con su versión vigente y su agenda.
function selectCards(db: Writer) {
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

function findCard(db: Writer, cardId: string): Row | undefined {
  return selectCards(db).where(eq(cards.id, cardId)).get();
}

// Una tarjeta que está en la lista (no en la Papelera ni eliminada para siempre).
function activeCard(db: Writer, cardId: string): Row {
  const row = selectCards(db)
    .where(and(eq(cards.id, cardId), isNull(cards.deletedAt)))
    .get();
  if (!row) {
    throw new CardNotFoundError();
  }
  return row;
}

function cardOf(db: Writer, cardId: string): Card {
  const row = findCard(db, cardId);
  if (!row) {
    throw new CardNotFoundError();
  }
  return toCard(row);
}

// Cada cambio pasa por el libro mayor: el alta, la edición y el repaso agregan eventos, y la
// agenda se recalcula desde el historial en la misma transacción (un corte deja todo o nada).
// Los repasos usan el reloj inyectado: en la variante de prueba, el de la demostración.
export function createCardsStore(db: ReteniaDatabase, clock: Clock): CardsStore {
  const { orm } = db;

  return {
    create({ question, answer }, { source = 'user' } = {}) {
      const now = clock.now().toISOString();
      const cardId = newId();
      const versionId = newId();
      return orm.transaction((tx) => {
        tx.insert(cards).values({ id: cardId, currentVersionId: versionId, createdAt: now }).run();
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

    list() {
      return selectCards(orm)
        .where(isNull(cards.deletedAt))
        .orderBy(desc(cards.createdAt), desc(cards.id))
        .all()
        .map(toCard);
    },

    review({ cardId, grade, attemptId }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        const observation = appendObservation(tx, clock, {
          kind: 'review.graded',
          payload: { cardId, grade, helpLevel: 'A0', dueAtThen: current.dueAt },
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
        }
        return cardOf(tx, cardId);
      });
    },

    edit({ cardId, question, answer }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        if (current.question === question && current.answer === answer) {
          return toCard(current);
        }
        const versionId = newId();
        tx.insert(cardVersions)
          .values({
            id: versionId,
            cardId,
            question,
            answer,
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
        return cardOf(tx, cardId);
      });
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

    isPristine() {
      const operationCount = orm.select({ total: count() }).from(operations).get()?.total ?? 0;
      return this.count() === 0 && operationCount === 0;
    },
  };
}
