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
    };
  }
}

export {};
