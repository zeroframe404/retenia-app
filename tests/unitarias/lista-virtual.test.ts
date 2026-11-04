import { describe, expect, it } from 'vitest';
import { visibleWindow } from '../../src/renderer/cards/windowing';

// La lista de tarjetas que soporta miles de filas (H-14): solo se arman las que se ven.

describe('la lista que soporta miles de filas', () => {
  it('[CA-056] con 10.000 filas solo calcula las que se ven, más un margen', () => {
    const view = visibleWindow({
      count: 10_000,
      rowHeight: 64,
      viewportHeight: 640,
      scrollTop: 64 * 5000,
      overscan: 5,
    });
    expect(view.start).toBe(4995);
    expect(view.end).toBe(5015);
    expect(view.totalHeight).toBe(640_000);
    expect(view.offsetTop).toBe(64 * 4995);
  });

  it('al principio y al final no se sale de la lista', () => {
    expect(
      visibleWindow({ count: 100, rowHeight: 50, viewportHeight: 500, scrollTop: 0, overscan: 3 }),
    ).toMatchObject({ start: 0, end: 13 });
    expect(
      visibleWindow({
        count: 100,
        rowHeight: 50,
        viewportHeight: 500,
        scrollTop: 99_999,
        overscan: 3,
      }),
    ).toMatchObject({ end: 100 });
  });

  it('una lista vacía no tiene filas ni alto', () => {
    expect(
      visibleWindow({ count: 0, rowHeight: 50, viewportHeight: 500, scrollTop: 0, overscan: 3 }),
    ).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });
});
