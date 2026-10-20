import { describe, expect, it } from 'vitest';
import { ZOOM_LEVELS, zoomStep } from '../../src/core/zoom';

// El zoom de la ventana con el teclado: Ctrl y + agranda, Ctrl y - achica y Ctrl y 0 vuelve al
// 100 %. Retenia no tiene menú, así que las teclas del zoom las maneja ella (CA-035: el zoom al
// 150 % se prueba con Ctrl y +, M06.6).

describe('zoom con el teclado', () => {
  it('[CA-035] Ctrl y + sube el zoom paso a paso: 100 %, 110 %, 125 % y 150 %', () => {
    let zoom = 1;
    const seen: number[] = [];
    for (let presses = 0; presses < 3; presses += 1) {
      zoom = zoomStep(zoom, 'in');
      seen.push(zoom);
    }
    expect(seen).toEqual([1.1, 1.25, 1.5]);
  });

  it('[CA-035] Ctrl y - lo baja por los mismos pasos', () => {
    expect(zoomStep(1.5, 'out')).toBe(1.25);
    expect(zoomStep(1.25, 'out')).toBe(1.1);
    expect(zoomStep(1.1, 'out')).toBe(1);
    expect(zoomStep(1, 'out')).toBe(0.9);
  });

  it('[CA-035] Ctrl y 0 vuelve al 100 % desde cualquier zoom', () => {
    for (const zoom of [0.25, 0.5, 1, 1.5, 2, 5]) {
      expect(zoomStep(zoom, 'reset')).toBe(1);
    }
  });

  it('no pasa del 500 % ni baja del 25 %', () => {
    expect(ZOOM_LEVELS.at(-1)).toBe(5);
    expect(ZOOM_LEVELS[0]).toBe(0.25);
    expect(zoomStep(5, 'in')).toBe(5);
    expect(zoomStep(0.25, 'out')).toBe(0.25);
  });

  it('desde un zoom entre dos pasos (uno cambiado por otro medio) sigue por el próximo paso de la escala', () => {
    expect(zoomStep(1.2, 'in')).toBe(1.25);
    expect(zoomStep(1.2, 'out')).toBe(1.1);
    expect(zoomStep(7, 'out')).toBe(5);
    expect(zoomStep(0.1, 'in')).toBe(0.25);
  });

  it('la escala sube siempre y los pasos son los de un navegador', () => {
    expect([...ZOOM_LEVELS]).toEqual([...ZOOM_LEVELS].sort((a, b) => a - b));
    expect(ZOOM_LEVELS).toContain(1.5);
    expect(ZOOM_LEVELS).toContain(2);
  });
});
