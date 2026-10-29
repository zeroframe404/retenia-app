import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import type { ThemeChoice } from '../core/theme';
import type { ZoomDirection } from '../core/zoom';
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
import { createAppearanceStore } from './appearance';

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
  onAppearanceChange,
  zoom,
  onFlushed,
}: {
  clock: Clock;
  variant: Variant;
  workspace: Workspace;
  version: string;
  openFolder: (path: string) => Promise<string>;
  // Para que el principal cambie el marco de la ventana cuando se elige otra apariencia.
  onAppearanceChange?: (choice: ThemeChoice) => void;
  // Cambia el zoom de la ventana y devuelve el factor que quedó (sin ventana, 1).
  zoom?: (direction: ZoomDirection) => number;
  // La pantalla avisa que ya guardó lo pendiente: el cierre de la ventana espera este aviso.
  onFlushed?: () => void;
}): Handlers {
  const backups = async () => (await workspace.backups()).map(toBackup);
  const appearance = createAppearanceStore(workspace.dataDir);
  return {
    ping: async () => ({ message: 'pong', variant, today: studyDayOf(clock.now()) }),
    'app.info': async () => ({ version, variant, dataDir: workspace.dataDir }),
    'appearance.get': async () => ({ choice: appearance.get() }),
    'appearance.set': async ({ choice }) => {
      appearance.set(choice);
      onAppearanceChange?.(choice);
      return { choice };
    },
    'cards.create': async (request) => workspace.cards.create(request),
    'cards.list': async () => ({ cards: workspace.cards.list() }),
    'cards.review': async (request) => workspace.cards.review(request),
    'cards.edit': async (request) => workspace.cards.edit(request),
    'cards.history': async (request) => workspace.cards.history(request),
    'cards.delete': async (request) => workspace.cards.remove(request),
    'subjects.list': async () => workspace.subjects.list(),
    'subjects.create': async (request) => workspace.subjects.create(request),
    'subjects.activate': async (request) => workspace.subjects.activate(request),
    'subjects.createExample': async () => workspace.subjects.createExample(),
    'topics.list': async (request) => workspace.topics.list(request),
    'topics.create': async (request) => workspace.topics.create(request),
    'topics.rename': async (request) => workspace.topics.rename(request),
    'topics.archive': async (request) => workspace.topics.archive(request),
    'topics.unarchive': async (request) => workspace.topics.unarchive(request),
    'topics.delete': async (request) => workspace.topics.remove(request),
    'notes.list': async (request) => workspace.notes.list(request),
    'notes.create': async (request) => workspace.notes.create(request),
    'notes.get': async (request) => workspace.notes.get(request),
    'notes.save': async (request) => workspace.notes.save(request),
    'notes.move': async (request) => workspace.notes.move(request),
    'notes.archive': async (request) => workspace.notes.archive(request),
    'notes.unarchive': async (request) => workspace.notes.unarchive(request),
    'notes.delete': async (request) => workspace.notes.remove(request),
    'notes.titles': async (request) => workspace.notes.titles(request),
    'notes.mentions': async (request) => workspace.notes.mentions(request),
    'images.save': async (request) => workspace.images.save(request),
    'images.read': async (request) => workspace.images.read(request),
    'inbox.list': async () => workspace.inbox.list(),
    'inbox.capture': async (request) => workspace.inbox.capture(request),
    'inbox.move': async (request) => workspace.inbox.move(request),
    'inbox.delete': async (request) => workspace.inbox.remove(request),
    'trash.list': async () => ({ items: workspace.trash.list() }),
    'trash.listOrganization': async () => workspace.trash.listOrganization(),
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
    'window.zoom': async ({ direction }) => ({ factor: zoom ? zoom(direction) : 1 }),
    'window.flushed': async () => {
      onFlushed?.();
      return {};
    },
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
