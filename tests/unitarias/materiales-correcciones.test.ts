import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyCorrections,
  blockKey,
  diffSegments,
  remapQuote,
} from '../../src/core/materials/corrections';
import { parseWebAddress } from '../../src/core/materials/web-address';

// La capa de correcciones (H-27): el texto de base de cada bloque nunca cambia; lo que corregís
// vive aparte, por bloque, y se vuelve a aplicar cuando se reprocesa la página.

const table =
  'Grados de libertad\t90 %\t95 %\t99 %\n10\t1,812\t2,228\t3,169\ninfinito\t1,645\t1,960\t2,576';
const blocks = [
  { unit: 6, type: 'paragraph', base: 'Antes de la tabla.' },
  { unit: 7, type: 'table', base: table },
  { unit: 7, type: 'paragraph', base: 'Después de la tabla.' },
] as const;

const correction = (over: Partial<Parameters<typeof applyCorrections>[1][number]> = {}) => ({
  id: 'c1',
  unit: 7,
  key: blockKey('table', table),
  before: table,
  after: table.replace('2,228', '2,229'),
  ...over,
});

describe('clave de un bloque', () => {
  it('[CA-116] es la misma para el mismo texto de base y cambia con el tipo o con una letra', () => {
    expect(blockKey('table', table)).toBe(blockKey('table', table));
    expect(blockKey('paragraph', table)).not.toBe(blockKey('table', table));
    expect(blockKey('table', `${table}.`)).not.toBe(blockKey('table', table));
  });
});

describe('volver a aplicar las correcciones', () => {
  it('[CA-116] si el texto de base es el mismo, la corrección se vuelve a aplicar', () => {
    const result = applyCorrections(blocks, [correction()]);
    expect(result.texts[1]).toBe(table.replace('2,228', '2,229'));
    expect(result.texts[0]).toBe('Antes de la tabla.');
    expect(result.outcomes).toEqual({ c1: 'applied' });
  });

  it('[CA-116] si el texto de base cambió, queda «En conflicto» y no se aplica ni se pierde', () => {
    const changed = blocks.map((block) =>
      block.type === 'table' ? { ...block, base: table.replace('1,812', '1,813') } : block,
    );
    const result = applyCorrections(changed, [correction()]);
    expect(result.outcomes).toEqual({ c1: 'conflict' });
    expect(result.texts[1]).toBe(table.replace('1,812', '1,813'));
  });

  it('[CA-116] una corrección en conflicto sigue en conflicto hasta que se decide', () => {
    const changed = blocks.map((block) =>
      block.type === 'table' ? { ...block, base: 'otra cosa' } : block,
    );
    const first = applyCorrections(changed, [correction()]);
    const second = applyCorrections(changed, [correction()]);
    expect(second).toEqual(first);
  });

  it('[CA-116] nunca se pierde una corrección: cada una sale como aplicada o en conflicto', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 6 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 6 }),
        (bases, after) => {
          const list = bases.map((base, index) => ({
            unit: 1 + (index % 2),
            type: 'paragraph' as const,
            base,
          }));
          const corrections = after.map((text, index) => ({
            id: `c${index}`,
            unit: 1 + (index % 2),
            key: blockKey('paragraph', bases[index] ?? text),
            before: bases[index] ?? text,
            after: text,
          }));
          const result = applyCorrections(list, corrections);
          expect(Object.keys(result.outcomes).sort()).toEqual(corrections.map((c) => c.id).sort());
          expect(result.texts).toHaveLength(list.length);
        },
      ),
    );
  });

  it('[CA-116] dos bloques con el mismo texto de base: la corrección va al primero que no tiene otra', () => {
    const twins = [
      { unit: 1, type: 'paragraph', base: 'igual' },
      { unit: 1, type: 'paragraph', base: 'igual' },
    ] as const;
    const result = applyCorrections(twins, [
      { id: 'a', unit: 1, key: blockKey('paragraph', 'igual'), before: 'igual', after: 'uno' },
      { id: 'b', unit: 1, key: blockKey('paragraph', 'igual'), before: 'igual', after: 'dos' },
    ]);
    expect(result.texts).toEqual(['uno', 'dos']);
  });
});

