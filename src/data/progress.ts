import { and, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  conceptName,
  conceptPair,
  confusionOf,
  type MistakeType,
  mistakeTypeOf,
} from '../core/mastery';
import { resolveSteps } from '../core/procedure';
import { evaluateFormula, formatValue } from '../core/variants';
import type { ActivityValue } from '../preload/contract/activities';
import type { ContrastResult, ImproveCards, ProgressErrors } from '../preload/contract/objectives';
import { texts } from '../preload/contract/texts';
import type { CardsStore } from './cards';
import type { ReteniaDatabase } from './database';
import { difficultyOf } from './difficulty';
import type { EvidenceAttempt } from './evidence';
import { appendObservation, readPayload } from './ledger';
import { objectivesSnapshot, subjectFor } from './objectives';
import { resultText } from './procedures';
import { cardSchedule, cards, cardVersions, evaluations, observations } from './schema';
import { stepStatesOf } from './step-states';

// Progreso › «Mis errores» (CA-155) y «Mejorar la tarjeta» (CA-154), Fase 17.

const OUT_OF_PRACTICE = ['in_review', 'retired'];

// Sin mayúsculas, tildes ni signos, con los espacios juntos.
const plain = (text: string) =>
  text
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/(?!\u0303)\p{M}/gu, '')
    .normalize('NFC')
    .replace(/[¿?¡!.,;:«»"“”]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

class AttemptNotFoundError extends Error {
  constructor() {
    super('No encontré ese intento');
    this.name = 'AttemptNotFoundError';
  }
}

export interface ProgressStore {
  errors(input: { subjectId?: string | undefined }): ProgressErrors;
  setErrorType(input: { changeId: string; attemptId: string; type: MistakeType }): void;
  // «Crear tarjeta de contraste» desde un error de confusión (CA-163).
  contrast(input: {
    requestId: string;
    attemptId: string;
    concepts?: readonly [string, string] | undefined;
  }): ContrastResult;
  improveCards(input?: { subjectId?: string | undefined }): ImproveCards;
  split(input: {
    splitId: string;
    cardId: string;
    parts: readonly { question: string; answer: string }[];
  }): { cardIds: string[] };
}

// Lo que se mostró y lo que era, en un intento sobre un procedimiento o un numérico con variantes:
// salen de los números de la variante que se resolvió.
function variantMistake(
  db: ReteniaDatabase['orm'],
  attemptId: string,
  activity: string | null,
): { written: string; correct: string; textStep: boolean } | null {
  const row = db
    .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
    .from(observations)
    .where(eq(observations.id, attemptId))
    .get();
  if (!row || activity === null) {
    return null;
  }
  const attempt = readPayload('attempt.submitted', row.schemaVersion, row.payload);
  const parsed = JSON.parse(activity) as ActivityValue;
  const values = attempt.variant?.values ?? {};
  if (parsed.type === 'numeric' && parsed.family && parsed.formula) {
    if (!attempt.variant) {
      return null;
    }
    const value = formatValue(evaluateFormula(parsed.formula, values));
    return {
      written: attempt.answer.type === 'numeric' ? attempt.answer.raw : '',
      correct: parsed.unit === null ? value : `${value} ${parsed.unit}`,
      textStep: false,
    };
  }
  if (parsed.type !== 'procedure' || attempt.answer.type !== 'procedure') {
    return null;
  }
  const states = stepStatesOf(
    db.select().from(evaluations).where(eq(evaluations.attemptId, attemptId)).all(),
  );
  const failed = states?.find((step) => step.state !== 'ok');
  const step = resolveSteps(parsed, values).find((candidate) => candidate.id === failed?.id);
  if (!step) {
    return null;
  }
  const written = attempt.answer.steps.find((item) => item.stepId === step.id)?.written ?? '';
  return {
    written: texts.progress.mistakesSection.step(step.position, written),
    correct: texts.progress.mistakesSection.step(step.position, resultText(step)),
    textStep: step.expected.type === 'text',
  };
}

const capitalized = (text: string) => `${text.charAt(0).toLocaleUpperCase('es')}${text.slice(1)}`;

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

  // La definición de un concepto en las tarjetas de la materia: «¿Qué es la mediana?» o «¿Qué es la
  // media muestral?». Solo así de exacto: una que se llame parecido («… ponderada») es otra cosa. No
  // salen de tarjetas «En revisión» ni «Retiradas».
  function definitionOf(subjectId: string, concept: string): string | null {
    const wanted = [`que es ${plain(concept)}`, `que es ${plain(concept)} muestral`];
    const matches = orm
      .select({
        question: cardVersions.question,
        answer: cardVersions.answer,
        sheetState: cardVersions.sheetState,
      })
      .from(cards)
      .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
      .where(
        and(
          eq(cards.subjectId, subjectId),
          isNull(cards.deletedAt),
          isNull(cardVersions.activityType),
        ),
      )
      .all()
      .filter((row) => !OUT_OF_PRACTICE.includes(row.sheetState))
      .map((row) => ({ ...row, at: wanted.indexOf(plain(row.question)) }))
      .filter((row) => row.at >= 0)
      .sort((a, b) => a.at - b.at);
    return matches[0]?.answer ?? null;
  }

  // El porqué de la opción que decía ese concepto, en la versión que se contestó.
  function optionWhy(activity: string | null, text: string): string | null {
    if (activity === null) {
      return null;
    }
    const parsed = JSON.parse(activity) as { options?: { text: string; explanation: string }[] };
    const option = parsed.options?.find((item) => plain(item.text) === plain(text));
    return option?.explanation.trim() || null;
  }

  const store: ProgressStore = {
    contrast({ requestId, attemptId, concepts }) {
      // El mismo pedido dos veces crea una sola tarjeta.
      const made = orm
        .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
        .from(observations)
        .where(eq(observations.idempotencyKey, `contrast:${requestId}`))
        .get();
      if (made) {
        const { cardId } = readPayload('contrast.created', made.schemaVersion, made.payload);
        const card = cardsStore().get({ cardId });
        return { kind: 'exists', cardId, question: card.question };
      }
      const row = orm
        .select({
          cardId: observations.cardId,
          payload: observations.payload,
        })
        .from(observations)
        .where(eq(observations.id, attemptId))
        .get();
      const source = row?.cardId
        ? orm
            .select({
              subjectId: cards.subjectId,
              topicId: cards.topicId,
              versionId: cards.currentVersionId,
            })
            .from(cards)
            .where(eq(cards.id, row.cardId))
            .get()
        : undefined;
      if (!source?.subjectId) {
        throw new AttemptNotFoundError();
      }
      const subjectId = source.subjectId;
      const mistake = store
        .errors({ subjectId })
        .groups.flatMap((group) => group.items)
        .find((item) => item.attemptId === attemptId);
      if (!mistake) {
        throw new AttemptNotFoundError();
      }
      const pair = concepts ?? conceptPair(mistake.written, mistake.correct);
      if (pair === null) {
        return {
          kind: 'needsConcepts',
          first: conceptName(mistake.written) ?? '',
          second: conceptName(mistake.correct) ?? '',
        };
      }
      const question = texts.progress.contrast.question(pair[0], pair[1]);
      const existing = cardsStore()
        .list({ subjectId })
        .find((card) => plain(card.question) === plain(question));
      if (existing) {
        return { kind: 'exists', cardId: existing.id, question: existing.question };
      }
      const versionId = (JSON.parse(row?.payload ?? '{}') as { versionId?: string }).versionId;
      const answered =
        versionId === undefined
          ? null
          : (orm
              .select({ activity: cardVersions.activity })
              .from(cardVersions)
              .where(eq(cardVersions.id, versionId))
              .get()?.activity ?? null);
      // La respuesta sale de lo que ya tenés (tus definiciones o el porqué de cada opción): no se
      // inventa nada.
      const lines = pair.flatMap((concept) => {
        const known = definitionOf(subjectId, concept) ?? optionWhy(answered, concept);
        return known === null ? [] : [`${capitalized(concept)}: ${known}`];
      });
      const card = cardsStore().create({
        question,
        answer: lines.length === 0 ? texts.progress.contrast.fillAnswer : lines.join('\n'),
        subjectId,
        topicId: source.topicId,
      });
      appendObservation(orm, clock, {
        kind: 'contrast.created',
        payload: { cardId: card.id, requestId, attemptId },
        idempotencyKey: `contrast:${requestId}`,
        source: 'user',
      });
      return { kind: 'created', cardId: card.id, question: card.question };
    },

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
          const activity = version?.activity ?? card?.activity ?? null;
          const computed =
            attempt.activityType === 'procedure' || attempt.activityType === 'numeric'
              ? variantMistake(orm, attempt.id, activity)
              : null;
          const correct = computed?.correct ?? version?.answer ?? card?.answer ?? '';
          const rawWritten = attempt.written ?? '';
          const written =
            computed?.written ??
            (attempt.activityType === 'options' || attempt.activityType === 'decision'
              ? optionText(activity, rawWritten)
              : attempt.activityType === 'order'
                ? stepsText(activity, rawWritten)
                : rawWritten);
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
                (computed?.textStep
                  ? 'forgotten'
                  : mistakeTypeOf({
                      activityType: attempt.activityType ?? 'card',
                      written,
                      expected: correct,
                      confused,
                    })),
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
  return store;
}
