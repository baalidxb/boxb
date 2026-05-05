import { app, BrowserWindow, ipcMain, session } from 'electron';
import type { Session, WebContents } from 'electron';
import { ElectronStoreAdapter } from './storage/electron-store-adapter';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';
import { showToast } from './in-app-toast';

const knownPartitions = new Set<string>();
const webContentsPartition = new Map<number, string>();

const ALLOWED_PERMISSIONS = new Set([
  'notifications',
  'media',
  'clipboard-read',
  'clipboard-write',
  'clipboard-sanitized-write'
]);

function attachHandler(ses: Session, partition: string): void {
  ses.setPermissionRequestHandler((wc: WebContents, permission, callback) => {
    const granted = ALLOWED_PERMISSIONS.has(permission);
    dlog('PERMISSION:request', {
      partition,
      permission,
      granted,
      wcId: wc.id
    });
    callback(granted);
  });

  // Synchronous permission queries (e.g. the page reading
  // `Notification.permission`) bypass the request handler entirely. Without
  // this check handler the value is "default" and pages that gate behavior
  // on `=== 'granted'` either skip notifications silently or hang.
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    const granted = ALLOWED_PERMISSIONS.has(permission);
    dlog('PERMISSION:check', {
      partition,
      permission,
      origin: requestingOrigin,
      granted,
      wcId: wc?.id
    });
    return granted;
  });
}

function rememberPartition(partition: string): void {
  if (!partition) return;
  if (knownPartitions.has(partition)) return;
  knownPartitions.add(partition);
  attachHandler(session.fromPartition(partition), partition);
  dlog('PERMISSION:partition-registered', { partition });
}

export function rememberPartitionFromRenderer(partition: string): void {
  rememberPartition(partition);
}

export function initPermissions(
  storage: ElectronStoreAdapter,
  getMainWindow: () => BrowserWindow | null
): void {
  // Eager pass.
  storage
    .getAll()
    .then((all) => {
      const raw = all['boxb-services'];
      if (typeof raw !== 'string') return;
      try {
        const inner = JSON.parse(raw) as {
          state?: { services?: Array<{ partition?: string }> };
        };
        const services = inner.state?.services ?? [];
        dlog('PERMISSION:eager-pass', { serviceCount: services.length });
        for (const s of services) {
          if (typeof s.partition === 'string') rememberPartition(s.partition);
        }
      } catch (e) {
        dlog('PERMISSION:eager-parse-failed', { error: String(e) });
      }
    })
    .catch((e) => dlog('PERMISSION:eager-read-failed', { error: String(e) }));

  // Lazy pass.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    const ses = contents.session;
    let mappedPartition: string | null = null;
    for (const partition of knownPartitions) {
      if (session.fromPartition(partition) === ses) {
        webContentsPartition.set(contents.id, partition);
        mappedPartition = partition;
        break;
      }
    }
    dlog('PERMISSION:webview-attached', {
      wcId: contents.id,
      mappedPartition: mappedPartition ?? '(unknown)'
    });
    attachHandler(ses, mappedPartition ?? '(unknown)');
    contents.on('destroyed', () => {
      dlog('PERMISSION:webview-destroyed', { wcId: contents.id });
      webContentsPartition.delete(contents.id);
    });
  });

  ipcMain.on(IPC.service.registerPartition, (event, partition: string) => {
    dlog('IPC:register-partition', { senderId: event.sender.id, partition });
    rememberPartition(partition);
    if (typeof event.sender.id === 'number' && partition) {
      webContentsPartition.set(event.sender.id, partition);
    }
  });

  ipcMain.on(IPC.service.webviewNotificationClick, (event) => {
    const partition = webContentsPartition.get(event.sender.id);
    dlog('IPC:notification-click:received', {
      senderId: event.sender.id,
      partition
    });
    try {
      const win = getMainWindow();
      if (win) {
        if (win.isMinimized()) {
          dlog('WIN:restore', { reason: 'notification-click' });
          win.restore();
        }
        if (!win.isVisible()) {
          dlog('WIN:show', { reason: 'notification-click' });
          win.show();
        }
        dlog('WIN:focus', { reason: 'notification-click' });
        win.focus();
      }
      if (partition && win) {
        dlog('WIN:send', {
          channel: IPC.service.notificationClick,
          payload: { partition }
        });
        win.webContents.send(IPC.service.notificationClick, { partition });
      }
      dlog('IPC:notification-click:handled', { partition });
    } catch (err) {
      dlog('IPC:notification-click:ERROR', {
        partition,
        error: String(err)
      });
    }
  });

  // Debug-only IPCs from the webview-preload Notification wrapper. These do
  // not affect runtime behavior — they only mirror notification activity to
  // the debug log so freezes can be diagnosed post-mortem.
  ipcMain.on('debug:notification-created', (event, data: unknown) => {
    dlog('NOTIF:created-by-page', {
      senderId: event.sender.id,
      partition: webContentsPartition.get(event.sender.id),
      data
    });
  });
  ipcMain.on('debug:notification-clicked', (event, data: unknown) => {
    dlog('NOTIF:clicked-by-page', {
      senderId: event.sender.id,
      partition: webContentsPartition.get(event.sender.id),
      data
    });
  });

  // Main-side notification path. The page's window.Notification was replaced
  // (in src/preload/webview.ts) by a fake that forwards each construction
  // here. Phase 6.5 retired the Electron Notification API entirely after the
  // hang on Notification.isSupported() couldn't be cleared by AUMID
  // registration; we render our own toast in a dedicated BrowserWindow
  // (src/main/in-app-toast.ts) and route clicks through the same partition
  // → notification-click chain we use for OS toasts.
  ipcMain.on(
    'notif:create-from-page',
    (
      event,
      payload: { id?: string; title?: string; body?: string; icon?: string; tag?: string }
    ) => {
      const id = String(payload?.id ?? 'unknown');
      const title = String(payload?.title ?? 'BoxB');
      const body = String(payload?.body ?? '');
      const iconUrl = typeof payload?.icon === 'string' ? payload.icon : undefined;
      const senderId = event.sender.id;
      const partition = webContentsPartition.get(senderId);

      showToast({
        id,
        title,
        body,
        iconUrl,
        onClick: () => {
          dlog('TOAST:click-handler-running', { id, title, partition });
          const win = getMainWindow();
          if (win) {
            if (win.isMinimized()) {
              dlog('WIN:restore', { reason: 'toast-click' });
              win.restore();
            }
            if (!win.isVisible()) {
              dlog('WIN:show', { reason: 'toast-click' });
              win.show();
            }
            dlog('WIN:focus', { reason: 'toast-click' });
            win.focus();
          }
          if (partition && win) {
            dlog('WIN:send', {
              channel: IPC.service.notificationClick,
              payload: { partition }
            });
            win.webContents.send(IPC.service.notificationClick, { partition });
          }
          // Echo back to the originating webview so the page's own
          // onclick / addEventListener('click') fire (e.g. WhatsApp opens
          // the chat thread in response).
          if (!event.sender.isDestroyed()) {
            dlog('TOAST:echo-click-to-page', { id, senderId });
            event.sender.send('notif:clicked', { id });
          }
        }
      });
    }
  );
}
