import { app, BrowserWindow, Notification, ipcMain, session } from 'electron';
import type { Session, WebContents } from 'electron';
import { ElectronStoreAdapter } from './storage/electron-store-adapter';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';

const knownPartitions = new Set<string>();
const webContentsPartition = new Map<number, string>();

const ALLOWED_PERMISSIONS = new Set(['notifications', 'media', 'clipboard-read']);

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

  // Main-side notification path. The page's window.Notification has been
  // replaced with a fake constructor that returns immediately and forwards
  // the payload here. We fire the actual OS toast via Electron's own
  // Notification class — same path Slack/Discord use, properly hooked into
  // Windows Action Center via the AppUserModelId set in main/index.ts.
  ipcMain.on(
    'notif:create-from-page',
    (
      event,
      payload: { id?: string; title?: string; body?: string; icon?: string; tag?: string }
    ) => {
      const id = String(payload?.id ?? 'unknown');
      const title = String(payload?.title ?? 'BoxB');
      const body = String(payload?.body ?? '');
      const senderId = event.sender.id;

      // Windows dev environments without a registered installed app
      // synchronously hang the main process inside Notification.isSupported().
      // Skip the entire native-toast path in dev — badges still update via
      // page-title-updated, and the page-side wrapper still returns a fake
      // Notification so the site's JS doesn't crash. Production builds
      // (app.isPackaged === true) take the normal path.
      if (!app.isPackaged) {
        dlog('NOTIF:main-skipped-dev', { id, title, reason: 'dev-mode-no-toast' });
        return;
      }

      dlog('NOTIF:main-creating', { id, title, body, senderId });

      dlog('NOTIF:main-before-isSupported', { id });
      if (!Notification.isSupported()) {
        dlog('NOTIF:main-NOT-SUPPORTED', { id });
        return;
      }

      dlog('NOTIF:main-before-construct', { id });
      let notif: Notification;
      try {
        notif = new Notification({
          title,
          body,
          silent: false
        });
        dlog('NOTIF:main-after-construct', { id });
      } catch (err) {
        dlog('NOTIF:main-CONSTRUCT-FAILED', {
          id,
          error: err instanceof Error ? err.message : String(err)
        });
        return;
      }

      notif.on('show', () => dlog('NOTIF:main-shown', { id }));
      notif.on('close', () => dlog('NOTIF:main-closed', { id }));
      notif.on('failed', (_e, error) => dlog('NOTIF:main-FAILED', { id, error }));
      notif.on('click', () => {
        dlog('NOTIF:main-clicked', { id, title });
        const win = getMainWindow();
        if (win) {
          if (win.isMinimized()) {
            dlog('WIN:restore', { reason: 'main-notif-click' });
            win.restore();
          }
          if (!win.isVisible()) {
            dlog('WIN:show', { reason: 'main-notif-click' });
            win.show();
          }
          dlog('WIN:focus', { reason: 'main-notif-click' });
          win.focus();
        }
        const partition = webContentsPartition.get(senderId);
        if (partition && win) {
          dlog('WIN:send', {
            channel: IPC.service.notificationClick,
            payload: { partition }
          });
          win.webContents.send(IPC.service.notificationClick, { partition });
        }
        // Echo back to the originating webview so its page-side listeners
        // (onclick, addEventListener('click')) fire.
        if (!event.sender.isDestroyed()) {
          dlog('NOTIF:main-echo-click-to-page', { id, senderId });
          event.sender.send('notif:clicked', { id });
        }
      });

      dlog('NOTIF:main-before-show', { id });
      try {
        notif.show();
        dlog('NOTIF:main-after-show', { id });
      } catch (err) {
        dlog('NOTIF:main-SHOW-FAILED', {
          id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );
}
