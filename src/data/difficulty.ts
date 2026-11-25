import { and, eq } from 'drizzle-orm';
import { type RecurringDifficulty, recurringDifficulty } from '../core/mastery';
import type { Grade } from '../core/memory';
import { leftOutOfQueue } from '../core/session';
import { studyDayOf } from '../core/study-day';
import type { Writer } from './orm';
import { cardHistory } from './projections';
import { observations } from './schema';

// La dificultad recurrente de una tarjeta (Fase 17, CA-154): sus fallos que llegaron al motor desde
// la última vez que la mejoraste («Mejorar la tarjeta»), que se reprogramó como nueva o que cambió
// lo que hay que recordar. Con 4, o con 3 dentro de 30 días, sale de los repasos. Incluye la regla
// de la Fase 10 (las últimas 4 calificaciones «No la sabía»), que esta contiene.

// El número de secuencia de la última mejora de la tarjeta (0 si nunca se mejoró).
function lastImprovementSeq(db: Writer, cardId: string): number {
  const rows = db
    .select({ seq: observations.seq })
    .from(observations)
    .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'card.improved')))
    .all();
  return rows.reduce((top, row) => Math.max(top, row.seq), 0);
}

export function difficultyOf(db: Writer, cardId: string): RecurringDifficulty | null {
  const improved = lastImprovementSeq(db, cardId);
  const grades: Grade[] = [];
  const days: string[] = [];
  for (const entry of cardHistory(db, cardId)) {
    if (entry.seq <= improved) {
      continue;
    }
    if (entry.result === 'reset' || entry.result === 'adopted') {
      grades.length = 0;
      days.length = 0;
    } else if (entry.counted && entry.result !== 'postponed') {
      grades.push(entry.result);
      if (entry.result === 'again') {
        days.push(studyDayOf(entry.occurredAt));
      }
    }
  }
  return (
    recurringDifficulty(days) ??
    (leftOutOfQueue(grades) ? { reason: 'total', failures: days.length } : null)
  );
}
