import { dirname, join } from 'node:path';
import { app, powerMonitor, protocol, utilityProcess } from 'electron';
import type { Clock } from '../../core/clock';
import type { Workspace } from '../../data/workspace';
import type { MaterialEvent } from '../../preload/contract/events';
import type { NetGate } from '../net-gate';
import { createWorkerClient, type WorkerProcess } from '../supervisor';
import { ORIGINAL_SCHEME, serveOriginal } from './original-protocol';
import { isOriginalExtension } from './originals';
import { createMaterialsService, type MaterialsService } from './service';

// Las piezas de Electron de los materiales (Fase 13): el proceso de trabajo (utilityProcess, sin
// red, con tope de memoria), la cola que arranca un segundo después de mostrar la ventana, la pausa
// cuando Windows se suspende y el protocolo con que la ventana pide un original.

// Tope de memoria del proceso de trabajo: el de su motor de JavaScript y, por si algo se escapa
// (pdf.js usa memoria fuera de ese motor), un vigilante que lo corta si pasa de 2 GB.
const HEAP_LIMIT_MB = 1536;
const MEMORY_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

// Antes de que Electron esté listo: el esquema propio, con permiso para pedirlo con fetch desde la
// ventana.
export function registerOriginalScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ORIGINAL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function startMaterials({
  workspace,
  clock,
  slow,
  send,
  net,
}: {
  workspace: Workspace;
  clock: Clock;
  slow?: () => boolean;
  net: NetGate;
  send: (event: MaterialEvent) => void;
}): { service: MaterialsService; begin: () => void; stop: () => Promise<void> } {
  const here = import.meta.dirname;
  const worker = createWorkerClient({
    spawn: () =>
      utilityProcess.fork(join(here, 'materials.js'), [], {
        serviceName: 'Retenia · materiales',
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
  const service = createMaterialsService({
    workspace,
    clock,
    execute: (task, timeoutMs) => worker.request(task, timeoutMs),
    emit: send,
    net,
    ...(slow ? { slow } : {}),
    autoStart: false,
    interrupt: () => worker.interrupt?.('crashed'),
  });
  // Cada suspensión pausa una vez y cada vuelta suelta esa misma pausa: un «resume» sin su
  // «suspend» no suelta la de una restauración en curso.
  let suspended = false;
  powerMonitor.on('suspend', () => {
    if (!suspended) {
      suspended = true;
      void service.pause();
    }
  });
  powerMonitor.on('resume', () => {
    if (suspended) {
      suspended = false;
      service.unpause();
    }
  });
  // La cola arranca un segundo después de mostrar la ventana: el arranque sigue siendo rápido. Si
  // Retenia se cierra antes, esa espera se cancela (la carpeta de datos se cierra al salir).
  let beginTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    service,
    begin: () => {
      beginTimer = setTimeout(() => {
        beginTimer = undefined;
        service.start();
      }, 1000);
    },
    stop: async () => {
      clearTimeout(beginTimer);
      beginTimer = undefined;
      await service.stop();
      worker.stop();
    },
  };
}

// «retenia-original://<material>»: el original, con su tipo y, si se pide, un tramo.
export function handleOriginalProtocol(workspace: Workspace): void {
  // La ventana se abre desde un archivo local (Chromium lo manda como «file://» o «null»); en
  // desarrollo, desde el servidor de Vite.
  const devOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : null;
  const allowedOrigins = ['file://', 'null', ...(devOrigin ? [devOrigin] : [])];
  protocol.handle(ORIGINAL_SCHEME, async (request) => {
    const served = await serveOriginal(
      {
        url: request.url,
        origin: request.headers.get('origin'),
        range: request.headers.get('range'),
      },
      {
        lookup: (materialId) => {
          try {
            const row = workspace.materials.row(materialId);
            return row.originalSha256 && row.originalExt && isOriginalExtension(row.originalExt)
              ? { sha256: row.originalSha256, ext: row.originalExt }
              : null;
          } catch {
            return null;
          }
        },
        dataDir: dirname(workspace.originalsDir),
        allowedOrigins,
      },
    );
    return new Response(served.body, { status: served.status, headers: served.headers });
  });
}
