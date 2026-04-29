import { app, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { ElectronStoreAdapter } from '../storage/electron-store-adapter';

export function registerIpcHandlers(): void {
  const storage = new ElectronStoreAdapter();

  ipcMain.handle(IPC.app.version, () => app.getVersion());

  ipcMain.handle(IPC.storage.get, (_event, key: string) => storage.get(key));
  ipcMain.handle(IPC.storage.set, (_event, key: string, value: unknown) =>
    storage.set(key, value)
  );
  ipcMain.handle(IPC.storage.delete, (_event, key: string) => storage.delete(key));
  ipcMain.handle(IPC.storage.getAll, () => storage.getAll());
  ipcMain.handle(IPC.storage.clear, () => storage.clear());
}
