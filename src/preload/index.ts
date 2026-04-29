import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';

const api = {
  app: {
    version: (): Promise<string> => ipcRenderer.invoke(IPC.app.version)
  },
  storage: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke(IPC.storage.get, key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke(IPC.storage.set, key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke(IPC.storage.delete, key),
    getAll: (): Promise<Record<string, unknown>> => ipcRenderer.invoke(IPC.storage.getAll),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.storage.clear)
  }
} as const;

contextBridge.exposeInMainWorld('boxb', api);

export type BoxbApi = typeof api;
