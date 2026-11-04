import { describe, expect, it } from 'vitest';
import { casesSection } from '../../../tools/lib/tablero-casos.mjs';

// La sección del tablero que muestra cada tabla de casos con lo esperado y lo obtenido: la de la
// Fase 09 es la «Tabla de casos del motor» (prueba manual M09.1).

const result = (
  title: string,
  status: 'passed' | 'failed',
  input: string,
  expected: string,
  actual: string,
) => ({
  title,
  file: 'x',
  layer: 'unitarias',
  status,
  messages: [],
  durationMs: 1,
  date: '2026-11-04T12:00:00.000Z',
  mode: 'verificar',
  tableCase: { table: 'Tabla de casos del motor', input, expected, actual },
});

describe('tablero: tablas de casos', () => {
  it('[CA-059] muestra la «Tabla de casos del motor» para abrir, con cuántos casos coinciden y, por caso, lo esperado y lo obtenido', () => {
    const html = casesSection([
      result(
        'a',
        'passed',
        'C01 · tarjeta nueva, La sabía el 15/03/2027',
        '17/03/2027',
        '17/03/2027',
      ),
      result(
        'b',
        'passed',
        'C02 · tarjeta nueva, Con dudas el 15/03/2027',
        '16/03/2027',
        '16/03/2027',
      ),
      result(
        'c',
        'failed',
        'C03 · tarjeta nueva, No la sabía el 15/03/2027',
        '16/03/2027',
        '17/03/2027',
      ),
    ]);
    expect(html).toContain(
      '<details class="casos"><summary>Tabla de casos del motor · 3 casos · 2 iguales</summary>',
    );
    expect(html).toContain(
      '<tr><td>C01 · tarjeta nueva, La sabía el 15/03/2027</td><td>17/03/2027</td><td>17/03/2027</td><td><span class="chip passed">Pasó</span></td></tr>',
    );
    expect(html).toContain(
      '<tr><td>C03 · tarjeta nueva, No la sabía el 15/03/2027</td><td>16/03/2027</td><td>17/03/2027</td><td><span class="chip failed">Falló</span></td></tr>',
    );
    expect(html.indexOf('C01')).toBeLessThan(html.indexOf('C02'));
  });

  it('sin resultados lo dice, y escapa lo que viene de los títulos', () => {
    expect(casesSection([])).toBe(
      '<p class="nota">Todavía no hay tablas de casos con resultados.</p>',
    );
    expect(casesSection([result('x', 'passed', '<b>', '1', '1')])).toContain('<td>&lt;b&gt;</td>');
  });
});
