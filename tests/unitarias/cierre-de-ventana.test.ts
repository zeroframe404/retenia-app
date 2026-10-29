import { describe, expect, it } from 'vitest';
import { createCloseGuard } from '../../src/main/close-guard';

// Cerrar la ventana nunca pierde lo escrito (CA-043): el cierre se frena hasta que la pantalla
// guarda, y un segundo cierre mientras tanto no se cuela.

function deferred() {
  let done: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    done = resolve;
  });
  return { promise, done };
}

describe('el cierre de la ventana espera al guardado', () => {
  it('[CA-043] el primer cierre se frena, guarda y recién después deja cerrar', async () => {
    const flush = deferred();
    const closed: string[] = [];
    const guard = createCloseGuard(
      () => flush.promise,
      () => closed.push('cerrada'),
    );

    expect(guard.onClose()).toBe('prevent');
    expect(closed).toEqual([]);
    flush.done();
    await flush.promise;
    await Promise.resolve();
    expect(closed).toEqual(['cerrada']);
    expect(guard.onClose()).toBe('allow');
  });

  it('[CA-043] un segundo cierre mientras guarda también se frena y no guarda dos veces', async () => {
    const flush = deferred();
    let flushes = 0;
    const closed: string[] = [];
    const guard = createCloseGuard(
      () => {
        flushes += 1;
        return flush.promise;
      },
      () => closed.push('cerrada'),
    );

    expect(guard.onClose()).toBe('prevent');
    expect(guard.onClose()).toBe('prevent');
    expect(flushes).toBe(1);
    expect(closed).toEqual([]);

    flush.done();
    await flush.promise;
    await Promise.resolve();
    expect(closed).toEqual(['cerrada']);
  });

  it('[CA-043] si el guardado falla, la ventana se cierra igual para no dejarla colgada', async () => {
    const closed: string[] = [];
    const guard = createCloseGuard(
      () => Promise.reject(new Error('sin respuesta')),
      () => closed.push('cerrada'),
    );

    expect(guard.onClose()).toBe('prevent');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toEqual(['cerrada']);
  });
});
