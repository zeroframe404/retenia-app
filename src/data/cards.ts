import { count, desc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { type Grade, verdictOfGrade } from '../core/memory';
import { studyDayOf } from '../core/study-day';
import type { Card, CardHistory } from '../preload/contract/cards';
import {
  activeCard,
  CardNotFoundError,
  cardOf,
  findCard,
  selectCards,
  toCard,
  trashCard,
} from './content';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendEvaluation, appendObservation, appendOperation, type EventSource } from './ledger';
import { cardHistory, recomputeCardSchedule } from './projections';
import { cards, cardVersions, operations } from './schema';

export { CardNotFoundError };

export interface CardsStore {
  create(input: { question: string; answer: string }, options?: { source?: EventSource }): Card;
  list(): Card[];
  review(input: { cardId: string; grade: Grade; attemptId: string }): Card;
  edit(input: { cardId: string; question: string; answer: string }): Card;
  // «Eliminar»: a la Papelera por 30 días.
  remove(input: { cardId: string }): { trashEntryId: string };
  history(input: { cardId: string }): CardHistory;
  count(): number;
  // Nunca tuvo tarjetas ni cambios: recién ahí se siembra el ejemplo de la demostración.
  isPristine(): boolean;
}

// Cada cambio pasa por el libro mayor: el alta, la edición, el borrado y el repaso agregan
// eventos, y la agenda se recalcula desde el historial en la misma transacción (un corte deja
// todo o nada). Los repasos usan el reloj inyectado: en la variante de prueba, el de la
// demostración.
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

    isPristine() {
      const operationCount = orm.select({ total: count() }).from(operations).get()?.total ?? 0;
      return this.count() === 0 && operationCount === 0;
    },
  };
}
