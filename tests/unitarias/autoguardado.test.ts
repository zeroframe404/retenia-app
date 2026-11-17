import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver } from '../../src/renderer/notes/editor/autosave';

// El guardado automático con tope (Fase 10, borrador de «Tu respuesta…»): aunque se escriba de
// corrido, sin pausas, se guarda al menos cada `maxWait` milisegundos. Reloj de mentira.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('guardado automático con tope', () => {
  it('[CA-073] escribiendo sin parar 5 segundos, el borrador se guarda cada 2 segundos y no solo al final', async () => {
    const save = vi.fn(async () => undefined);
    const saver = new Autosaver({
      delay: 2000,
      maxWait: 2000,
      save,
      onStatus: () => undefined,
      onSaved: () => undefined,
    });
    for (let ms = 0; ms < 5000; ms += 300) {
      saver.touch();
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('sin tope (como en los apuntes) se guarda recién 2 segundos después de la última tecla', async () => {
    const save = vi.fn(async () => undefined);
    const saver = new Autosaver({
      delay: 2000,
      save,
      onStatus: () => undefined,
      onSaved: () => undefined,
    });
    for (let ms = 0; ms < 5000; ms += 300) {
      saver.touch();
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
