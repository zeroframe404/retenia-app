import { describe, expect, it } from 'vitest';
import { demoClock, fixedClock, systemClock } from '../../src/core/clock';
import { studyDayOf } from '../../src/core/study-day';
import { formatLongDate } from '../../src/preload/contract/texts';
import { inBuenosAires } from '../apoyo/fechas';

describe('reloj', () => {
  it('el reloj de demostración da siempre lunes 15/03/2027 10:00 de Buenos Aires', () => {
    const clock = demoClock();
    expect(clock.now().toISOString()).toBe('2027-03-15T13:00:00.000Z');
    expect(clock.now().getTime()).toBe(inBuenosAires('15/03/2027 10:00').getTime());
    expect(formatLongDate(studyDayOf(clock.now()))).toBe('lunes 15/03/2027');
  });

  it('el reloj fijo devuelve copias: cambiar la fecha devuelta no lo mueve', () => {
    const clock = fixedClock(inBuenosAires('20/03/2027 18:45'));
    clock.now().setUTCFullYear(1999);
    expect(clock.now().getTime()).toBe(inBuenosAires('20/03/2027 18:45').getTime());
  });

  it('el reloj del sistema da una fecha válida', () => {
    expect(Number.isNaN(systemClock().now().getTime())).toBe(false);
  });
});
