import { and, eq, isNull } from 'drizzle-orm';
import {
  confusionOf,
  type Diagnosis,
  diagnoseFailure,
  estimateMean,
  isMet,
  type MissingRequirement,
} from '../core/mastery';
import { objectivesSnapshot } from './objectives';
import type { Writer } from './orm';
import { cards, doubts, evaluations, observations } from './schema';

// El diagnóstico tras un fallo (Fase 17, CA-153), con lo que hay en la base: el intento anterior
// sobre la misma actividad, si la pregunta está marcada como dudosa (una duda abierta o «La pregunta
// era ambigua»), un requisito sin cumplir de su objetivo y si lo escrito es la respuesta de otra
// tarjeta de la materia.

export function diagnosisFor(
  db: Writer,
  attempt: { id: string; cardId: string; written: string | null },
): Diagnosis {
  const card = db
    .select({ subjectId: cards.subjectId })
    .from(cards)
    .where(eq(cards.id, attempt.cardId))
    .get();
  const snapshot =
    card?.subjectId === null || card === undefined ? null : objectivesSnapshot(db, card.subjectId);
  const own = snapshot?.evidence.get(attempt.cardId) ?? [];
  const current = own.find((entry) => entry.id === attempt.id);
  const previous = own
    .filter((entry) => !entry.annulled && entry.seq < (current?.seq ?? Number.POSITIVE_INFINITY))
    .at(-1);

  const openDoubt = db
    .select({ id: doubts.id })
    .from(doubts)
    .where(and(eq(doubts.cardId, attempt.cardId), isNull(doubts.resolvedAt)))
    .get();
  const ambiguous = db
    .select({ id: evaluations.id })
    .from(evaluations)
    .innerJoin(observations, eq(observations.id, evaluations.attemptId))
    .where(and(eq(observations.cardId, attempt.cardId), eq(evaluations.appealReason, 'ambiguous')))
    .get();

  let missingRequirement: MissingRequirement | null = null;
  const objectiveId = snapshot?.cardObjective.get(attempt.cardId);
  if (snapshot && objectiveId !== undefined) {
    const missing = snapshot.requirements
      .filter((requirement) => !requirement.dismissed && requirement.objectiveId === objectiveId)
      .flatMap((requirement) => {
        const required = snapshot.byId.get(requirement.requiresId);
        return required && !isMet(required.mastery.state)
          ? [{ required, seq: requirement.seq, mean: estimateMean(snapshot.estimateOf(required)) }]
          : [];
      })
      .sort((a, b) => a.mean - b.mean || a.seq - b.seq)[0];
    if (missing) {
      missingRequirement = {
        objectiveId: missing.required.id,
        title: missing.required.title,
        state: missing.required.mastery.state,
      };
    }
  }

  const others = snapshot
    ? [...snapshot.cards.values()]
        .filter(
          (other) =>
            other.id !== attempt.cardId &&
            !other.deleted &&
            (other.activityType === null || other.activityType === 'short'),
        )
        .map((other) => ({
          cardId: other.id,
          question: other.question,
          answers: [other.answer, ...other.variants],
        }))
    : [];

  return diagnoseFailure({
    previous: previous
      ? {
          verdict: previous.verdict ?? 'incorrect',
          helpLevel: previous.helpLevel,
          optionsQuestion: previous.optionsQuestion,
        }
      : null,
    doubtful: openDoubt !== undefined || ambiguous !== undefined,
    missingRequirement,
    confusedWith: confusionOf(attempt.written ?? '', others),
  });
}
