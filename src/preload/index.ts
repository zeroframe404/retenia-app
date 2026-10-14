import { contextBridge, ipcRenderer } from 'electron';
import { buildApi } from './api';
import { demoChannels } from './contract/demo';

const invoke = (channel: string, request: unknown) => ipcRenderer.invoke(channel, request);

// Los canales de demostración solo existen en la variante de prueba: en la real, esta rama
// se descarta al compilar.
const api =
  __VARIANTE__ === 'prueba'
    ? { ...buildApi(invoke), ...buildApi(invoke, demoChannels()) }
    : buildApi(invoke);

contextBridge.exposeInMainWorld('retenia', api);
