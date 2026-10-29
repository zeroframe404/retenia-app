import { contextBridge, ipcRenderer } from 'electron';
import { buildApi } from './api';
import { demoChannels } from './contract/demo';
import { labChannels } from './contract/lab';

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
