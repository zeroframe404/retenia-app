import { describe, expect, it } from 'vitest';
import { boxesFor, quoteContext, relocateQuote } from '../../src/core/materials/relocate';

// Una cita anclada (H-26): la tarjeta guarda la frase con un poco de contexto y, cada vez que se
// abre, se la vuelve a buscar en el material. Si no aparece una sola vez, queda «Fuente a
// reubicar»: nunca se resalta algo que no es.

const units = [
  {
    unit: 1,
    text: 'La población es el conjunto completo. Una muestra es una parte de la población.',
  },
  {
    unit: 2,
    text: 'Un parámetro describe a la población. Un estadístico se calcula con la muestra.',
  },
  { unit: 3, text: 'La media es el centro. La media es el centro.' },
];

describe('reubicar una cita', () => {
  it('[CA-110] la cita está en su página: queda ubicada', () => {
    const quote = 'Un estadístico se calcula con la muestra.';
    const result = relocateQuote(units, { unit: 2, quote, before: '', after: '' });
    expect(result).toEqual({
      status: 'located',
      unit: 2,
      start: units[1]?.text.indexOf(quote),
      end: (units[1]?.text.indexOf(quote) ?? 0) + quote.length,
    });
  });

  it('la cita se movió a la página vecina (la lectura cambió): se la encuentra ahí', () => {
    const quote = 'Una muestra es una parte de la población.';
    const result = relocateQuote(units, { unit: 2, quote, before: '', after: '' });
    expect(result).toMatchObject({ status: 'located', unit: 1 });
  });

  it('los espacios repetidos o los saltos no impiden encontrarla', () => {
    const result = relocateQuote(units, {
      unit: 1,
      quote: 'Una   muestra es\nuna parte',
      before: '',
      after: '',
    });
    expect(result).toMatchObject({ status: 'located', unit: 1 });
  });

  it('dos apariciones iguales: el contexto decide; si no alcanza, «Fuente a reubicar»', () => {
    const text = units[2]?.text ?? '';
    const second = text.lastIndexOf('La media es el centro.');
    expect(
      relocateQuote(units, {
        unit: 3,
        quote: 'La media es el centro.',
        before: 'centro. ',
        after: '',
      }),
    ).toEqual({ status: 'located', unit: 3, start: second, end: second + 22 });
    expect(
      relocateQuote(units, { unit: 3, quote: 'La media es el centro.', before: '', after: '' }),
    ).toEqual({ status: 'relocate' });
  });

  it('la cita ya no está en ningún lado: «Fuente a reubicar»', () => {
    expect(
      relocateQuote(units, { unit: 1, quote: 'Una frase que no existe.', before: '', after: '' }),
    ).toEqual({ status: 'relocate' });
  });

  it('el contexto guardado son hasta 40 letras de cada lado', () => {
    const text = units[0]?.text ?? '';
    const start = text.indexOf('Una muestra');
    expect(quoteContext(text, start, text.length)).toEqual({
      before: 'La población es el conjunto completo. ',
      after: '',
    });
  });
});

describe('las cajas de un tramo', () => {
  it('el tramo de cada renglón, en proporción a sus letras', () => {
    const spans = [
      { start: 0, end: 10, box: { page: 2, x: 100, y: 50, width: 100, height: 12 } },
      { start: 11, end: 21, box: { page: 2, x: 100, y: 66, width: 200, height: 12 } },
    ];
    expect(boxesFor(spans, 5, 16)).toEqual([
      { page: 2, x: 150, y: 50, width: 50, height: 12 },
      { page: 2, x: 100, y: 66, width: 100, height: 12 },
    ]);
  });

  it('los renglones sin caja (Word, Markdown, texto) no dan cajas', () => {
    expect(boxesFor([{ start: 0, end: 10, box: null }], 0, 5)).toEqual([]);
  });
});
