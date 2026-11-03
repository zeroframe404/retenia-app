import { describe, expect, it } from 'vitest';
import { MAX_TITLE_LENGTH } from '../../src/preload/contract/notes';
import { findFormulas } from '../../src/renderer/notes/editor/formula';
import { findMentionTrigger } from '../../src/renderer/notes/editor/mention-suggestion';

describe('editor · dónde hay fórmulas entre signos $', () => {
  const source = String.raw`\bar{x} \pm t \cdot s/\sqrt{n}`;

  it('[CA-373] encuentra lo que está entre dos $ con su posición en el texto', () => {
    const text = `Intervalo: $${source}$ para la media`;
    const start = text.indexOf('$');
    expect(findFormulas(text)).toEqual([{ from: start, to: start + source.length + 2, source }]);
  });

  it('encuentra varias fórmulas en el mismo texto', () => {
    expect(findFormulas('$a$ y también $b+c$').map((formula) => formula.source)).toEqual([
      'a',
      'b+c',
    ]);
  });

  it('sin nada adentro o con solo espacios no es una fórmula', () => {
    expect(findFormulas('dos signos $$ juntos')).toEqual([]);
    expect(findFormulas('$   $')).toEqual([]);
  });

  it('un solo $ no abre nada', () => {
    expect(findFormulas('solo uno $ acá')).toEqual([]);
  });

  it('no confunde precios en pesos con una fórmula', () => {
    expect(findFormulas('Pagué $500 y después $300')).toEqual([]);
    expect(findFormulas('Salió $5 y $6')).toEqual([]);
    expect(findFormulas('de $x$2 en adelante')).toEqual([]);
  });

  it('el texto original queda como está: la fórmula solo indica un tramo', () => {
    const text = `a $${source}$ b`;
    const [formula] = findFormulas(text);
    expect(text.slice(formula?.from, formula?.to)).toBe(`$${source}$`);
  });
});

describe('editor · el disparador «[[» de los enlaces entre notas', () => {
  it('[CA-374] «[[» seguido de letras da lo escrito y cuánto ocupa desde los corchetes', () => {
    expect(findMentionTrigger('Ver [[Interv')).toEqual({ query: 'Interv', length: 8 });
  });

  it('con solo «[[» la búsqueda es vacía (se ofrecen las notas sin filtrar)', () => {
    expect(findMentionTrigger('Ver [[')).toEqual({ query: '', length: 2 });
  });

  it('puede haber espacios en lo escrito', () => {
    expect(findMentionTrigger('Ver [[Media y disp')).toEqual({ query: 'Media y disp', length: 14 });
  });

  it('un solo corchete no dispara', () => {
    expect(findMentionTrigger('Ver [Interv')).toBeNull();
  });

  it('un enlace ya cerrado con «]]» no dispara', () => {
    expect(findMentionTrigger('Ver [[Media]] y más')).toBeNull();
  });

  it('si hay dos aperturas vale la última', () => {
    expect(findMentionTrigger('a [[b [[c')).toEqual({ query: 'c', length: 3 });
  });

  it('sin corchetes no dispara', () => {
    expect(findMentionTrigger('texto común')).toBeNull();
    expect(findMentionTrigger('')).toBeNull();
  });

  it('una búsqueda más larga que un título no dispara (el puente no la aceptaría)', () => {
    expect(findMentionTrigger(`[[${'a'.repeat(MAX_TITLE_LENGTH + 1)}`)).toBeNull();
    expect(findMentionTrigger(`[[${'a'.repeat(MAX_TITLE_LENGTH)}`)?.query).toHaveLength(
      MAX_TITLE_LENGTH,
    );
  });
});
