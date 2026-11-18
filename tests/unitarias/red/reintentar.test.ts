import { describe, expect, it } from 'vitest';
import { retryLaunch } from '../../../tools/lib/reintentar.mjs';

// El arranque del programa en la máquina de GitHub a veces se corta antes de abrir
// («electron.launch: WebSocket error: read ECONNRESET»). Se reintenta solo el arranque, hasta
// tres veces; una falla de la prueba misma nunca se reintenta.

const noWait = async () => {};

describe('reintento del arranque del programa', () => {
  it('devuelve el resultado si el arranque sale a la primera', async () => {
    let calls = 0;
    const result = await retryLaunch(
      async () => {
        calls += 1;
        return 'abierto';
      },
      { pause: noWait },
    );
    expect(result).toBe('abierto');
    expect(calls).toBe(1);
  });

  it('reintenta cuando el arranque se corta y devuelve lo que salió bien', async () => {
    let calls = 0;
    const result = await retryLaunch(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error('electron.launch: WebSocket error: read ECONNRESET');
        }
        return 'abierto';
      },
      { pause: noWait },
    );
    expect(result).toBe('abierto');
    expect(calls).toBe(3);
  });

  it('si los tres intentos fallan, muestra el último error', async () => {
    let calls = 0;
    await expect(
      retryLaunch(
        async () => {
          calls += 1;
          throw new Error(`electron.launch: corte ${calls}`);
        },
        { pause: noWait },
      ),
    ).rejects.toThrow('electron.launch: corte 3');
    expect(calls).toBe(3);
  });

  it('un error que no es del arranque no se reintenta', async () => {
    let calls = 0;
    await expect(
      retryLaunch(
        async () => {
          calls += 1;
          throw new Error('expect(received).toBe(expected)');
        },
        { pause: noWait },
      ),
    ).rejects.toThrow('expect(received)');
    expect(calls).toBe(1);
  });
});
