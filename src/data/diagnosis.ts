import { and, eq, gt, isNull, ne, or } from 'drizzle-orm';
import {
  confusionOf,
  type Diagnosis,
  diagnoseFailure,
  estimateMean,
  isMet,
  type MissingRequirement,
} from '../core/mastery';
import { subjectEvidence } from './evidence';
import { readPayload } from './ledger';
import { objectivesSnapshot } from './objectives';
import type { Writer } from './orm';
import { cards, cardVersions, doubts, evaluations, observations } from './schema';

// El diagnóstico tras un fallo (Fase 17, CA-153), con lo que hay en la base: el intento anterior
// sobre la misma actividad, si la pregunta está marcada como dudosa (una duda abierta o «La pregunta
// era ambigua»), un requisito sin cumplir de su objetivo y si lo escrito es la respuesta de otra
// tarjeta de la materia. Se pide en cada fallo (y al marcar unidades): todo con consultas de esa
// tarjeta; la materia entera solo si su objetivo tiene requisitos.

const listOf = (json: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

// El objetivo tuyo de ahora de una actividad (nulo si es del implícito de su tema).
function explicitObjectiveOf(db: Writer, cardId: string): string | null {
  const last = db
    .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
    .from(observations)
    .where(and(eq(observations.kind, 'objective.linked'), eq(observations.cardId, cardId)))
    .orderBy(observations.seq)
    .all()
    .at(-1);
  return last === undefined
    ? null
    : readPayload('objective.linked', last.schemaVersion, last.payload).objectiveId;
}

function missingRequirementOf(
  db: Writer,
  subjectId: string,
  cardId: string,
): MissingRequirement | null {
  const objectiveId = explicitObjectiveOf(db, cardId);
  if (objectiveId === null) {
    return null;
  }
  const hasRequirements = db
    .select({ id: observations.id })
    .from(observations)
    .where(
      and(eq(observations.kind, 'requirement.added'), eq(observations.objectiveId, objectiveId)),
    )
    .get();
  if (hasRequirements === undefined) {
    return null;
  }
  const snapshot = objectivesSnapshot(db, subjectId);
  if (!snapshot) {
    return null;
  }
  const missing = snapshot.requirements
    .filter((requirement) => !requirement.dismissed && requirement.objectiveId === objectiveId)
    .flatMap((requirement) => {
      const required = snapshot.byId.get(requirement.requiresId);
      return required && !isMet(required.mastery.state)
        ? [{ required, seq: requirement.seq, mean: estimateMean(snapshot.estimateOf(required)) }]
        : [];
    })
    .sort((a, b) => a.mean - b.mean || a.seq - b.seq)[0];
  return missing
    ? {
        objectiveId: missing.required.id,
        title: missing.required.title,
        state: missing.required.mastery.state,
      }
    : null;
}

// La pregunta está marcada como dudosa si, sobre su versión de ahora, hay una duda abierta guardada o
// un «La pregunta era ambigua» vigente. Corregir la tarjeta (una versión nueva) la deja de marcar.
function isDoubtful(db: Writer, cardId: string): boolean {
  const version = db
    .select({ id: cardVersions.id, createdAt: cardVersions.createdAt })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .where(eq(cards.id, cardId))
    .get();
  if (!version) {
    return false;
  }
  // Las dudas de antes de la Fase 17 no dicen de qué versión son: cuentan si son de después de ella.
  const openDoubt = db
    .select({ id: doubts.id })
    .from(doubts)
    .where(
      and(
        eq(doubts.cardId, cardId),
        isNull(doubts.resolvedAt),
        or(
          eq(doubts.cardVersionId, version.id),
          and(isNull(doubts.cardVersionId), gt(doubts.createdAt, version.createdAt)),
        ),
      ),
    )
    .get();
  if (openDoubt !== undefined) {
    return true;
  }
  const latest = new Map<string, { version: number; ambiguous: boolean }>();
  for (const row of db
    .select({
      attemptId: evaluations.attemptId,
      version: evaluations.version,
      appealReason: evaluations.appealReason,
      contentVersionId: evaluations.contentVersionId,
    })
    .from(evaluations)
    .innerJoin(observations, eq(observations.id, evaluations.attemptId))
    .where(eq(observations.cardId, cardId))
    .all()) {
    const known = latest.get(row.attemptId);
    if (known === undefined || row.version > known.version) {
      latest.set(row.attemptId, {
        version: row.version,
        ambiguous: row.appealReason === 'ambiguous' && row.contentVersionId === version.id,
      });
    }
  }
  return [...latest.values()].some((entry) => entry.ambiguous);
}

export function diagnosisFor(
  db: Writer,
  attempt: { id: string; cardId: string; written: string | null },
): Diagnosis {
  const card = db
    .select({ subjectId: cards.subjectId })
    .from(cards)
    .where(eq(cards.id, attempt.cardId))
    .get();
  const subjectId = card?.subjectId ?? null;
  const own = subjectEvidence(db, { cardIds: [attempt.cardId] }).get(attempt.cardId) ?? [];
  const current = own.find((entry) => entry.id === attempt.id);
  const previous = own
    .filter((entry) => !entry.annulled && entry.seq < (current?.seq ?? Number.POSITIVE_INFINITY))
    .at(-1);

  const doubtful = isDoubtful(db, attempt.cardId);

  const written = attempt.written ?? '';
  const others =
    subjectId === null || written.trim() === ''
      ? []
      : db
          .select({
            id: cards.id,
            question: cardVersions.question,
            answer: cardVersions.answer,
            variants: cardVersions.variants,
          })
          .from(cards)
          .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
          .where(
            and(
              eq(cards.subjectId, subjectId),
              isNull(cards.deletedAt),
              ne(cards.id, attempt.cardId),
              or(isNull(cardVersions.activityType), eq(cardVersions.activityType, 'short')),
            ),
          )
          .all()
          .map((other) => ({
            cardId: other.id,
            question: other.question,
            answers: [other.answer, ...listOf(other.variants)],
          }));

  return diagnoseFailure({
    previous: previous
      ? {
          verdict: previous.verdict ?? 'incorrect',
          helpLevel: previous.helpLevel,
          optionsQuestion: previous.optionsQuestion,
        }
      : null,
    currentOptionsQuestion: current?.optionsQuestion ?? false,
    doubtful,
    missingRequirement:
      subjectId === null ? null : missingRequirementOf(db, subjectId, attempt.cardId),
    confusedWith: confusionOf(written, others),
  });
}
