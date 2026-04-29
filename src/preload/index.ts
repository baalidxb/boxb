import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
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
  },
  service: {
    cleanupPartition: (
      partition: string
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.service.cleanupPartition, partition),
    registerPartition: (partition: string): void => {
      ipcRenderer.send(IPC.service.registerPartition, partition);
    },
    getWebviewPreloadPath: (): Promise<string> =>
      ipcRenderer.invoke(IPC.service.webviewPreloadPath)
  },
  notification: {
    onClick: (handler: (payload: { partition: string }) => void): (() => void) => {
      const wrapped = (_e: IpcRendererEvent, payload: { partition: string }): void =>
        handler(payload);
      ipcRenderer.on(IPC.service.notificationClick, wrapped);
      return () => ipcRenderer.removeListener(IPC.service.notificationClick, wrapped);
    }
  }
} as const;

contextBridge.exposeInMainWorld('boxb', api);

export type BoxbApi = typeof api;
