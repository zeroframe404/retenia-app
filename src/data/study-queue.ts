import { and, eq, gt, inArray, isNull, notInArray } from 'drizzle-orm';
import type { CardMemory, Grade } from '../core/memory';
import { recallProbability } from '../core/memory';
import { leftOutOfQueue, type QueueCandidate } from '../core/session';
import { studyDayOf } from '../core/study-day';
import { readPayload } from './ledger';
import type { Writer } from './orm';
import { cardHistory } from './projections';
import { cardSchedule, cards, cardVersions, observations, subjects } from './schema';

// Qué tarjetas pueden entrar en una sesión (Fases 10 y 11): la materia activa, las vencidas que se
// pueden estudiar, las familias de hermanas ya estudiadas hoy y el calendario de los días de
// estudio. Solo lectura: la sesión y la propuesta escriben desde `study.ts` y `load.ts`.

// Los estados de la ficha que sacan a una tarjeta de los repasos.
export const OUT_OF_REVIEWS = ['in_review', 'retired'];

export const DAY_MS = 86_400_000;
// El día de estudio que sigue (Buenos Aires no cambia de horario).
export const nextDay = (day: string) =>
  studyDayOf(new Date(new Date(`${day}T12:00:00-03:00`).getTime() + DAY_MS));
// Desde cuándo y hasta cuándo va un día de estudio (de 04:00 a 04:00).
const dayStart = (day: string) => new Date(`${day}T04:00:00-03:00`).toISOString();

// La materia activa (la sesión es siempre de ella).
export function activeSubject(db: Writer): { id: string; name: string } | undefined {
  return db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(and(eq(subjects.status, 'active'), isNull(subjects.deletedAt)))
    .get();
}

export interface Eligible extends QueueCandidate {
  readonly topicId: string | null;
  // Para medir el atraso: cuántos días de intervalo tenía y qué retención se buscaba.
  readonly scheduledDays: number;
  readonly retentionTarget: number;
  readonly reps: number;
}

// Las tarjetas ya repasadas de una materia que pueden entrar en una sesión: sin pausar, sin
// borrar, con la ficha fuera de «En revisión» y «Retirada», y sin 4 fallos seguidos. Con su
// probabilidad de recordarlas el día `today` y el día en que vencen.
export function eligibleCards(db: Writer, subjectId: string, today: string): Eligible[] {
  const rows = db
    .select({
      cardId: cards.id,
      siblingGroupId: cards.siblingGroupId,
      topicId: cards.topicId,
      state: cardSchedule.state,
      stability: cardSchedule.stability,
      difficulty: cardSchedule.difficulty,
      dueAt: cardSchedule.dueAt,
      lastReviewAt: cardSchedule.lastReviewAt,
      reps: cardSchedule.reps,
      lapses: cardSchedule.lapses,
      scheduledDays: cardSchedule.scheduledDays,
      retentionTarget: cardSchedule.retentionTarget,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id))
    .where(
      and(
        eq(cards.subjectId, subjectId),
        isNull(cards.deletedAt),
        isNull(cards.pausedAt),
        gt(cardSchedule.reps, 0),
        notInArray(cardVersions.sheetState, OUT_OF_REVIEWS),
      ),
    )
    .all();
  return rows.flatMap((row) => {
    const memory: CardMemory = {
      state: row.state,
      stability: row.stability,
      difficulty: row.difficulty,
      dueAt: new Date(row.dueAt),
      lastReviewAt: row.lastReviewAt === null ? null : new Date(row.lastReviewAt),
      reps: row.reps,
      lapses: row.lapses,
      scheduledDays: row.scheduledDays,
    };
    return [
      {
        cardId: row.cardId,
        siblingGroupId: row.siblingGroupId,
        topicId: row.topicId,
        scheduledDays: row.scheduledDays,
        retentionTarget: row.retentionTarget,
        reps: row.reps,
        dueDay: studyDayOf(memory.dueAt),
        recall: recallProbability(memory, today) ?? 0,
      },
    ];
  });
}

