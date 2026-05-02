/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface WebviewAttributes {
  src?: string;
  partition?: string;
  useragent?: string;
  allowpopups?: string;
  preload?: string;
  httpreferrer?: string;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & WebviewAttributes,
        HTMLElement
      >;
    }
  }
}

declare global {
  interface Window {
    boxb: {
      app: {
        version: () => Promise<string>;
        quit: () => void;
      };
      storage: {
        get<T = unknown>(key: string): Promise<T | undefined>;
        set<T = unknown>(key: string, value: T): Promise<void>;
        delete(key: string): Promise<void>;
        getAll(): Promise<Record<string, unknown>>;
        clear(): Promise<void>;
      };
      service: {
        cleanupPartition: (
          partition: string
        ) => Promise<{ ok: boolean; error?: string }>;
        registerPartition: (partition: string) => void;
        getWebviewPreloadPath: () => Promise<string>;
      };
      notification: {
        onClick: (handler: (payload: { partition: string }) => void) => () => void;
      };
      window: {
        openNew: (lockedWorkspaceId?: string) => void;
        broadcast: (snapshot: unknown) => void;
        onBroadcast: (handler: (snapshot: unknown) => void) => () => void;
        getLockedWorkspaceId: () => string | null;
        forceClose: () => void;
      };
      hibernation: {
        register: (payload: {
          wcId: number;
          partition: string;
          serviceId: string;
          hibernation: 'light' | 'aggressive';
          isActive: boolean;
        }) => void;
        unregister: (payload: { wcId: number }) => void;
        markActive: (payload: { wcId: number; isActive: boolean }) => void;
        onRequestUnmount: (
          handler: (payload: { serviceId: string }) => void
        ) => () => void;
      };
      terminal: {
        create: (
          req?: { cols?: number; rows?: number }
        ) => Promise<
          | { ok: true; ptyId: string; cwd: string; shell: string; title: string }
          | { ok: false; error: string }
        >;
        write: (payload: { ptyId: string; data: string }) => void;
        resize: (payload: { ptyId: string; cols: number; rows: number }) => void;
        kill: (payload: { ptyId: string }) => void;
        onData: (
          handler: (payload: { ptyId: string; data: string }) => void
        ) => () => void;
        onExit: (
          handler: (payload: {
            ptyId: string;
            exitCode: number;
            signal: number | null;
          }) => void
        ) => () => void;
        getPanelState: () => Promise<{ open: boolean; height: number }>;
        setPanelState: (payload: { open: boolean; height: number }) => void;
      };
      managed: {
        export: (payload: {
          name: string;
          services: unknown[];
          workspaces: unknown[];
        }) => Promise<{
          ok: boolean;
          path?: string;
          cancelled?: boolean;
          error?: string;
        }>;
        getState: () => Promise<{
          isManaged: boolean;
          configName: string | null;
          importedAt: number | null;
        }>;
        setState: (payload: {
          isManaged: boolean;
          configName: string | null;
          importedAt: number | null;
        }) => Promise<void>;
        checkLaunchConfig: () => Promise<unknown | null>;
        applyConfig: () => Promise<void>;
        cancelConfig: () => Promise<void>;
        onOpenExportModal: (handler: () => void) => () => void;
      };
      ai: {
        setApiKey: (key: string) => Promise<boolean>;
        clearApiKey: () => Promise<void>;
        hasApiKey: () => Promise<boolean>;
        parseIntent: (req: {
          query: string;
          services: Array<{
            id: string;
            name: string;
            catalogId: string;
            workspaceId: string;
          }>;
          workspaces: Array<{ id: string; name: string }>;
          isManaged: boolean;
        }) => Promise<unknown | null>;
        onOpenSetApiKeyModal: (handler: () => void) => () => void;
      };
    };
  }
}

export {};
