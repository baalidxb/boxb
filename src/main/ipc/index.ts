import { app, BrowserWindow, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IPC } from '@shared/ipc';
import { ElectronStoreAdapter } from '../storage/electron-store-adapter';
import { dlog } from '../debug-log';
import { createSecondaryWindow } from '../window';
import { getAllWindows } from '../windows';
import { lifecycle } from '../lifecycle';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function registerIpcHandlers(): ElectronStoreAdapter {
  const storage = new ElectronStoreAdapter();

  ipcMain.handle(IPC.app.version, () => app.getVersion());

  // Phase 9.2: full quit triggered from the command bar's quit action.
  // Same effect as the tray "Quit BoxB" item — flag isQuitting so the
  // window close handlers skip their hide-to-tray fallback.
  ipcMain.on(IPC.app.quit, () => {
    dlog('IPC:app-quit');
    lifecycle.isQuitting = true;
    app.quit();
  });

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

  ipcMain.on(IPC.window.openNew, (event, lockedWorkspaceId?: unknown) => {
    const lockedId =
      typeof lockedWorkspaceId === 'string' && lockedWorkspaceId.length > 0
        ? lockedWorkspaceId
        : undefined;
    dlog('IPC:window-open-new', {
      senderId: event.sender.id,
      lockedWorkspaceId: lockedId ?? null
    });
    createSecondaryWindow(lockedId ? { lockedWorkspaceId: lockedId } : undefined);
  });

  // Force-destroys the sender's window without firing the hide-to-tray
  // close handler. Used when a locked window's workspace gets deleted.
  ipcMain.on(IPC.window.forceClose, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    dlog('IPC:window-force-close', {
      senderId: event.sender.id,
      found: !!win
    });
    if (win && !win.isDestroyed()) win.destroy();
  });

  // Broadcasts a globals snapshot from one renderer to every other window.
  // Sender is excluded so it doesn't reapply its own update. Receivers
  // guard against re-broadcast via an isApplyingBroadcast flag.
  ipcMain.on(IPC.window.broadcast, (event, snapshot: unknown) => {
    const senderId = event.sender.id;
    let recipients = 0;
    for (const win of getAllWindows()) {
      if (win.webContents.id === senderId) continue;
      try {
        win.webContents.send(IPC.window.applyBroadcast, snapshot);
        recipients++;
      } catch (e) {
        dlog('IPC:window-broadcast:send-failed', {
          target: win.webContents.id,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    dlog('IPC:window-broadcast', { senderId, recipients });
  });

  return storage;
}
