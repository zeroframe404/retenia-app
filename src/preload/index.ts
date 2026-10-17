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
