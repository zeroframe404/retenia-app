import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { buildApi } from './api';
import { demoChannels } from './contract/demo';
import { EVENTS_CHANNEL, type MaterialEvent, materialEventSchema } from './contract/events';
import { labChannels } from './contract/lab';
import { fileChannels } from './contract/materials';
import { pathsOfFiles } from './files';

const invoke = (channel: string, request: unknown) => ipcRenderer.invoke(channel, request);

// Los canales de demostración y del Laboratorio solo existen en la variante de prueba: en la
// real, esta rama se descarta al compilar.
const api =
  __VARIANTE__ === 'prueba'
    ? {
        ...buildApi(invoke),
        ...buildApi(invoke, demoChannels()),
        ...buildApi(invoke, labChannels()),
      }
    : buildApi(invoke);

contextBridge.exposeInMainWorld('retenia', api);

// Antes de cerrar la ventana, el principal avisa y espera: cada pantalla que tenga algo a medio
// guardar se registra con `alCerrar`, y cuando todas terminaron se contesta por `window.flushed`
// (validado como cualquier otro canal). El aviso no lleva datos.
type CloseHandler = () => Promise<void> | void;
const closeHandlers = new Set<CloseHandler>();

ipcRenderer.on('retenia:cierre', () => {
  const pending = [...closeHandlers].map(async (handler) => handler());
  void Promise.allSettled(pending).finally(() => {
    void api['window.flushed']({}).catch((error: unknown) => {
      console.error('La ventana no pudo avisar que terminó de guardar', error);
    });
  });
});

contextBridge.exposeInMainWorld('reteniaCierre', {
  alCerrar(handler: CloseHandler): () => void {
    closeHandlers.add(handler);
    return () => {
      closeHandlers.delete(handler);
    };
  },
});

// El puente de archivos (Fase 13): los archivos que se sueltan o se eligen en Materiales llegan como
// objetos File; acá se saca la ruta de cada uno (solo los que vienen del disco la tienen) y se
// manda al principal por su canal propio, validado como cualquier otro. La ventana nunca maneja
// rutas.
const files = buildApi(invoke, fileChannels);
contextBridge.exposeInMainWorld('reteniaArchivos', {
  agregar(list: unknown, options: { subjectId: string; title?: string }) {
    const paths = pathsOfFiles(list, (file) => webUtils.getPathForFile(file));
    if (!paths) {
      return Promise.reject(new Error('Solo se pueden agregar archivos del disco'));
    }
    // El resto lo valida el contrato del canal, como cualquier otro pedido.
    return files['materials.addFiles']({
      paths,
      subjectId: options?.subjectId,
      title: options?.title,
    });
  },
});

// Los avisos del principal: cada uno se valida; lo que no valida se descarta.
type EventListener = (event: MaterialEvent) => void;
const eventListeners = new Set<EventListener>();
ipcRenderer.on(EVENTS_CHANNEL, (_event, raw: unknown) => {
  const parsed = materialEventSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('La ventana descartó un aviso que no cumple el contrato');
    return;
  }
  for (const listener of eventListeners) {
    listener(parsed.data);
  }
});
contextBridge.exposeInMainWorld('reteniaAvisos', {
  alRecibir(listener: EventListener): () => void {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },
});
