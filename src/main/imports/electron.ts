import { join } from 'node:path';
import { app, utilityProcess } from 'electron';
import type { Clock } from '../../core/clock';
import type { Workspace } from '../../data/workspace';
import { createWorkerClient, type WorkerProcess } from '../supervisor';
import { createTransfersService, type TransfersService } from './service';

// El proceso de trabajo de importar y exportar (Fase 15): sin red, con tope de memoria y un tiempo
// máximo por pedido. Un mazo grande o una exportación con muchos originales tardan: 30 minutos.
const HEAP_LIMIT_MB = 2048;
const MEMORY_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;
const TIMEOUT_MS = 30 * 60 * 1000;

export function startTransfers({ workspace, clock }: { workspace: Workspace; clock: Clock }): {
  service: TransfersService;
  stop: () => Promise<void>;
} {
  const here = import.meta.dirname;
  const worker = createWorkerClient({
    spawn: () =>
      utilityProcess.fork(join(here, 'transfers.js'), [], {
        serviceName: 'Retenia · importar y exportar',
        execArgv: [`--max-old-space-size=${HEAP_LIMIT_MB}`],
      }) as unknown as WorkerProcess,
    memory: {
      limitBytes: MEMORY_LIMIT_BYTES,
      usageOf: (process) => {
        const metric = app.getAppMetrics().find((entry) => entry.pid === process.pid);
        return metric ? metric.memory.workingSetSize * 1024 : null;
      },
    },
  });
  const service = createTransfersService({
    workspace,
    clock,
    execute: (task) => worker.request(task as Record<string, unknown>, TIMEOUT_MS),
  });
  return {
    service,
    stop: async () => {
      worker.stop();
    },
  };
}
