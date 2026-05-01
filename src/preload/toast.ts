// Preload for the in-app toast window. Exposes a tiny API the embedded
// vanilla-JS toast renderer uses to receive incoming toasts and report
// click/dismiss events back to main.
//
// IMPORTANT: do NOT import from '@shared/ipc' here. Sandboxed Electron
// preloads can't require() relative files at runtime, and Rollup will split
// a shared module into chunks/*.cjs the moment two preload entries import
// the same source — silently breaking both preloads. Hard-code channel name
// strings instead. Keep these in sync with src/shared/ipc.ts.
import { contextBridge, ipcRenderer } from 'electron';

const TOAST_SHOW = 'toast:show';
const TOAST_CLICK = 'toast:click';
const TOAST_DISMISSED = 'toast:dismissed';
const UPDATE_RESTART_NOW = 'update:restart-now';
const UPDATE_DISMISS = 'update:dismiss';

interface ToastPayload {
  id: string;
  title: string;
  body: string;
  iconDataUri?: string;
  serviceId?: string;
  timestamp: number;
  kind?: 'notification' | 'action';
}

contextBridge.exposeInMainWorld('toastApi', {
  onShow: (handler: (payload: ToastPayload) => void): void => {
    ipcRenderer.on(TOAST_SHOW, (_event, payload: ToastPayload) => handler(payload));
  },
  click: (id: string): void => {
    ipcRenderer.send(TOAST_CLICK, { id });
  },
  dismissed: (id: string): void => {
    ipcRenderer.send(TOAST_DISMISSED, { id });
  },
  updateRestart: (id: string): void => {
    ipcRenderer.send(UPDATE_RESTART_NOW, { id });
  },
  updateDismiss: (id: string): void => {
    ipcRenderer.send(UPDATE_DISMISS, { id });
  }
});
