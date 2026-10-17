import { afterEach, describe, expect, it } from 'vitest';
import { localDateTime, studyDayOf } from '../../src/core/study-day';
import { formatLongDate } from '../../src/preload/contract/texts';
import { inBuenosAires } from '../apoyo/fechas';

declare module 'vitest' {
  interface TaskMeta {
    // Una fila de la tabla de casos, para que el tablero muestre lo esperado y lo obtenido.
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

const TABLE = 'Día de estudio (corte a las 04:00 de Buenos Aires)';

// La tabla mínima del pedido de la Fase 02, más los bordes de mes, de año y del corte.
const cases = [
  { input: '15/03/2027 23:59', expected: 'lunes 15/03/2027' },
  { input: '16/03/2027 02:30', expected: 'lunes 15/03/2027' },
  { input: '16/03/2027 03:59', expected: 'lunes 15/03/2027' },
  { input: '16/03/2027 04:00', expected: 'martes 16/03/2027' },
  { input: '15/03/2027 04:00', expected: 'lunes 15/03/2027' },
  { input: '15/03/2027 03:59:59', expected: 'domingo 14/03/2027' },
  { input: '01/04/2027 02:00', expected: 'miércoles 31/03/2027' },
  { input: '01/01/2028 03:00', expected: 'viernes 31/12/2027' },
];

describe('día de estudio', () => {
  it.for(cases)(
    '[CA-002] día de estudio: $input en Buenos Aires cuenta para $expected',
    ({ input, expected }, { task }) => {
      const actual = formatLongDate(studyDayOf(inBuenosAires(input)));
      task.meta.tableCase = { table: TABLE, input, expected, actual };
      expect(actual).toBe(expected);
    },
  );

  describe('con la PC en otra zona horaria', () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    });

    it('[CA-002] el día de estudio no depende de la zona horaria de la PC', () => {
      process.env.TZ = 'Asia/Tokyo';
      expect(formatLongDate(studyDayOf(inBuenosAires('16/03/2027 02:30')))).toBe(
        'lunes 15/03/2027',
      );
      process.env.TZ = 'America/Los_Angeles';
      expect(formatLongDate(studyDayOf(inBuenosAires('16/03/2027 04:00')))).toBe(
        'martes 16/03/2027',
      );
    });

    it('la fecha y la hora de calendario son las de Buenos Aires, en cualquier zona de la PC', () => {
      process.env.TZ = 'Asia/Tokyo';
      expect(localDateTime(inBuenosAires('16/03/2027 02:30'))).toEqual({
        day: '2027-03-16',
        time: '02:30',
      });
    });
  });
});

describe('fecha y hora de calendario', () => {
  it('a diferencia del día de estudio, la madrugada es del día que dice el calendario', () => {
    expect(localDateTime(inBuenosAires('16/03/2027 02:30'))).toEqual({
      day: '2027-03-16',
      time: '02:30',
    });
    expect(localDateTime(inBuenosAires('15/03/2027 10:00'))).toEqual({
      day: '2027-03-15',
      time: '10:00',
    });
    expect(localDateTime(inBuenosAires('31/12/2027 23:59'))).toEqual({
      day: '2027-12-31',
      time: '23:59',
    });
  });
});
