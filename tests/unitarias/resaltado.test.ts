import { describe, expect, it } from 'vitest';
import { locatePhrase, type TextItem } from '../../src/core/highlight';

// Dónde cae una frase sobre la imagen de una página: los rectángulos a resaltar, a partir de los
// renglones que extrae pdf.js (cada uno con su texto y su caja en la hoja).

const line = (text: string, y: number, x = 68, charWidth = 5): TextItem => ({
  text,
  x,
  y,
  width: text.length * charWidth,
  height: 11,
});

const PAGE = [
  line('Ese conjunto completo se llama', 100),
  line('población.', 116),
  line(
    'Una muestra es una parte de la población que se elige para observarla y sacar conclusiones',
    142,
  ),
  line('sobre el todo.', 158),
  line('Si la muestra está bien elegida', 184),
];

describe('ubicar una frase en la página', () => {
  it('[CA-028] una frase que ocupa dos renglones enteros se resalta con las dos cajas de esos renglones', () => {
    const rects = locatePhrase(
      PAGE,
      'Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.',
    );
    expect(rects).toEqual([
      { x: 68, y: 142, width: PAGE[2]?.width, height: 11 },
      { x: 68, y: 158, width: PAGE[3]?.width, height: 11 },
    ]);
  });

  it('[CA-028] una frase en medio de un renglón se resalta solo en su tramo', () => {
    const rects = locatePhrase([line('abcdefghij', 10, 20, 10)], 'cde');
    expect(rects).toEqual([{ x: 40, y: 10, width: 30, height: 11 }]);
  });

  it('[CA-028] el corte de renglón cuenta como un espacio y los espacios repetidos no importan', () => {
    const rects = locatePhrase(PAGE, 'sacar   conclusiones\nsobre el');
    expect(rects).toHaveLength(2);
    expect(rects?.[0]?.y).toBe(142);
    expect(rects?.[1]).toEqual({ x: 68, y: 158, width: 8 * 5, height: 11 });
  });

  it('[CA-028] los trozos vacíos que deja pdf.js entre renglones no corren la cuenta', () => {
    const withBlanks = [PAGE[0] as TextItem, { ...line('', 108), width: 0 }, PAGE[1] as TextItem];
    expect(locatePhrase(withBlanks, 'se llama población.')).toEqual([
      {
        x: 68 + 'Ese conjunto completo '.length * 5,
        y: 100,
        width: 'se llama'.length * 5,
        height: 11,
      },
      { x: 68, y: 116, width: 'población.'.length * 5, height: 11 },
    ]);
  });

  it('[CA-028] una frase que no está en la página no se resalta', () => {
    expect(locatePhrase(PAGE, 'teorema central del límite')).toBeNull();
    expect(locatePhrase(PAGE, '   ')).toBeNull();
    expect(locatePhrase([], 'población')).toBeNull();
  });
});
