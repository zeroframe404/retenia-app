import { join } from 'node:path';
import { type Clock, demoClock, type Stopwatch } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import {
  createFileHandlers,
  createHandlers,
  handleMessage,
  type Variant,
} from '../../src/main/bridge';
import { createMaterialsService, type MaterialsService } from '../../src/main/materials/service';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import { buildApi, type Invoke } from '../../src/preload/api';
import type { ApiOf, channels } from '../../src/preload/contract';
import type { MaterialEvent } from '../../src/preload/contract/events';
import { fileChannels } from '../../src/preload/contract/materials';
import { tempDataFolder } from './base';
import { copyCastInto } from './elenco';

export interface TestBridge {
  api: ApiOf<typeof channels>;
  // El canal de los archivos («materials.addFiles»), que la ventana no ve: lo usa el puente de
  // archivos con las rutas que saca de cada archivo soltado o elegido.
  files: ApiOf<typeof fileChannels>;
  handlers: ReturnType<typeof createHandlers>;
  fileHandlers: ReturnType<typeof createFileHandlers>;
  workspace: Workspace;
  materials: MaterialsService;
  // Los avisos del principal a la ventana (`material.progress`…).
  subscribe: (listener: (event: MaterialEvent) => void) => () => void;
  dataDir: string;
  file: string;
  // Cada mensaje que salió de la ventana hacia el principal, en orden.
  sent: { channel: string; request: unknown }[];
  // Las carpetas que se pidió abrir con el Explorador de Windows (doble: no abre nada).
  opened: string[];
  close: () => void;
}

// El puente armado como en Retenia: el manejador real del principal con una carpeta de datos
// real (base, copias) y, del otro lado, window.retenia. Lo único que falta es Electron en el
// medio y el Explorador de Windows, que es un doble declarado en docs/plan-de-pruebas.md: anota
// la carpeta en vez de abrirla. El proceso de trabajo de los materiales corre en el mismo proceso
// de la prueba (el mismo código que corre en `materials-worker`).
export function openBridge({
  clock = demoClock(),
  variant = 'prueba',
  openFolder,
  stopwatch,
  withCast = false,
  holdExtraction,
}: {
  // Empieza con el elenco de ejemplo ya sembrado (una copia del que se sembró una vez).
  withCast?: boolean;
  clock?: Clock;
  variant?: Variant;
  openFolder?: (path: string) => Promise<string>;
  // El cronómetro de la sesión de estudio (Fase 10): uno fijo para que los tiempos den siempre igual.
  stopwatch?: Stopwatch;
  // (simulado) Frena la extracción de cada unidad hasta que la promesa se cumpla.
  holdExtraction?: () => Promise<void>;
} = {}): TestBridge {
  const data = tempDataFolder();
  if (withCast) {
    copyCastInto(data.folder);
  }
  const workspace = openWorkspace({ dataDir: data.folder, clock, appVersion: '0.0.0-prueba' });
  const listeners = new Set<(event: MaterialEvent) => void>();
  const materials = createMaterialsService({
    workspace,
    clock,
    execute: async (task: MaterialsTask) => {
      if (holdExtraction && task.kind === 'extract') {
        await holdExtraction();
      }
      return runMaterialsTask(task);
    },
    emit: (event) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    // Con el elenco, los materiales sembrados quedan «Recibido»: las pruebas que lo usan no los leen.
    autoStart: !withCast,
  });
  const opened: string[] = [];
  const handlers = createHandlers({
    clock,
    variant,
    workspace,
    materials,
    version: '0.0.0-prueba',
    ...(stopwatch ? { stopwatch } : {}),
    openFolder:
      openFolder ??
      (async (path) => {
        opened.push(path);
        return '';
      }),
  });
  const fileHandlers = createFileHandlers(materials);
  const sent: TestBridge['sent'] = [];
  const invoke: Invoke = async (channel, request) => {
    sent.push({ channel, request });
    return handleMessage(handlers, channel, request);
  };
  const invokeFiles: Invoke = async (channel, request) => {
    sent.push({ channel, request });
    return handleMessage(fileHandlers, channel, request, fileChannels);
  };
  return {
    api: buildApi(invoke),
    files: buildApi(invokeFiles, fileChannels),
    handlers,
    fileHandlers,
    workspace,
    materials,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dataDir: data.folder,
    file: join(data.folder, 'retenia.db'),
    sent,
    opened,
    close: () => {
      materials.abandon();
      workspace.close();
      data.remove();
    },
  };
}
