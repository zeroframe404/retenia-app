import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { appendObservation } from './ledger';
import type { Writer } from './orm';
import { cardSchedule, cards, observations, subjects } from './schema';

// Las bases de la Fase 03 guardaban solo la agenda y la pisaban en cada repaso, sin historial.
// Una tarjeta repasada que todavía no tiene ningún evento recibe, una sola vez, una observación
// «schedule.adopted» con la agenda que traía: recalcularla da lo mismo y esos repasos no se
// pierden. Devuelve cuántas adoptó.
export function adoptLegacySchedules(db: Writer, clock: Clock): number {
  const legacy = db
    .select()
    .from(cardSchedule)
    .where(
      and(
        gt(cardSchedule.reps, 0),
        sql`not exists (select 1 from ${observations} where ${observations.cardId} = ${cardSchedule.cardId})`,
      ),
    )
    .all();
  for (const row of legacy) {
    appendObservation(db, clock, {
      kind: 'schedule.adopted',
      payload: {
        cardId: row.cardId,
        memory: {
          state: row.state,
          stability: row.stability,
          difficulty: row.difficulty,
          dueAt: row.dueAt,
          lastReviewAt: row.lastReviewAt,
          reps: row.reps,
          lapses: row.lapses,
          scheduledDays: row.scheduledDays,
        },
      },
      idempotencyKey: `adopt:${row.cardId}`,
      source: 'system',
      occurredAt: row.lastReviewAt === null ? clock.now() : new Date(row.lastReviewAt),
    });
  }
  return legacy.length;
}

// Las tarjetas de antes de la Fase 08 no tenían materia. Pasan a la materia activa (o, si no hay,
// a la más antigua) apenas existe una; sin ninguna materia esperan a la primera que se cree.
// Devuelve cuántas asignó.
export function adoptUnassignedCards(db: Writer): number {
  const orphan = db.select({ id: cards.id }).from(cards).where(isNull(cards.subjectId)).get();
  if (!orphan) {
    return 0;
  }
  const target = db
    .select({ id: subjects.id })
    .from(subjects)
    .where(isNull(subjects.deletedAt))
    .orderBy(desc(eq(subjects.status, 'active')), asc(subjects.createdAt), asc(subjects.id))
    .get();
  if (!target) {
    return 0;
  }
  return db.update(cards).set({ subjectId: target.id }).where(isNull(cards.subjectId)).run()
    .changes;
}
