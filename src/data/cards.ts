import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { type CardMemory, newCardMemory, reviewCard } from '../core/memory';
import { studyDayOf } from '../core/study-day';
import type { Card } from '../preload/contract/cards';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { cardSchedule, cards, cardVersions } from './schema';

export class CardNotFoundError extends Error {
  constructor() {
    super('No encontré la tarjeta');
    this.name = 'CardNotFoundError';
  }
}

export interface CardsStore {
  create(input: { question: string; answer: string }): Card;
  list(): Card[];
  review(input: { cardId: string; grade: 'again' | 'hard' | 'good' }): Card;
  count(): number;
}

interface Row {
  id: string;
  question: string;
  answer: string;
  reps: number;
  dueAt: string;
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

// Los repasos usan el reloj inyectado: en la variante de prueba es siempre el lunes
// 15/03/2027, así las fechas dan lo mismo en cualquier PC.
export function createCardsStore(db: ReteniaDatabase, clock: Clock): CardsStore {
  const { orm } = db;

  // Las tres tablas juntas: la tarjeta, su primera versión y su agenda. Se leen con la versión
  // vigente de cada tarjeta.
  const select = () =>
    orm
      .select({
        id: cards.id,
        question: cardVersions.question,
        answer: cardVersions.answer,
        reps: cardSchedule.reps,
        dueAt: cardSchedule.dueAt,
      })
      .from(cards)
      .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
      .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id));

  return {
    create({ question, answer }) {
      const now = clock.now();
      const cardId = newId();
      const versionId = newId();
      const memory = newCardMemory(now);
      orm.transaction((tx) => {
        tx.insert(cards)
          .values({ id: cardId, currentVersionId: versionId, createdAt: now.toISOString() })
          .run();
        tx.insert(cardVersions)
          .values({
            id: versionId,
            cardId,
            question,
            answer,
            createdAt: now.toISOString(),
            cause: 'edit',
          })
          .run();
        tx.insert(cardSchedule).values(scheduleValues(cardId, memory)).run();
      });
      return toCard({ id: cardId, question, answer, reps: 0, dueAt: memory.dueAt.toISOString() });
    },

    list() {
      return select()
        .where(isNull(cards.deletedAt))
        .orderBy(desc(cards.createdAt), desc(cards.id))
        .all()
        .map(toCard);
    },

    review({ cardId, grade }) {
      return orm.transaction((tx) => {
        const current = tx
          .select()
          .from(cardSchedule)
          .innerJoin(cards, eq(cards.id, cardSchedule.cardId))
          .where(and(eq(cardSchedule.cardId, cardId), isNull(cards.deletedAt)))
          .get();
        if (!current) {
          throw new CardNotFoundError();
        }
        const row = current.card_schedule;
        const next = reviewCard(
          {
            state: row.state,
            stability: row.stability,
            difficulty: row.difficulty,
            dueAt: new Date(row.dueAt),
            lastReviewAt: row.lastReviewAt ? new Date(row.lastReviewAt) : null,
            reps: row.reps,
            lapses: row.lapses,
            scheduledDays: row.scheduledDays,
          },
          grade,
          clock.now(),
          row.retentionTarget,
        );
        tx.update(cardSchedule)
          .set(scheduleValues(cardId, next))
          .where(eq(cardSchedule.cardId, cardId))
          .run();
        const updated = tx
          .select({
            id: cards.id,
            question: cardVersions.question,
            answer: cardVersions.answer,
            reps: cardSchedule.reps,
            dueAt: cardSchedule.dueAt,
          })
          .from(cards)
          .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
          .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id))
          .where(eq(cards.id, cardId))
          .get();
        if (!updated) {
          throw new CardNotFoundError();
        }
        return toCard(updated);
      });
    },

    count() {
      return orm.select({ total: count() }).from(cards).get()?.total ?? 0;
    },
  };
}

function scheduleValues(cardId: string, memory: CardMemory) {
  return {
    cardId,
    state: memory.state,
    stability: memory.stability,
    difficulty: memory.difficulty,
    dueAt: memory.dueAt.toISOString(),
    lastReviewAt: memory.lastReviewAt ? memory.lastReviewAt.toISOString() : null,
    reps: memory.reps,
    lapses: memory.lapses,
    scheduledDays: memory.scheduledDays,
  };
}