describe('diferencias que se resaltan', () => {
  it('[CA-115] resalta las cifras, los signos y las unidades que cambiaron', () => {
    const segments = diffSegments(
      'El margen es 0,8 minutos (95 %).',
      'El margen es −0,9 horas (95 %).',
    );
    const changed = segments.filter((segment) => segment.changed).map((segment) => segment.text);
    expect(changed.join(' ')).toContain('0,9');
    expect(changed.join(' ')).toContain('−');
    expect(changed.join(' ')).toContain('horas');
    const kinds = segments.filter((segment) => segment.changed).map((segment) => segment.kind);
    expect(kinds).toEqual(expect.arrayContaining(['figure', 'sign', 'unit']));
  });

  it('[CA-115] sin cambios no resalta nada y juntar los pedazos devuelve el texto nuevo', () => {
    expect(diffSegments('igual', 'igual').some((segment) => segment.changed)).toBe(false);
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.string({ maxLength: 40 }), (before, after) => {
        expect(
          diffSegments(before, after)
            .map((segment) => segment.text)
            .join(''),
        ).toBe(after);
      }),
    );
  });
});

describe('la frase que cita una tarjeta cuando cambia el bloque', () => {
  it('[CA-115] «actualizar» mueve la cita al texto corregido', () => {
    const before = 'Con 15 grados de libertad, t vale 2,131 y el margen es 0,8.';
    const after = 'Con 15 grados de libertad, t vale 2,132 y el margen es 0,8.';
    const start = before.indexOf('t vale');
    const end = before.indexOf(' y el');
    const moved = remapQuote(before, after, start, end);
    expect(after.slice(moved.start, moved.end)).toBe('t vale 2,132');
  });

  it('[CA-115] una cita antes o después del cambio queda igual, desplazada si hace falta', () => {
    const before = 'Uno dos tres cuatro';
    const after = 'Uno dos 3 y 3 cuatro';
    const first = remapQuote(before, after, 0, 3);
    expect(after.slice(first.start, first.end)).toBe('Uno');
    const last = remapQuote(before, after, before.indexOf('cuatro'), before.length);
    expect(after.slice(last.start, last.end)).toBe('cuatro');
  });

  it('[CA-115] el tramo nunca se sale del texto nuevo', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.string({ maxLength: 40 }),
        fc.nat(40),
        fc.nat(40),
        (before, after, a, b) => {
          const start = Math.min(a, b, before.length);
          const end = Math.min(Math.max(a, b), before.length);
          const moved = remapQuote(before, after, start, end);
          expect(moved.start).toBeGreaterThanOrEqual(0);
          expect(moved.end).toBeLessThanOrEqual(after.length);
          expect(moved.start).toBeLessThanOrEqual(moved.end);
        },
      ),
    );
  });
});

describe('direcciones web', () => {
  it('[CA-119] acepta http y https, con o sin espacios, y agrega https si falta', () => {
    expect(parseWebAddress(' https://es.wikipedia.org/wiki/Mediana_(estad%C3%ADstica) ')).toEqual({
      ok: true,
      url: 'https://es.wikipedia.org/wiki/Mediana_(estad%C3%ADstica)',
    });
    expect(parseWebAddress('http://localhost:8080/pagina.html')).toMatchObject({ ok: true });
    expect(parseWebAddress('es.wikipedia.org/wiki/Mediana')).toEqual({
      ok: true,
      url: 'https://es.wikipedia.org/wiki/Mediana',
    });
  });

  it('[CA-119] rechaza lo que no es una dirección web: otros esquemas, claves en la dirección, texto', () => {
    for (const bad of [
      'file:///C:/secreto.txt',
      'javascript:alert(1)',
      'ftp://servidor/archivo',
      ['https://usuario', ':', 'clave@sitio.com/'].join(''),
      'esto no es una dirección',
      '',
      'data:text/html,<p>hola</p>',
    ]) {
      expect(parseWebAddress(bad)).toEqual({ ok: false });
    }
  });

  it('[CA-119] el texto pegado con renglones o con más de una dirección no es una dirección', () => {
    expect(parseWebAddress('https://a.com\nhttps://b.com')).toEqual({ ok: false });
    expect(parseWebAddress('mirá https://a.com')).toEqual({ ok: false });
  });
});
