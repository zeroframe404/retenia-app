import { type WorkerProblemName, workerResponse } from './workers/protocol';

// El supervisor de los procesos de trabajo (docs/arquitectura.md, sección 1): abre el proceso
// recién con el primer pedido, reparte cada respuesta a su pedido por número, corta el proceso
// que vence el tiempo límite de un pedido o que se cae (lo pendiente falla y el pedido siguiente
// abre otro) y lo apaga después de un rato sin pedidos. No decide nada de negocio.

export interface WorkerProcess {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  kill(): boolean;
  // El número de proceso del sistema (para medir cuánta memoria usa).
  readonly pid?: number | undefined;
}

export class WorkerProblem extends Error {
  readonly problem: WorkerProblemName;
  constructor(problem: WorkerProblemName) {
    super(`El proceso de trabajo no pudo terminar (${problem})`);
    this.name = 'WorkerProblem';
    this.problem = problem;
  }
}

export interface WorkerClient {
  request(message: Record<string, unknown>, timeoutMs: number): Promise<unknown>;
  // Corta el proceso actual: lo pendiente falla con ese motivo (cancelar un material, pausar).
  interrupt(problem: WorkerProblemName): void;
  stop(): void;
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: WorkerProblem) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createWorkerClient({
  spawn,
  idleMs = 5 * 60_000,
  memory,
}: {
  spawn: () => WorkerProcess;
  idleMs?: number;
  // El vigilante de memoria: si el proceso pasa del tope mientras trabaja, se lo corta y lo
  // pendiente falla con «memory» (cuenta como intento fallido).
  memory?: {
    limitBytes: number;
    usageOf: (worker: WorkerProcess) => number | null;
    everyMs?: number;
  };
}): WorkerClient {
  let current: WorkerProcess | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let memoryTimer: ReturnType<typeof setInterval> | null = null;

  const failAll = (problem: WorkerProblemName) => {
    for (const [id, task] of pending) {
      clearTimeout(task.timer);
      pending.delete(id);
      task.reject(new WorkerProblem(problem));
    }
  };

  // Corta el proceso actual (si queda alguno) y lo olvida: el próximo pedido abre otro.
  const drop = (problem: WorkerProblemName) => {
    const dying = current;
    current = null;
    failAll(problem);
    if (dying) {
      dying.kill();
    }
  };

  const watchMemory = () => {
    if (!memory || memoryTimer) {
      return;
    }
    memoryTimer = setInterval(() => {
      if (!current || pending.size === 0) {
        return;
      }
      const used = memory.usageOf(current);
      if (used !== null && used > memory.limitBytes) {
        drop('memory');
      }
    }, memory.everyMs ?? 1000);
    memoryTimer.unref?.();
  };

  const touchIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (pending.size === 0 && current) {
      idleTimer = setTimeout(() => drop('crashed'), idleMs);
    }
  };

  const ensure = (): WorkerProcess => {
    if (current) {
      return current;
    }
    const created = spawn();
    current = created;
    watchMemory();
    created.on('message', (raw) => {
      const parsed = workerResponse.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      const task = pending.get(parsed.data.id);
      if (!task) {
        return;
      }
      clearTimeout(task.timer);
      pending.delete(parsed.data.id);
      if (parsed.data.ok) {
        task.resolve(parsed.data.result);
      } else {
        task.reject(new WorkerProblem(parsed.data.problem));
      }
      touchIdle();
    });
    created.on('exit', () => {
      if (current === created) {
        current = null;
        failAll('crashed');
      }
    });
    return created;
  };

  return {
    request(message, timeoutMs) {
      const worker = ensure();
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new WorkerProblem('timeout'));
            drop('crashed');
          }
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        touchIdle();
        worker.postMessage({ ...message, id });
      });
    },
    interrupt(problem) {
      drop(problem);
    },
    stop() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (memoryTimer) {
        clearInterval(memoryTimer);
        memoryTimer = null;
      }
      drop('crashed');
    },
  };
}
