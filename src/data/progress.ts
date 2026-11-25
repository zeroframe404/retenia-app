import { and, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { confusionOf, type MistakeType, mistakeTypeOf } from '../core/mastery';
import type { ImproveCards, ProgressErrors } from '../preload/contract/objectives';
import type { CardsStore } from './cards';
import type { ReteniaDatabase } from './database';
import { difficultyOf } from './difficulty';
import type { EvidenceAttempt } from './evidence';
import { appendObservation, readPayload } from './ledger';
import { objectivesSnapshot, subjectFor } from './objectives';
import { cardSchedule, cards, cardVersions, observations } from './schema';

// Progreso › «Mis errores» (CA-155) y «Mejorar la tarjeta» (CA-154), Fase 17.

const OUT_OF_PRACTICE = ['in_review', 'retired'];

class AttemptNotFoundError extends Error {
  constructor() {
    super('No encontré ese intento');
    this.name = 'AttemptNotFoundError';
  }
}

export interface ProgressStore {
  errors(input: { subjectId?: string | undefined }): ProgressErrors;
  setErrorType(input: { changeId: string; attemptId: string; type: MistakeType }): void;
  improveCards(input?: { subjectId?: string | undefined }): ImproveCards;
  split(input: {
    splitId: string;
    cardId: string;
    parts: readonly { question: string; answer: string }[];
  }): { cardIds: string[] };
}

const optionText = (activity: string | null, optionId: string): string => {
  if (activity === null) {
    return optionId;
  }
  const parsed = JSON.parse(activity) as { options?: { id: string; text: string }[] };
  return parsed.options?.find((option) => option.id === optionId)?.text ?? optionId;
};

// En un ejercicio de ordenar, lo escrito son los pasos en el orden elegido: se muestran con su texto.
const STEP_SEPARATOR = ' · ';
const stepsText = (activity: string | null, written: string): string => {
  const parsed =
    activity === null ? {} : (JSON.parse(activity) as { steps?: { id: string; text: string }[] });
  return written
    .split(STEP_SEPARATOR)
    .map((stepId) => parsed.steps?.find((step) => step.id === stepId)?.text ?? stepId)
    .join(STEP_SEPARATOR);
};

export function createProgressStore(
  db: ReteniaDatabase,
  clock: Clock,
  cardsStore: () => CardsStore,
): ProgressStore {
  const { orm } = db;
  return {
    errors({ subjectId }) {
      const id = subjectFor(orm, subjectId);
      const snapshot = id === null ? null : objectivesSnapshot(orm, id);
      if (!snapshot) {
        return { subject: null, groups: [] };
      }
      const failed: EvidenceAttempt[] = [...snapshot.evidence.values()]
        .flat()
        .filter(
          (attempt) =>
            attempt.verdict === 'incorrect' &&
            !attempt.annulled &&
            !attempt.affected &&
            (attempt.written ?? '').trim() !== '' &&
            snapshot.cards.get(attempt.cardId)?.deleted === false,
        );
      if (failed.length === 0) {
        return { subject: snapshot.subject, groups: [] };
      }
      // El tipo que elegiste para cada intento (vale el último).
      const chosen = new Map<string, MistakeType>();
      for (const row of orm
        .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
        .from(observations)
        .where(eq(observations.kind, 'mistake.type_set'))
        .orderBy(observations.seq)
        .all()) {
        const payload = readPayload('mistake.type_set', row.schemaVersion, row.payload);
        chosen.set(payload.attemptId, payload.type);
      }
      // La versión que se evaluó: su respuesta y, en una de opciones, el texto de cada opción.
      const versionIds = [
        ...new Set(
          failed.flatMap((attempt) => (attempt.versionId === null ? [] : [attempt.versionId])),
        ),
      ];
      const versions = new Map(
        (versionIds.length === 0
          ? []
          : orm
              .select({
                id: cardVersions.id,
                answer: cardVersions.answer,
                activity: cardVersions.activity,
              })
              .from(cardVersions)
              .where(inArray(cardVersions.id, versionIds))
              .all()
        ).map((row) => [row.id, row]),
      );
      const others = [...snapshot.cards.values()].filter(
        (card) => !card.deleted && (card.activityType === null || card.activityType === 'short'),
      );
      const items = failed
        .map((attempt) => {
          const card = snapshot.cards.get(attempt.cardId);
          const version = attempt.versionId === null ? undefined : versions.get(attempt.versionId);
          const correct = version?.answer ?? card?.answer ?? '';
          const rawWritten = attempt.written ?? '';
          const written =
            attempt.activityType === 'options'
              ? optionText(version?.activity ?? card?.activity ?? null, rawWritten)
              : attempt.activityType === 'order'
                ? stepsText(version?.activity ?? card?.activity ?? null, rawWritten)
                : rawWritten;
          const confused =
            confusionOf(
              written,
              others
                .filter((other) => other.id !== attempt.cardId)
                .map((other) => ({
                  cardId: other.id,
                  question: other.question,
                  answers: [other.answer, ...other.variants],
                })),
            ) !== null;
          const own = chosen.get(attempt.id);
          return {
            topicId: card?.topicId ?? null,
            seq: attempt.seq,
            item: {
              attemptId: attempt.id,
              cardId: attempt.cardId,
              question: card?.question ?? '',
              written,
              correct,
              type:
                own ??
                mistakeTypeOf({
                  activityType: attempt.activityType ?? 'card',
                  written,
                  expected: correct,
                  confused,
                }),
              typeChosen: own !== undefined,
              day: attempt.studyDay,
              practicable:
                card !== undefined &&
                card.pausedAt === null &&
                !OUT_OF_PRACTICE.includes(card.sheetState),
            },
          };
        })
        .sort((a, b) => b.seq - a.seq);
      const known = new Set(snapshot.topics.map((topic) => topic.id));
      const groups = [
        ...snapshot.topics.map((topic) => ({
          topicId: topic.id as string | null,
          topicName: topic.name as string | null,
        })),
        { topicId: null, topicName: null },
      ];
      return {
        subject: snapshot.subject,
        groups: groups
          .map((group) => ({
            ...group,
            items: items
              .filter((entry) =>
                group.topicId === null
                  ? entry.topicId === null || !known.has(entry.topicId)
                  : entry.topicId === group.topicId,
              )
              .map((entry) => entry.item),
          }))
          .filter((group) => group.items.length > 0),
      };
    },

    setErrorType({ changeId, attemptId, type }) {
      orm.transaction((tx) => {
        const attempt = tx
          .select({ cardId: observations.cardId, kind: observations.kind })
          .from(observations)
          .where(eq(observations.id, attemptId))
          .get();
        if (
          !attempt ||
          attempt.cardId === null ||
          (attempt.kind !== 'attempt.submitted' && attempt.kind !== 'review.graded')
        ) {
          throw new AttemptNotFoundError();
        }
        appendObservation(tx, clock, {
          kind: 'mistake.type_set',
          payload: { attemptId, cardId: attempt.cardId, type },
          idempotencyKey: `mistake:${changeId}`,
          source: 'user',
        });
      });
    },

    improveCards({ subjectId } = {}) {
      // Para llegar a 3 fallos hacen falta 3 repasos que contaron.
      const candidates = orm
        .select({
          cardId: cards.id,
          question: cardVersions.question,
          answer: cardVersions.answer,
          sourceCite: cardVersions.sourceCite,
          activityType: cardVersions.activityType,
          createdAt: cards.createdAt,
        })
        .from(cards)
        .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
        .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id))
        .where(
          and(
            isNull(cards.deletedAt),
            gte(cardSchedule.reps, 3),
            ne(cardVersions.sheetState, 'retired'),
            subjectId === undefined ? undefined : eq(cards.subjectId, subjectId),
          ),
        )
        .orderBy(cards.createdAt, cards.id)
        .all();
      return {
        cards: candidates.flatMap((card) => {
          const difficulty = difficultyOf(orm, card.cardId);
          return difficulty === null
            ? []
            : [
                {
                  cardId: card.cardId,
                  question: card.question,
                  answer: card.answer,
                  reason: difficulty.reason,
                  failures: Math.max(1, difficulty.failures),
                  hasCite: card.sourceCite !== null,
                  isExercise: card.activityType !== null,
                },
              ];
        }),
      };
    },

    split(input) {
      return cardsStore().split(input);
    },
  };
}