// Las calificaciones que llegaron al motor desde que la tarjeta se programó como nueva por última
// vez: sin anuladas, sin otros repasos del mismo día y sin las vueltas de una fallada.
function gradesOf(db: Writer, cardId: string): Grade[] {
  const grades: Grade[] = [];
  for (const entry of cardHistory(db, cardId)) {
    if (entry.result === 'reset' || entry.result === 'adopted') {
      grades.length = 0;
    } else if (entry.counted && entry.result !== 'postponed') {
      grades.push(entry.result);
    }
  }
  return grades;
}

// Las vencidas hoy que pueden entrar (sin las de 4 fallos seguidos).
export function dueCandidates(db: Writer, subjectId: string, today: string): Eligible[] {
  return eligibleCards(db, subjectId, today).filter(
    (card) =>
      card.dueDay <= today && !(card.reps >= 4 && leftOutOfQueue(gradesOf(db, card.cardId))),
  );
}

// Las familias de hermanas de las que ya se repasó una tarjeta este día de estudio.
export function studiedGroupsOf(db: Writer, today: string): Set<string> {
  const reviews = db
    .select({ id: observations.id, cardId: observations.cardId, at: observations.occurredAt })
    .from(observations)
    .where(
      and(eq(observations.kind, 'review.graded'), gt(observations.occurredAt, dayStart(today))),
    )
    .all()
    .filter((row) => studyDayOf(new Date(row.at)) === today);
  if (reviews.length === 0) {
    return new Set();
  }
  const annulled = new Set(
    db
      .select({ payload: observations.payload, version: observations.schemaVersion })
      .from(observations)
      .where(eq(observations.kind, 'review.annulled'))
      .all()
      .map((row) => readPayload('review.annulled', row.version, row.payload).reviewId),
  );
  const cardIds = reviews.flatMap((row) =>
    annulled.has(row.id) || row.cardId === null ? [] : [row.cardId],
  );
  if (cardIds.length === 0) {
    return new Set();
  }
  return new Set(
    db
      .select({ group: cards.siblingGroupId })
      .from(cards)
      .where(inArray(cards.id, cardIds))
      .all()
      .flatMap((row) => (row.group === null ? [] : [row.group])),
  );
}

// Las tarjetas nuevas de una materia (todavía sin repasar), en el orden en que entran: primero las
// que se sumaron a mano con «Sumar a mis repasos» (en el orden en que se sumaron) y después las
// demás, de la más vieja a la más nueva.
export function newCardsOf(
  db: Writer,
  subjectId: string,
): { cardId: string; topicId: string | null; siblingGroupId: string | null }[] {
  const rows = db
    .select({
      cardId: cards.id,
      topicId: cards.topicId,
      siblingGroupId: cards.siblingGroupId,
      createdAt: cards.createdAt,
      availableOnly: cards.availableOnly,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id))
    .where(
      and(
        eq(cards.subjectId, subjectId),
        isNull(cards.deletedAt),
        isNull(cards.pausedAt),
        eq(cardSchedule.reps, 0),
        notInArray(cardVersions.sheetState, OUT_OF_REVIEWS),
      ),
    )
    .all();
  if (rows.length === 0) {
    return [];
  }
  const activatedAt = new Map<string, number>();
  const activations = db
    .select({ cardId: observations.cardId, seq: observations.seq })
    .from(observations)
    .where(eq(observations.kind, 'card.activated'))
    .orderBy(observations.seq)
    .all();
  for (const activation of activations) {
    if (activation.cardId !== null && !activatedAt.has(activation.cardId)) {
      activatedAt.set(activation.cardId, activation.seq);
    }
  }
  // Las «Disponibles» (Fase 15: importadas sin historial) entran recién con «Sumar a mis repasos».
  return rows
    .filter((row) => row.availableOnly === 0 || activatedAt.has(row.cardId))
    .sort((a, b) => {
      const first = activatedAt.get(a.cardId);
      const second = activatedAt.get(b.cardId);
      if (first !== undefined || second !== undefined) {
        if (first === undefined) {
          return 1;
        }
        if (second === undefined) {
          return -1;
        }
        return first - second;
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? -1 : 1;
      }
      return a.cardId < b.cardId ? -1 : 1;
    })
    .map(({ cardId, topicId, siblingGroupId }) => ({ cardId, topicId, siblingGroupId }));
}
