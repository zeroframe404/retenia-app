import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import type { BackupView } from '../data/backups';
import type { Workspace } from '../data/workspace';
import {
  type ChannelName,
  channels,
  type HandlerRequest,
  type HandlerResponse,
  type Registry,
} from '../preload/contract';
import type { Backup } from '../preload/contract/backups';

export type Variant = 'prueba' | 'real';

export type Handlers = {
  [K in ChannelName]: (request: HandlerRequest<K>) => Promise<HandlerResponse<K>>;
};

// Una copia tal como la ve la ventana: sin rutas ni nombres de archivo.
function toBackup(view: BackupView): Backup {
  return view.readable
    ? {
        readable: true,
        id: view.id,
        kind: view.kind,
        day: view.day,
        time: view.time,
        sizeBytes: view.sizeBytes,
      }
    : { readable: false, sizeBytes: view.sizeBytes };
}

// Los manejadores de cada canal. Piden a la carpeta de trabajo el almacén vigente en cada
// pedido: después de restaurar una copia, la base es otra. `openFolder` abre una carpeta con el
// Explorador de Windows (shell.openPath: devuelve un texto vacío si pudo).
export function createHandlers({
  clock,
  variant,
  workspace,
  version,
  openFolder,
}: {
  clock: Clock;
  variant: Variant;
  workspace: Workspace;
  version: string;
  openFolder: (path: string) => Promise<string>;
}): Handlers {
  const backups = async () => (await workspace.backups()).map(toBackup);
  return {
    ping: async () => ({ message: 'pong', variant, today: studyDayOf(clock.now()) }),
    'app.info': async () => ({ version, variant, dataDir: workspace.dataDir }),
    'cards.create': async (request) => workspace.cards.create(request),
    'cards.list': async () => ({ cards: workspace.cards.list() }),
    'cards.review': async (request) => workspace.cards.review(request),
    'cards.edit': async (request) => workspace.cards.edit(request),
    'cards.history': async (request) => workspace.cards.history(request),
    'cards.delete': async (request) => workspace.cards.remove(request),
    'trash.list': async () => ({ items: workspace.trash.list() }),
    'trash.restore': async (request) => workspace.trash.restore(request),
    'trash.empty': async () => workspace.trash.empty(),
    'activity.recent': async () => ({ items: workspace.activity.recent() }),
    'activity.undo': async (request) => workspace.activity.undo(request),
    'backups.list': async () => ({ backups: await backups() }),
    'backups.createNow': async () => {
      const created = await workspace.createBackup('manual');
      return { created: toBackup(created), backups: await backups() };
    },
    'backups.restore': async ({ backupId }) => {
      const { restored } = await workspace.restoreBackup(backupId);
      return { restoredFrom: { day: restored.day, time: restored.time }, backups: await backups() };
    },
    'backups.verifyData': async () => ({ differences: workspace.verifyData() }),
    'backups.repairData': async () => ({ differences: workspace.repairData() }),
    'backups.openFolder': async () => {
      const problem = await openFolder(workspace.copiesFolder());
      if (problem !== '') {
        throw new Error('No pude abrir la carpeta de copias');
      }
      return {};
    },
  };
}

type AnyHandlers = Readonly<Record<string, (request: never) => Promise<unknown>>>;

// Lo que corre del lado del principal al recibir un mensaje del puente: valida la petición
// antes de tocar nada y la respuesta antes de devolverla. Nunca registra el contenido.
// El registro de canales es el del contrato; la variante de prueba le suma los suyos.
export async function handleMessage(
  handlers: AnyHandlers,
  channel: string,
  rawRequest: unknown,
  registry: Registry = channels,
): Promise<unknown> {
  const schema = Object.hasOwn(registry, channel) ? registry[channel] : undefined;
  const handler = Object.hasOwn(handlers, channel) ? handlers[channel] : undefined;
  if (!schema || !handler) {
    throw new Error('Canal desconocido');
  }
  const request = schema.request.safeParse(rawRequest);
  if (!request.success) {
    throw new Error(`Petición rechazada en el canal «${channel}»`);
  }
  const response = schema.response.safeParse(await handler(request.data as never));
  if (!response.success) {
    throw new Error(`Respuesta rechazada en el canal «${channel}»`);
  }
  return response.data;
}
