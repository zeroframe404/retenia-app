import { afterEach, describe, expect, it } from 'vitest';
import { studyDayOf } from '../../src/core/study-day';
import { formatLongDate } from '../../src/preload/contract/texts';
import { inBuenosAires } from '../apoyo/fechas';

declare module 'vitest' {
  interface TaskMeta {
    caso?: { tabla: string; entrada: string; esperado: string; obtenido: string };
  }
}

const TABLE = 'Día de estudio (corte a las 04:00 de Buenos Aires)';

// La tabla mínima del pedido de la Fase 02, más los bordes de mes, de año y del corte.
const cases = [
  { entrada: '15/03/2027 23:59', esperado: 'lunes 15/03/2027' },
  { entrada: '16/03/2027 02:30', esperado: 'lunes 15/03/2027' },
  { entrada: '16/03/2027 03:59', esperado: 'lunes 15/03/2027' },
  { entrada: '16/03/2027 04:00', esperado: 'martes 16/03/2027' },
  { entrada: '15/03/2027 04:00', esperado: 'lunes 15/03/2027' },
  { entrada: '15/03/2027 03:59:59', esperado: 'domingo 14/03/2027' },
  { entrada: '01/04/2027 02:00', esperado: 'miércoles 31/03/2027' },
  { entrada: '01/01/2028 03:00', esperado: 'viernes 31/12/2027' },
];

describe('día de estudio', () => {
  it.for(cases)(
    '[CA-002] día de estudio: $entrada en Buenos Aires cuenta para $esperado',
    ({ entrada, esperado }, { task }) => {
      const obtenido = formatLongDate(studyDayOf(inBuenosAires(entrada)));
      task.meta.caso = { tabla: TABLE, entrada, esperado, obtenido };
      expect(obtenido).toBe(esperado);
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
  });
});
