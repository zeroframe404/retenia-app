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

  it('el reloj de demostración con días sumados avanza de a 24 horas desde el 15/03/2027 10:00', () => {
    expect(demoClock(0).now()).toEqual(demoClock().now());
    expect(demoClock(1).now()).toEqual(inBuenosAires('16/03/2027 10:00'));
    expect(demoClock(7).now()).toEqual(inBuenosAires('22/03/2027 10:00'));
    expect(demoClock(35).now()).toEqual(inBuenosAires('19/04/2027 10:00'));
    expect(formatLongDate(studyDayOf(demoClock(7).now()))).toBe('lunes 22/03/2027');
    expect(formatLongDate(studyDayOf(demoClock(8).now()))).toBe('martes 23/03/2027');
  });
});
