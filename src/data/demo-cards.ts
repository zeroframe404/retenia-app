import { eq } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { type Grade, verdictOfGrade } from '../core/memory';
import { hasHistoryOf } from './content';
import { newId } from './ids';
import { appendEvaluation, appendObservation, appendOperation } from './ledger';
import type { Writer } from './orm';
import { recomputeCardSchedule, reviewFacts } from './projections';
import { cardSchedule, cards, cardVersions } from './schema';

// La siembra del historial de la demostración: repasos de otros días, con origen «demostración».
// Solo la usa la variante de prueba; la versión real no tiene quien la llame.

export interface SeedReview {
  readonly at: Date;
  readonly grade: Grade;
}

export interface SeedCard {
  readonly question: string;
  readonly answer: string;
  readonly kind: 'qa' | 'cloze';
  readonly subjectId: string;
  readonly topicId: string;
  readonly createdAt: Date;
  readonly reviews: readonly SeedReview[];
}

// Los repasos de una tarjeta, en orden: cada uno con la versión que evaluó, y la agenda recalculada
// desde el historial al terminar.
function plantReviews(
  tx: Writer,
  clock: Clock,
  cardId: string,
  reviews: readonly SeedReview[],
): void {
  const card = tx
    .select({ versionId: cards.currentVersionId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .get();
  if (!card) {
    throw new Error('No encontré la tarjeta para sembrarle el historial');
  }
  for (const [index, review] of reviews.entries()) {
    const before = tx
      .select({ dueAt: cardSchedule.dueAt })
      .from(cardSchedule)
      .where(eq(cardSchedule.cardId, cardId))
      .get();
    const observation = appendObservation(tx, clock, {
      kind: 'review.graded',
      payload: {
        cardId,
        grade: review.grade,
        helpLevel: 'A0',
        dueAtThen: before?.dueAt ?? review.at.toISOString(),
        versionId: card.versionId,
        // Lo que decía el motor en ese momento; la demostración nunca lleva variación al azar.
        ...reviewFacts(tx, cardId, review.at, false),
      },
      idempotencyKey: `demo:${cardId}:${index}`,
      source: 'demo',
      occurredAt: review.at,
    });
    appendEvaluation(tx, clock, {
      attemptId: observation.id,
      verdict: verdictOfGrade(review.grade),
      source: 'demo',
    });
    recomputeCardSchedule(tx, cardId);
  }
}

// Una tarjeta suelta del elenco, con su fecha de creación y su historial.
export function plantCard(tx: Writer, clock: Clock, entry: SeedCard): string {
  const cardId = newId();
  const versionId = newId();
  const createdAt = entry.createdAt.toISOString();
  tx.insert(cards)
    .values({
      id: cardId,
      currentVersionId: versionId,
      createdAt,
      subjectId: entry.subjectId,
      topicId: entry.topicId,
      kind: entry.kind,
      clozeId: entry.kind === 'cloze' ? newId() : null,
    })
    .run();
  tx.insert(cardVersions)
    .values({
      id: versionId,
      cardId,
      question: entry.question,
      answer: entry.answer,
      createdAt,
      cause: 'edit',
    })
    .run();
  recomputeCardSchedule(tx, cardId);
  appendOperation(tx, clock, {
    kind: 'card.create',
    entityId: cardId,
    versionAfterId: versionId,
    source: 'demo',
  });
  plantReviews(tx, clock, cardId, entry.reviews);
  return cardId;
}

// Una tarjeta que nació en una nota se hace «vieja» y recibe su historial.
export function plantHistoryOf(
  tx: Writer,
  clock: Clock,
  cardId: string,
  createdAt: Date,
  reviews: readonly SeedReview[],
): void {
  if (hasHistoryOf(tx, cardId)) {
    return;
  }
  tx.update(cards).set({ createdAt: createdAt.toISOString() }).where(eq(cards.id, cardId)).run();
  plantReviews(tx, clock, cardId, reviews);
}
