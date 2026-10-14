import { join } from 'node:path';
import { type Clock, demoClock } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createHandlers, handleMessage, type Variant } from '../../src/main/bridge';
import { buildApi, type Invoke } from '../../src/preload/api';
import type { ApiOf, channels } from '../../src/preload/contract';
import { tempDataFolder } from './base';

export interface TestBridge {
  api: ApiOf<typeof channels>;
  handlers: ReturnType<typeof createHandlers>;
  workspace: Workspace;
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
// la carpeta en vez de abrirla.
export function openBridge({
  clock = demoClock(),
  variant = 'prueba',
  openFolder,
}: {
  clock?: Clock;
  variant?: Variant;
  openFolder?: (path: string) => Promise<string>;
} = {}): TestBridge {
  const data = tempDataFolder();
  const workspace = openWorkspace({ dataDir: data.folder, clock, appVersion: '0.0.0-prueba' });
  const opened: string[] = [];
  const handlers = createHandlers({
    clock,
    variant,
    workspace,
    version: '0.0.0-prueba',
    openFolder:
      openFolder ??
      (async (path) => {
        opened.push(path);
        return '';
      }),
  });
  const sent: TestBridge['sent'] = [];
  const invoke: Invoke = async (channel, request) => {
    sent.push({ channel, request });
    return handleMessage(handlers, channel, request);
  };
  return {
    api: buildApi(invoke),
    handlers,
    workspace,
    dataDir: data.folder,
    file: join(data.folder, 'retenia.db'),
    sent,
    opened,
    close: () => {
      workspace.close();
      data.remove();
    },
  };
}
