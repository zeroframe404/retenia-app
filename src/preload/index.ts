import { contextBridge, ipcRenderer } from 'electron';
import { buildApi } from './api';

contextBridge.exposeInMainWorld(
  'retenia',
  buildApi((channel, request) => ipcRenderer.invoke(channel, request)),
);
