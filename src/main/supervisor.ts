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
}: {
  spawn: () => WorkerProcess;
  idleMs?: number;
}): WorkerClient {
  let current: WorkerProcess | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

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
    stop() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      drop('crashed');
    },
  };
}
