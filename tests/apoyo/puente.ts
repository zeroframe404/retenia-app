import { join } from 'node:path';
import type { AiProvider } from '../../src/ai/provider';
import { type Clock, demoClock, fixedClock, type Stopwatch } from '../../src/core/clock';
import { newId } from '../../src/data/ids';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import type { SecretBox } from '../../src/main/ai/key-store';
import { type AiService, createAiService } from '../../src/main/ai/service';
import {
  createFileHandlers,
  createHandlers,
  handleMessage,
  type Variant,
} from '../../src/main/bridge';
import type { Dialogs } from '../../src/main/imports/dialogs';
import { createTransfersService } from '../../src/main/imports/service';
import { createMaterialsService, type MaterialsService } from '../../src/main/materials/service';
import { createNetGate, type NetGate } from '../../src/main/net-gate';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import { runTransferTask } from '../../src/main/workers/transfers-tasks';
import { buildApi, type Invoke } from '../../src/preload/api';
import type { ApiOf, channels } from '../../src/preload/contract';
import type { AiEvent, ReteniaEvent } from '../../src/preload/contract/events';
import { fileChannels } from '../../src/preload/contract/materials';
import { tempDataFolder } from './base';
import { type CastKind, copyCastInto } from './elenco';

export interface TestBridge {
  api: ApiOf<typeof channels>;
  // El canal de los archivos («materials.addFiles»), que la ventana no ve: lo usa el puente de
  // archivos con las rutas que saca de cada archivo soltado o elegido.
  files: ApiOf<typeof fileChannels>;
  handlers: ReturnType<typeof createHandlers>;
  fileHandlers: ReturnType<typeof createFileHandlers>;
  workspace: Workspace;
  materials: MaterialsService;
  // Los avisos del principal a la ventana (`material.progress`, `ai.result`…).
  subscribe: (listener: (event: ReteniaEvent) => void) => () => void;
  // La IA (Fase 19): su servicio (para mandar la cola en la prueba), los avisos que dio y otra
  // instancia sobre la misma carpeta, como al cerrar y abrir Retenia (`days`: con el reloj corrido).
  ai: AiService;
  aiEvents: AiEvent[];
  reopenAi: (options?: { days?: number }) => AiService;
  dataDir: string;
  file: string;
  // Cada mensaje que salió de la ventana hacia el principal, en orden.
  sent: { channel: string; request: unknown }[];
  // Las carpetas que se pidió abrir con el Explorador de Windows (doble: no abre nada).
  opened: string[];
  // Los diálogos de Windows para elegir y guardar archivos (Fase 15, doble declarado): anotan cada
  // pedido y devuelven la ruta que puso la prueba con `answerDialogs` (nula = cancelar).
  dialogRequests: { kind: 'file' | 'folder' | 'save'; title: string; defaultName?: string }[];
  answerDialogs: (answers: {
    file?: string | null;
    folder?: string | null;
    save?: string | null;
  }) => void;
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
  net,
  ai: aiOptions,
}: {
  // La puerta hacia internet (Fase 14): la de las pruebas de páginas web.
  net?: NetGate;
  // Empieza con el elenco de ejemplo ya sembrado (una copia del que se sembró una vez); con
  // `'tarjetas'`, el de las tarjetas sin materiales.
  withCast?: boolean | Extract<CastKind, 'tarjetas'>;
  clock?: Clock;
  variant?: Variant;
  openFolder?: (path: string) => Promise<string>;
  // El cronómetro de la sesión de estudio (Fase 10): uno fijo para que los tiempos den siempre igual.
  stopwatch?: Stopwatch;
  // (simulado) Frena la extracción de cada unidad hasta que la promesa se cumpla.
  holdExtraction?: () => Promise<void>;
  // La IA (Fase 19), con sus dobles declarados: el almacén seguro de prueba y la IA simulada (como IA
  // remota con tu clave, `remote`, o la de la demostración, `simulated`). Sin esto, una IA apagada:
  // sin almacén seguro y con la puerta cerrada.
  ai?: {
    box?: SecretBox;
    remote?: (apiKey: string) => AiProvider;
    simulated?: () => AiProvider | null;
  };
} = {}): TestBridge {
  const data = tempDataFolder();
  if (withCast !== false) {
    copyCastInto(data.folder, withCast === true ? 'completo' : withCast);
  }
  const workspace = openWorkspace({ dataDir: data.folder, clock, appVersion: '0.0.0-prueba' });
  const listeners = new Set<(event: ReteniaEvent) => void>();
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
    autoStart: withCast !== true,
    ...(net ? { net } : {}),
  });
  const opened: string[] = [];
  const dialogRequests: TestBridge['dialogRequests'] = [];
  const answers: { file: string | null; folder: string | null; save: string | null } = {
    file: null,
    folder: null,
    save: null,
  };
  const dialogs: Dialogs = {
    chooseFile: async ({ title }) => {
      dialogRequests.push({ kind: 'file', title });
      return answers.file;
    },
    chooseFolder: async ({ title }) => {
      dialogRequests.push({ kind: 'folder', title });
      return answers.folder;
    },
    chooseSave: async ({ title, defaultName }) => {
      dialogRequests.push({ kind: 'save', title, defaultName });
      return answers.save;
    },
  };
  const aiEvents: AiEvent[] = [];
  const closedNet = createNetGate({ offline: true });
  const noBox: SecretBox = {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('(simulado) sin almacén seguro');
    },
    decryptString: () => {
      throw new Error('(simulado) sin almacén seguro');
    },
  };
  const buildAi = (aiClock: Clock) =>
    createAiService({
      store: () => workspace.ai,
      clock: aiClock,
      dataDir: data.folder,
      box: aiOptions?.box ?? noBox,
      net: aiOptions ? (net ?? createNetGate()) : closedNet,
      newId,
      fragmentOf: (input) => materials.fragment(input),
      remote:
        aiOptions?.remote ??
        (() => {
          throw new Error('(simulado) este puente no tiene IA remota');
        }),
      ...(aiOptions?.simulated ? { simulated: aiOptions.simulated } : {}),
      emit: (event) => {
        aiEvents.push(event);
        for (const listener of listeners) {
          listener(event);
        }
      },
      // Sin relojes de verdad: la prueba manda la cola cuando quiere (`ai.drain()`).
      timers: { every: () => () => undefined },
    });
  const ai = buildAi(clock);
  const handlers = createHandlers({
    ai,
    transfers: createTransfersService({
      workspace,
      clock,
      execute: (task) => runTransferTask(task),
    }),
    dialogs,
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
    ai,
    aiEvents,
    reopenAi: ({ days = 0 } = {}) =>
      buildAi(fixedClock(new Date(clock.now().getTime() + days * 86_400_000))),
    dataDir: data.folder,
    file: join(data.folder, 'retenia.db'),
    sent,
    opened,
    dialogRequests,
    answerDialogs: (next) => {
      Object.assign(answers, next);
    },
    close: () => {
      materials.abandon();
      workspace.close();
      data.remove();
    },
  };
}
