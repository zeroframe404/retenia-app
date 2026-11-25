import { daysBetween } from '../memory';

// La dificultad recurrente (CA-154): una tarjeta con 4 fallos, o con 3 dentro de 30 días, sale de
// los repasos y va a «Mejorar la tarjeta». Se cuentan los fallos que llegaron al motor (el primer
// intento de cada día), desde la última vez que la mejoraste, que se reprogramó como nueva o que
// cambió lo que hay que recordar. Recibe los días de esos fallos en orden.

const TOTAL_FAILURES = 4;
const WINDOW_FAILURES = 3;
const WINDOW_DAYS = 30;

export interface RecurringDifficulty {
  readonly reason: 'total' | 'thirtyDays';
  readonly failures: number;
}

export function recurringDifficulty(failureDays: readonly string[]): RecurringDifficulty | null {
  if (failureDays.length >= TOTAL_FAILURES) {
    return { reason: 'total', failures: failureDays.length };
  }
  for (let index = 0; index + WINDOW_FAILURES <= failureDays.length; index += 1) {
    const first = failureDays[index] as string;
    const last = failureDays[index + WINDOW_FAILURES - 1] as string;
    if (daysBetween(last, first) < WINDOW_DAYS) {
      return { reason: 'thirtyDays', failures: failureDays.length };
    }
  }
  return null;
}
