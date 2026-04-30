import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC } from '@shared/ipc';

const LOCKED_WORKSPACE_FLAG = '--locked-workspace-id=';

function readLockedWorkspaceId(): string | null {
  // additionalArguments from BrowserWindow.webPreferences land in process.argv
  // of this preload's renderer process. We pass --locked-workspace-id=<uuid>
  // when the main process spawns a window in locked mode.
  for (const arg of process.argv) {
    if (typeof arg === 'string' && arg.startsWith(LOCKED_WORKSPACE_FLAG)) {
      return arg.slice(LOCKED_WORKSPACE_FLAG.length) || null;
    }
  }
  return null;
}

const lockedWorkspaceId = readLockedWorkspaceId();

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
  },
  window: {
    openNew: (lockedWorkspaceIdArg?: string): void => {
      ipcRenderer.send(IPC.window.openNew, lockedWorkspaceIdArg);
    },
    broadcast: (snapshot: unknown): void => {
      ipcRenderer.send(IPC.window.broadcast, snapshot);
    },
    onBroadcast: (handler: (snapshot: unknown) => void): (() => void) => {
      const wrapped = (_e: IpcRendererEvent, snapshot: unknown): void =>
        handler(snapshot);
      ipcRenderer.on(IPC.window.applyBroadcast, wrapped);
      return () => ipcRenderer.removeListener(IPC.window.applyBroadcast, wrapped);
    },
    getLockedWorkspaceId: (): string | null => lockedWorkspaceId,
    forceClose: (): void => {
      ipcRenderer.send(IPC.window.forceClose);
    }
  },
  hibernation: {
    register: (payload: {
      wcId: number;
      partition: string;
      serviceId: string;
      hibernation: 'light' | 'aggressive';
      isActive: boolean;
    }): void => {
      ipcRenderer.send(IPC.hibernation.register, payload);
    },
    unregister: (payload: { wcId: number }): void => {
      ipcRenderer.send(IPC.hibernation.unregister, payload);
    },
    markActive: (payload: { wcId: number; isActive: boolean }): void => {
      ipcRenderer.send(IPC.hibernation.markActive, payload);
    },
    onRequestUnmount: (
      handler: (payload: { serviceId: string }) => void
    ): (() => void) => {
      const wrapped = (
        _e: IpcRendererEvent,
        payload: { serviceId: string }
      ): void => handler(payload);
      ipcRenderer.on(IPC.hibernation.requestUnmount, wrapped);
      return () =>
        ipcRenderer.removeListener(IPC.hibernation.requestUnmount, wrapped);
    }
  }
} as const;

contextBridge.exposeInMainWorld('boxb', api);

export type BoxbApi = typeof api;
