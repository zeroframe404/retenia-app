import { describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { type Grade, newCardMemory, reviewCard } from '../../src/core/memory';
import { studyDayOf } from '../../src/core/study-day';
import { formatLongDate } from '../../src/preload/contract/texts';
import { inBuenosAires } from '../apoyo/fechas';

declare module 'vitest' {
  interface TaskMeta {
    // Una fila de la tabla de casos, para que el tablero muestre lo esperado y lo obtenido.
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

const TABLE = 'Primer repaso de una tarjeta nueva el lunes 15/03/2027 (retención 0,90)';
const DAY_MS = 86_400_000;

const cases: { grade: Grade; label: string; expected: string }[] = [
  { grade: 'good', label: 'La sabía', expected: 'miércoles 17/03/2027' },
  { grade: 'hard', label: 'Con dudas', expected: 'martes 16/03/2027' },
  { grade: 'again', label: 'No la sabía', expected: 'martes 16/03/2027' },
];

describe('memoria: ts-fsrs con FSRS-6 y parámetros por defecto', () => {
  it.for(cases)(
    '[CA-010] tarjeta nueva repasada el 15/03/2027 con «$label»: próximo repaso $expected',
    ({ grade, label, expected }, { task }) => {
      const now = demoClock().now();
      const after = reviewCard(newCardMemory(now), grade, now);
      const actual = formatLongDate(studyDayOf(after.dueAt));
      task.meta.tableCase = { table: TABLE, input: `«${label}»`, expected, actual };
      expect(actual).toBe(expected);
    },
  );

  it('una tarjeta nueva está sin repasar y vence en el instante en que se crea', () => {
    const now = inBuenosAires('15/03/2027 10:00');
    const card = newCardMemory(now);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.lastReviewAt).toBeNull();
    expect(card.dueAt).toEqual(now);
  });

  it('sin pasos de aprendizaje de minutos: ninguna calificación vuelve antes de un día', () => {
    const now = inBuenosAires('15/03/2027 10:00');
    for (const grade of ['again', 'hard', 'good'] as const) {
      const first = reviewCard(newCardMemory(now), grade, now);
      expect(
        first.dueAt.getTime() - now.getTime(),
        `primer repaso, ${grade}`,
      ).toBeGreaterThanOrEqual(DAY_MS);
      // Y fallar un repaso ya aprendido tampoco la manda a los minutos.
      const later = inBuenosAires('20/03/2027 10:00');
      const relapse = reviewCard(first, 'again', later);
      expect(
        relapse.dueAt.getTime() - later.getTime(),
        `tras fallar, ${grade}`,
      ).toBeGreaterThanOrEqual(DAY_MS);
    }
  });

  it('sin variación al azar: el mismo repaso da siempre la misma fecha', () => {
    const now = inBuenosAires('15/03/2027 10:00');
    const dates = new Set<number>();
    for (let attempt = 0; attempt < 25; attempt++) {
      dates.add(reviewCard(newCardMemory(now), 'good', now).dueAt.getTime());
    }
    expect(dates.size).toBe(1);
  });

  it('el reloj es el que se le pasa: repasar el 20/03/2027 cuenta desde el 20/03/2027', () => {
    const first = inBuenosAires('15/03/2027 10:00');
    const second = inBuenosAires('20/03/2027 10:00');
    const reviewed = reviewCard(newCardMemory(first), 'good', first);
    const again = reviewCard(reviewed, 'good', second);
    expect(again.lastReviewAt).toEqual(second);
    expect(again.reps).toBe(2);
    expect(again.dueAt.getTime()).toBeGreaterThan(second.getTime() + 2 * DAY_MS);
  });

  it('si el reloj retrocede (la PC se atrasó o se restableció la fecha), repasar cuenta desde el último repaso y no falla', () => {
    const first = inBuenosAires('15/03/2027 10:00');
    const reviewed = reviewCard(newCardMemory(first), 'good', first);
    const before = inBuenosAires('10/03/2027 10:00');
    const again = reviewCard(reviewed, 'good', before);
    expect(again.reps).toBe(2);
    expect(again.lastReviewAt).toEqual(first);
    expect(again.dueAt.getTime()).toBeGreaterThan(first.getTime());
  });

  it('con retención 0,85 «La sabía» da 4 días, y 0,90 da 2', () => {
    const now = inBuenosAires('15/03/2027 10:00');
    const at90 = reviewCard(newCardMemory(now), 'good', now, 0.9);
    const at85 = reviewCard(newCardMemory(now), 'good', now, 0.85);
    expect(studyDayOf(at90.dueAt)).toBe('2027-03-17');
    expect(studyDayOf(at85.dueAt)).toBe('2027-03-19');
  });

  it('fallar una tarjeta aprendida suma un olvido y baja su estabilidad', () => {
    const first = inBuenosAires('15/03/2027 10:00');
    const second = inBuenosAires('17/03/2027 10:00');
    const learned = reviewCard(newCardMemory(first), 'good', first);
    const failed = reviewCard(learned, 'again', second);
    expect(failed.lapses).toBe(1);
    expect(failed.stability).toBeLessThan(learned.stability);
  });
});
