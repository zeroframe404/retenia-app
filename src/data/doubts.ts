import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import type { ReviewsList } from '../preload/contract/study';
import type { ReteniaDatabase } from './database';
import { cards, cardVersions, doubts, subjects } from './schema';

// «Guardar una duda» (CA-076) y Progreso › «Dudas y revisiones»: las dudas guardadas con la
// tarjeta de la que salieron y las tarjetas «En revisión» (CA-077).

export interface DoubtsStore {
  // El identificador lo genera quien pide: guardar dos veces la misma duda no agrega otra.
  create(input: {
    doubtId: string;
    text: string;
    cardId: string | null;
    sessionId: string | null;
  }): void;
  reviews(): ReviewsList;
}

export function createDoubtsStore(db: ReteniaDatabase, clock: Clock): DoubtsStore {
  const { orm } = db;
  return {
    create({ doubtId, text, cardId, sessionId }) {
      orm
        .insert(doubts)
        .values({
          id: doubtId,
          text: text.trim(),
          cardId,
          sessionId,
          createdAt: clock.now().toISOString(),
        })
        .onConflictDoNothing({ target: doubts.id })
        .run();
    },

    reviews() {
      const saved = orm
        .select()
        .from(doubts)
        .where(isNull(doubts.resolvedAt))
        .orderBy(desc(doubts.createdAt), desc(doubts.id))
        .all();
      const cardIds = saved.flatMap((doubt) => (doubt.cardId === null ? [] : [doubt.cardId]));
      const questions = new Map(
        cardIds.length === 0
          ? []
          : orm
              .select({ id: cards.id, question: cardVersions.question })
              .from(cards)
              .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
              .where(and(inArray(cards.id, cardIds), isNull(cards.deletedAt)))
              .all()
              .map((row) => [row.id, row.question]),
      );
      const inReview = orm
        .select({
          cardId: cards.id,
          question: cardVersions.question,
          subjectName: subjects.name,
        })
        .from(cards)
        .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
        .leftJoin(subjects, eq(subjects.id, cards.subjectId))
        .where(and(isNull(cards.deletedAt), eq(cardVersions.sheetState, 'in_review')))
        .orderBy(desc(cardVersions.createdAt), desc(cards.id))
        .all();
      return {
        doubts: saved.map((doubt) => {
          const question = doubt.cardId === null ? undefined : questions.get(doubt.cardId);
          return {
            id: doubt.id,
            text: doubt.text,
            createdAt: doubt.createdAt,
            card:
              doubt.cardId === null || question === undefined
                ? null
                : { id: doubt.cardId, question },
          };
        }),
        inReview,
      };
    },
  };
}
