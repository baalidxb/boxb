import { app, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IPC } from '@shared/ipc';
import { ElectronStoreAdapter } from '../storage/electron-store-adapter';
import { dlog } from '../debug-log';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function registerIpcHandlers(): ElectronStoreAdapter {
  const storage = new ElectronStoreAdapter();

  ipcMain.handle(IPC.app.version, () => app.getVersion());

  ipcMain.handle(IPC.storage.get, (_event, key: string) => storage.get(key));
  ipcMain.handle(IPC.storage.set, (_event, key: string, value: unknown) =>
    storage.set(key, value)
  );
  ipcMain.handle(IPC.storage.delete, (_event, key: string) => storage.delete(key));
  ipcMain.handle(IPC.storage.getAll, () => storage.getAll());
  ipcMain.handle(IPC.storage.clear, () => storage.clear());

  ipcMain.handle(
    IPC.service.cleanupPartition,
    async (_event, partition: string): Promise<{ ok: boolean; error?: string }> => {
      dlog('IPC:cleanup-partition:received', { partition });
      try {
        const ses = session.fromPartition(partition);
        await ses.clearStorageData();
        await ses.clearCache();
        dlog('IPC:cleanup-partition:done', { partition });
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dlog('IPC:cleanup-partition:ERROR', { partition, error: msg });
        return { ok: false, error: msg };
      }
    }
  );

  ipcMain.handle(IPC.service.webviewPreloadPath, (): string => {
    const p = join(__dirname, '..', 'preload', 'webview.cjs');
    dlog('IPC:webview-preload-path:returned', { path: p });
    return p;
  });

  return storage;
}
