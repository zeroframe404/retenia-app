import { describe, expect, it } from 'vitest';
import { expandirPlantillas } from '../../../tools/lib/historial.mjs';

const corridas = new Map(
  [
    '[CA-002] día de estudio: 16/03/2027 02:30 en Buenos Aires cuenta para lunes 15/03/2027',
    '[CA-002] día de estudio: 16/03/2027 04:00 en Buenos Aires cuenta para martes 16/03/2027',
    '[CA-002] el día de estudio no depende de la zona horaria de la PC',
    '[CA-001] cuesta $5 (texto con signo pesos)',
  ].map((titulo) => [titulo, { titulo }]),
);

describe('historial de resultados', () => {
  it('[CA-008] una prueba con tabla de casos se muestra con cada caso que corrió', () => {
    const listadas = [
      {
        titulo: '[CA-002] día de estudio: $entrada en Buenos Aires cuenta para $esperado',
        capa: 'Unitaria',
      },
      {
        titulo: '[CA-002] el día de estudio no depende de la zona horaria de la PC',
        capa: 'Unitaria',
      },
    ];
    expect(expandirPlantillas(listadas, corridas)).toEqual([
      {
        titulo:
          '[CA-002] día de estudio: 16/03/2027 02:30 en Buenos Aires cuenta para lunes 15/03/2027',
        capa: 'Unitaria',
      },
      {
        titulo:
          '[CA-002] día de estudio: 16/03/2027 04:00 en Buenos Aires cuenta para martes 16/03/2027',
        capa: 'Unitaria',
      },
      {
        titulo: '[CA-002] el día de estudio no depende de la zona horaria de la PC',
        capa: 'Unitaria',
      },
    ]);
  });

  it('[CA-008] si ningún caso corrió todavía, queda la plantilla para mostrarla «sin correr»', () => {
    const listadas = [{ titulo: '[CA-009] crea $pregunta', capa: 'Punta a punta' }];
    expect(expandirPlantillas(listadas, corridas)).toEqual(listadas);
  });
});
