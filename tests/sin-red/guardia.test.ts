import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

// Las pruebas de esta carpeta corren con la red bloqueada (tests/apoyo/sin-red.cjs). Esta
// comprueba el bloqueo mismo: si dejara de andar, las demás dirían «sin internet» sin probarlo.

describe('red bloqueada', () => {
  it('un pedido a internet desde la prueba falla con «SIN RED»', async () => {
    await expect(fetch('https://huggingface.co/')).rejects.toThrow(/^SIN RED/);
  });

  it('un pedido a internet desde otro hilo (como los del reconocimiento de escaneos) también falla', async () => {
    const code = `
      const { parentPort } = require('node:worker_threads');
      fetch('https://cdn.jsdelivr.net/').then(
        () => parentPort.postMessage('salió a la red'),
        (error) => parentPort.postMessage(String(error.message)),
      );
    `;
    const worker = new Worker(code, { eval: true });
    const answer = await new Promise<string>((resolve) => worker.once('message', resolve));
    await worker.terminate();
    expect(answer).toMatch(/^SIN RED/);
  });
});
