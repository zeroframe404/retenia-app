import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerClient, WorkerProblem, type WorkerProcess } from '../../src/main/supervisor';

// El supervisor de los procesos de trabajo (voz y materiales): los abre recién al primer pedido,
// reparte cada respuesta a su pedido, corta el proceso que vence su tiempo límite o se cae y
// abre otro en el pedido siguiente, y lo apaga tras un rato sin pedidos. El proceso es un doble
// que anota lo que recibe: el de verdad es un utilityProcess de Electron (punta a punta).

class FakeProcess extends EventEmitter implements WorkerProcess {
  sent: { id: number; [key: string]: unknown }[] = [];
  killed = false;
  postMessage(message: unknown): void {
    this.sent.push(message as { id: number });
  }
  kill(): boolean {
    this.killed = true;
    this.emit('exit', 1);
    return true;
  }
  reply(index: number, body: Record<string, unknown>): void {
    this.emit('message', { id: this.sent[index]?.id, ...body });
  }
}

let spawned: FakeProcess[] = [];
const client = () =>
  createWorkerClient({
    spawn: () => {
      const created = new FakeProcess();
      spawned.push(created);
      return created;
    },
    idleMs: 300_000,
  });

beforeEach(() => {
  spawned = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('supervisor de procesos de trabajo', () => {
  it('no abre el proceso hasta el primer pedido y después lo reusa (simulado)', async () => {
    const worker = client();
    expect(spawned).toHaveLength(0);
    const first = worker.request({ kind: 'uno' }, 60_000);
    expect(spawned).toHaveLength(1);
    spawned[0]?.reply(0, { ok: true, result: 'listo' });
    await expect(first).resolves.toBe('listo');
    const second = worker.request({ kind: 'dos' }, 60_000);
    spawned[0]?.reply(1, { ok: true, result: 2 });
    await expect(second).resolves.toBe(2);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.sent.map((m) => m.kind)).toEqual(['uno', 'dos']);
  });

  it('cada respuesta llega a su pedido aunque vuelvan en otro orden (simulado)', async () => {
    const worker = client();
    const a = worker.request({ kind: 'a' }, 60_000);
    const b = worker.request({ kind: 'b' }, 60_000);
    spawned[0]?.reply(1, { ok: true, result: 'B' });
    spawned[0]?.reply(0, { ok: true, result: 'A' });
    await expect(Promise.all([a, b])).resolves.toEqual(['A', 'B']);
  });

  it('un problema que informa el proceso llega al pedido con su nombre (simulado)', async () => {
    const worker = client();
    const pending = worker.request({ kind: 'decir' }, 60_000);
    spawned[0]?.reply(0, { ok: false, problem: 'noModels' });
    await expect(pending).rejects.toEqual(new WorkerProblem('noModels'));
  });

  it('si un pedido vence su tiempo límite, corta el proceso y el próximo pedido abre otro (simulado)', async () => {
    const worker = client();
    const pending = worker.request({ kind: 'lento' }, 60_000);
    const failed = expect(pending).rejects.toEqual(new WorkerProblem('timeout'));
    await vi.advanceTimersByTimeAsync(60_000);
    await failed;
    expect(spawned[0]?.killed).toBe(true);
    const next = worker.request({ kind: 'otro' }, 60_000);
    expect(spawned).toHaveLength(2);
    spawned[1]?.reply(0, { ok: true, result: 'bien' });
    await expect(next).resolves.toBe('bien');
  });

  it('si el proceso se cae, lo pendiente falla y el próximo pedido abre uno nuevo (simulado)', async () => {
    const worker = client();
    const pending = worker.request({ kind: 'algo' }, 60_000);
    spawned[0]?.emit('exit', 3);
    await expect(pending).rejects.toEqual(new WorkerProblem('crashed'));
    const next = worker.request({ kind: 'algo' }, 60_000);
    expect(spawned).toHaveLength(2);
    spawned[1]?.reply(0, { ok: true, result: null });
    await expect(next).resolves.toBeNull();
  });

  it('un mensaje mal formado del proceso se ignora (simulado)', async () => {
    const worker = client();
    const pending = worker.request({ kind: 'algo' }, 60_000);
    spawned[0]?.emit('message', 'cualquier cosa');
    spawned[0]?.emit('message', { id: 999, ok: true, result: 'de nadie' });
    spawned[0]?.reply(0, { ok: true, result: 'el bueno' });
    await expect(pending).resolves.toBe('el bueno');
  });

  it('después de cinco minutos sin pedidos apaga el proceso (simulado)', async () => {
    const worker = client();
    const pending = worker.request({ kind: 'algo' }, 60_000);
    spawned[0]?.reply(0, { ok: true, result: 1 });
    await pending;
    await vi.advanceTimersByTimeAsync(299_000);
    expect(spawned[0]?.killed).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawned[0]?.killed).toBe(true);
  });

  it('apagarlo a mano corta el proceso y rechaza lo pendiente (simulado)', async () => {
    const worker = client();
    const pending = worker.request({ kind: 'algo' }, 60_000);
    worker.stop();
    await expect(pending).rejects.toEqual(new WorkerProblem('crashed'));
    expect(spawned[0]?.killed).toBe(true);
  });
});
