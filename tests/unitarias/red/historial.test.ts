import { describe, expect, it } from 'vitest';
import { expandTemplates } from '../../../tools/lib/historial.mjs';

const ran = new Map(
  [
    '[CA-002] día de estudio: 16/03/2027 02:30 en Buenos Aires cuenta para lunes 15/03/2027',
    '[CA-002] día de estudio: 16/03/2027 04:00 en Buenos Aires cuenta para martes 16/03/2027',
    '[CA-002] el día de estudio no depende de la zona horaria de la PC',
    '[CA-001] cuesta $5 (texto con signo pesos)',
  ].map((title) => [title, { title }]),
);

describe('historial de resultados', () => {
  it('[CA-008] una prueba con tabla de casos se muestra con cada caso que corrió', () => {
    const listed = [
      {
        title: '[CA-002] día de estudio: $input en Buenos Aires cuenta para $expected',
        layer: 'Unitaria',
      },
      {
        title: '[CA-002] el día de estudio no depende de la zona horaria de la PC',
        layer: 'Unitaria',
      },
    ];
    expect(expandTemplates(listed, ran)).toEqual([
      {
        title:
          '[CA-002] día de estudio: 16/03/2027 02:30 en Buenos Aires cuenta para lunes 15/03/2027',
        layer: 'Unitaria',
      },
      {
        title:
          '[CA-002] día de estudio: 16/03/2027 04:00 en Buenos Aires cuenta para martes 16/03/2027',
        layer: 'Unitaria',
      },
      {
        title: '[CA-002] el día de estudio no depende de la zona horaria de la PC',
        layer: 'Unitaria',
      },
    ]);
  });

  it('[CA-008] una prueba con el título armado con una constante se muestra con el título con que corrió', () => {
    // Vitest lista el título tal como está escrito en el archivo, con la constante sin reemplazar.
    const template = ['[CA-021] quedan las $', '{KEPT} automáticas más nuevas'].join('');
    const runTitle = '[CA-021] quedan las 14 automáticas más nuevas';
    const withRun = new Map([...ran, [runTitle, { title: runTitle }]]);
    expect(expandTemplates([{ title: template, layer: 'Unitaria' }], withRun)).toEqual([
      { title: runTitle, layer: 'Unitaria' },
    ]);
  });

  it('[CA-008] si ningún caso corrió todavía, queda la plantilla para mostrarla «sin correr»', () => {
    const listed = [{ title: '[CA-009] crea $question', layer: 'Punta a punta' }];
    expect(expandTemplates(listed, ran)).toEqual(listed);
  });
});
