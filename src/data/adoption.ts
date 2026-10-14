import { and, gt, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { appendObservation } from './ledger';
import type { Writer } from './orm';
import { cardSchedule, observations } from './schema';

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
