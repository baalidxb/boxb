import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC } from '@shared/ipc';

const LOCKED_WORKSPACE_FLAG = '--locked-workspace-id=';
const SECONDARY_WINDOW_FLAG = '--secondary-window';

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
// Phase 9.5: main tags secondary windows with --secondary-window. The
// renderer uses this to suppress the first-launch onboarding tour in any
// window other than the primary one.
const isSecondaryWindow = process.argv.includes(SECONDARY_WINDOW_FLAG);

const api = {
  app: {
    version: (): Promise<string> => ipcRenderer.invoke(IPC.app.version),
    quit: (): void => {
      ipcRenderer.send(IPC.app.quit);
    }
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
    isPrimaryWindow: (): boolean => !isSecondaryWindow,
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
  },
  terminal: {
    create: (
      req: { cols?: number; rows?: number } = {}
    ): Promise<
      | { ok: true; ptyId: string; cwd: string; shell: string; title: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke(IPC.terminal.create, req),
    write: (payload: { ptyId: string; data: string }): void => {
      ipcRenderer.send(IPC.terminal.write, payload);
    },
    resize: (payload: { ptyId: string; cols: number; rows: number }): void => {
      ipcRenderer.send(IPC.terminal.resize, payload);
    },
    kill: (payload: { ptyId: string }): void => {
      ipcRenderer.send(IPC.terminal.kill, payload);
    },
    onData: (
      handler: (payload: { ptyId: string; data: string }) => void
    ): (() => void) => {
      const wrapped = (
        _e: IpcRendererEvent,
        payload: { ptyId: string; data: string }
      ): void => handler(payload);
      ipcRenderer.on(IPC.terminal.data, wrapped);
      return () => ipcRenderer.removeListener(IPC.terminal.data, wrapped);
    },
    onExit: (
      handler: (payload: {
        ptyId: string;
        exitCode: number;
        signal: number | null;
      }) => void
    ): (() => void) => {
      const wrapped = (
        _e: IpcRendererEvent,
        payload: { ptyId: string; exitCode: number; signal: number | null }
      ): void => handler(payload);
      ipcRenderer.on(IPC.terminal.exit, wrapped);
      return () => ipcRenderer.removeListener(IPC.terminal.exit, wrapped);
    },
    getPanelState: (): Promise<{ open: boolean; height: number }> =>
      ipcRenderer.invoke(IPC.terminal.getPanelState),
    setPanelState: (payload: { open: boolean; height: number }): void => {
      ipcRenderer.send(IPC.terminal.setPanelState, payload);
    }
  },
  managed: {
    export: (payload: {
      name: string;
      services: unknown[];
      workspaces: unknown[];
    }): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.managed.export, payload),
    getState: (): Promise<{
      isManaged: boolean;
      configName: string | null;
      importedAt: number | null;
    }> => ipcRenderer.invoke(IPC.managed.getState),
    setState: (payload: {
      isManaged: boolean;
      configName: string | null;
      importedAt: number | null;
    }): Promise<void> => ipcRenderer.invoke(IPC.managed.setState, payload),
    checkLaunchConfig: (): Promise<unknown | null> =>
      ipcRenderer.invoke(IPC.managed.checkLaunchConfig),
    applyConfig: (): Promise<void> => ipcRenderer.invoke(IPC.managed.applyConfig),
    cancelConfig: (): Promise<void> => ipcRenderer.invoke(IPC.managed.cancelConfig),
    onOpenExportModal: (handler: () => void): (() => void) => {
      const wrapped = (): void => handler();
      ipcRenderer.on(IPC.managed.openExportModal, wrapped);
      return () => ipcRenderer.removeListener(IPC.managed.openExportModal, wrapped);
    }
  },
  ai: {
    setApiKey: (key: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.ai.setApiKey, key),
    clearApiKey: (): Promise<void> => ipcRenderer.invoke(IPC.ai.clearApiKey),
    hasApiKey: (): Promise<boolean> => ipcRenderer.invoke(IPC.ai.hasApiKey),
    parseIntent: (req: {
      query: string;
      services: Array<{ id: string; name: string; catalogId: string; workspaceId: string }>;
      workspaces: Array<{ id: string; name: string }>;
      isManaged: boolean;
    }): Promise<unknown | null> => ipcRenderer.invoke(IPC.ai.parseIntent, req),
    onOpenSetApiKeyModal: (handler: () => void): (() => void) => {
      const wrapped = (): void => handler();
      ipcRenderer.on(IPC.ai.openSetApiKeyModal, wrapped);
      return () => ipcRenderer.removeListener(IPC.ai.openSetApiKeyModal, wrapped);
    }
  },
  onboarding: {
    getState: (): Promise<{
      hasCompletedTutorial: boolean;
      lastCompletedAt: number | null;
    }> => ipcRenderer.invoke(IPC.onboarding.getState),
    markComplete: (): Promise<{
      hasCompletedTutorial: boolean;
      lastCompletedAt: number | null;
    }> => ipcRenderer.invoke(IPC.onboarding.markComplete),
    reset: (): Promise<{
      hasCompletedTutorial: boolean;
      lastCompletedAt: number | null;
    }> => ipcRenderer.invoke(IPC.onboarding.reset)
  },
  reminders: {
    list: (): Promise<{ reminders: unknown[]; todos: unknown[] }> =>
      ipcRenderer.invoke(IPC.reminders.list),
    create: (payload: {
      text: string;
      dueAt: number;
      serviceId: string | null;
      silent?: boolean;
    }): Promise<{ ok: boolean; reminder?: unknown; error?: string }> =>
      ipcRenderer.invoke(IPC.reminders.create, payload),
    complete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.reminders.complete, id),
    snooze: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.reminders.snooze, id),
    remove: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.reminders.remove, id),
    addTodo: (text: string): Promise<{ ok: boolean; todo?: unknown }> =>
      ipcRenderer.invoke(IPC.reminders.addTodo, text),
    toggleTodo: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.reminders.toggleTodo, id),
    removeTodo: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.reminders.removeTodo, id),
    clearDoneTodos: (): Promise<number> =>
      ipcRenderer.invoke(IPC.reminders.clearDoneTodos),
    onChanged: (handler: () => void): (() => void) => {
      const wrapped = (): void => handler();
      ipcRenderer.on(IPC.reminders.changed, wrapped);
      return () => ipcRenderer.removeListener(IPC.reminders.changed, wrapped);
    },
    onFocusService: (
      handler: (payload: { serviceId: string }) => void
    ): (() => void) => {
      const wrapped = (
        _e: IpcRendererEvent,
        payload: { serviceId: string }
      ): void => handler(payload);
      ipcRenderer.on(IPC.reminders.focusService, wrapped);
      return () => ipcRenderer.removeListener(IPC.reminders.focusService, wrapped);
    },
    onOpenPanel: (handler: () => void): (() => void) => {
      const wrapped = (): void => handler();
      ipcRenderer.on(IPC.reminders.openPanel, wrapped);
      return () => ipcRenderer.removeListener(IPC.reminders.openPanel, wrapped);
    }
  },
  calendar: {
    listSources: (): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.calendar.listSources),
    addSource: (payload: {
      name: string;
      url: string;
    }): Promise<{ ok: boolean; source?: unknown; error?: string }> =>
      ipcRenderer.invoke(IPC.calendar.addSource, payload),
    removeSource: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.calendar.removeSource, id),
    getEvents: (payload: {
      force?: boolean;
    }): Promise<{ events: unknown[]; statuses: unknown[] }> =>
      ipcRenderer.invoke(IPC.calendar.getEvents, payload),
    onChanged: (handler: () => void): (() => void) => {
      const wrapped = (): void => handler();
      ipcRenderer.on(IPC.calendar.changed, wrapped);
      return () => ipcRenderer.removeListener(IPC.calendar.changed, wrapped);
    },
    generateBrief: (
      event: unknown
    ): Promise<{ ok: boolean; text?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.calendar.generateBrief, event),
    onOpenBrief: (handler: (event: unknown) => void): (() => void) => {
      const wrapped = (_e: IpcRendererEvent, event: unknown): void => handler(event);
      ipcRenderer.on(IPC.calendar.openBrief, wrapped);
      return () => ipcRenderer.removeListener(IPC.calendar.openBrief, wrapped);
    }
  },
  scanner: {
    listRepos: (): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.scanner.listRepos),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.scanner.pickFolder),
    addRepo: (
      path: string
    ): Promise<{
      ok: boolean;
      repo?: unknown;
      error?: string;
      needsConfirm?: boolean;
    }> => ipcRenderer.invoke(IPC.scanner.addRepo, path),
    confirmAddRepo: (
      path: string
    ): Promise<{ ok: boolean; repo?: unknown; error?: string }> =>
      ipcRenderer.invoke(IPC.scanner.confirmAddRepo, path),
    removeRepo: (
      id: string
    ): Promise<{ removed: boolean; restored: boolean; foreign: boolean }> =>
      ipcRenderer.invoke(IPC.scanner.removeRepo, id),
    scanRepo: (id: string): Promise<unknown | null> =>
      ipcRenderer.invoke(IPC.scanner.scanRepo, id)
  }
} as const;

contextBridge.exposeInMainWorld('boxb', api);

export type BoxbApi = typeof api;
