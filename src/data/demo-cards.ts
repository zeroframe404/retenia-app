import { eq } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { engineSignal, purposeOf } from '../core/evaluation';
import { type Grade, type Verdict, verdictOfGrade } from '../core/memory';
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
  readonly topicId: string | null;
  readonly createdAt: Date;
  readonly reviews: readonly SeedReview[];
  // La fuente legible y la cita de un material (Fase 13): las del elenco salen del PDF de ejemplo.
  readonly sourceText?: string;
  readonly sourceCite?: string;
  // Fase 16: un ejercicio, con su tipo, lo propio del tipo (JSON), sus pistas, su ejemplo y su
  // explicación.
  readonly activityType?: string;
  readonly activity?: string;
  readonly hints?: readonly string[];
  readonly example?: string;
  readonly explanation?: string;
}

// Cuánto tardaron los repasos sembrados (el primero de cada tarjeta, no): la mediana es 12 segundos,
// como dice el elenco, así la estimación por repaso empieza en 12 y no lleva «estimación inicial».
const SEED_DURATIONS_MS = [12_000, 9_000, 15_000] as const;

// Un intento sobre un ejercicio en otro día (Fase 18): el mismo registro que un «Enviar», con su
// evaluación, con origen «demostración».
export interface SeedAttempt {
  readonly cardId: string;
  readonly at: Date;
  readonly activityType: 'numeric' | 'decision';
  readonly answer:
    | { readonly type: 'numeric'; readonly raw: string }
    | { readonly type: 'decision'; readonly optionId: string; readonly shown: string[] };
  readonly verdict: Verdict;
}

export function plantAttempt(tx: Writer, clock: Clock, attempt: SeedAttempt, index: number): void {
  const card = tx
    .select({ versionId: cards.currentVersionId })
    .from(cards)
    .where(eq(cards.id, attempt.cardId))
    .get();
  if (!card) {
    throw new Error('No encontré el ejercicio para sembrarle un intento');
  }
  const optionsQuestion = attempt.activityType === 'decision';
  const observation = appendObservation(tx, clock, {
    kind: 'attempt.submitted',
    payload: {
      cardId: attempt.cardId,
      versionId: card.versionId,
      activityType: attempt.activityType,
      openingId: newId(),
      attemptNo: 1,
      rule: 'chosen',
      purpose: purposeOf({ mode: 'practice', used: [], attemptNo: 1 }),
      answer: attempt.answer,
      help: [],
      helpLevel: 'A0',
      noIdea: false,
      optionsQuestion,
      confidence: null,
      shownAt: attempt.at.toISOString(),
      firstInputMs: null,
      submittedMs: null,
    },
    idempotencyKey: `demo:attempt:${index}:${attempt.cardId}`,
    source: 'demo',
    occurredAt: attempt.at,
  });
  appendEvaluation(tx, clock, {
    attemptId: observation.id,
    verdict: attempt.verdict,
    source: 'demo',
    proposedVerdict: attempt.verdict,
    contentVersionId: card.versionId,
    engineSignal: engineSignal({
      verdict: attempt.verdict,
      helpLevel: 'A0',
      optionsQuestion,
    }),
    cause: 'graded',
  });
  recomputeCardSchedule(tx, attempt.cardId);
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
        ...(index > 0
          ? { gradedMs: SEED_DURATIONS_MS[(index - 1) % SEED_DURATIONS_MS.length] ?? 12_000 }
          : {}),
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
      ...(entry.sourceText ? { sourceText: entry.sourceText } : {}),
      ...(entry.sourceCite ? { sourceCite: entry.sourceCite } : {}),
      ...(entry.activityType && entry.activity
        ? { activityType: entry.activityType, activity: entry.activity }
        : {}),
      ...(entry.hints ? { hints: JSON.stringify(entry.hints) } : {}),
      ...(entry.example ? { example: entry.example } : {}),
      ...(entry.explanation ? { explanation: entry.explanation } : {}),
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
