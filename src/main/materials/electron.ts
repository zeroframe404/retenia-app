import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, powerMonitor, protocol, utilityProcess } from 'electron';
import type { Clock } from '../../core/clock';
import type { Workspace } from '../../data/workspace';
import type { MaterialEvent } from '../../preload/contract/events';
import { createWorkerClient, type WorkerProcess } from '../supervisor';
import { ORIGINAL_SCHEME, parseRange, resolveOriginal } from './original-protocol';
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
}: {
  workspace: Workspace;
  clock: Clock;
  slow?: () => boolean;
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
    ...(slow ? { slow } : {}),
    autoStart: false,
    interrupt: () => worker.interrupt?.('crashed'),
  });
  powerMonitor.on('suspend', () => {
    void service.pause();
  });
  powerMonitor.on('resume', () => service.unpause());
  return {
    service,
    // La cola arranca un segundo después de mostrar la ventana: el arranque sigue siendo rápido.
    begin: () => {
      setTimeout(() => service.start(), 1000);
    },
    stop: async () => {
      await service.stop();
      worker.stop();
    },
  };
}

// «retenia-original://<material>»: el original, con su tipo y, si se pide, un tramo.
export function handleOriginalProtocol(workspace: Workspace): void {
  protocol.handle(ORIGINAL_SCHEME, async (request) => {
    const resolved = resolveOriginal(
      request.url,
      (materialId) => {
        try {
          const row = workspace.materials.row(materialId);
          return row.originalSha256 && row.originalExt && isOriginalExtension(row.originalExt)
            ? { sha256: row.originalSha256, ext: row.originalExt }
            : null;
        } catch {
          return null;
        }
      },
      dirname(workspace.originalsDir),
    );
    if (!resolved) {
      return new Response(null, { status: 404 });
    }
    const headers = {
      'content-type': resolved.mime,
      'access-control-allow-origin': '*',
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    };
    const { size } = await stat(resolved.file);
    const range = parseRange(request.headers.get('range'), size);
    if (range === 'invalid') {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${size}` },
      });
    }
    const data = await readFile(resolved.file);
    if (range === null) {
      return new Response(data, { status: 200, headers });
    }
    return new Response(data.subarray(range.start, range.end + 1), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}` },
    });
  });
}
