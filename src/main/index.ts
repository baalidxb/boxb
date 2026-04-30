import { app } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { getAllWindows } from './windows';
import { registerIpcHandlers } from './ipc';
import { initPermissions } from './permissions';
import { createTray } from './tray';
import { lifecycle } from './lifecycle';
import { dlog, clearDebugLog } from './debug-log';
import { initHibernation } from './hibernation';

// Must be set before any window or webview is created. Required on Windows
// for HTML5 Notification toasts to actually display via Action Center —
// without it the Notification constructor hangs the renderer because Windows
// can't resolve a registered app for the toast.
if (process.platform === 'win32') {
  app.setAppUserModelId('app.boxb');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    dlog('APP:second-instance');
    const all = getAllWindows();
    for (const w of all) {
      if (w.isMinimized()) w.restore();
      if (!w.isVisible()) w.show();
    }
    const primary = getMainWindow() ?? all[0];
    if (primary) primary.focus();
  });

  app.on('before-quit', () => {
    dlog('APP:before-quit');
    lifecycle.isQuitting = true;
  });

  // Web contents lifecycle instrumentation. Catches any webContents (host
  // BrowserWindow, webviews, popups). Registered before whenReady so the
  // host's webContents-created event isn't missed.
  app.on('web-contents-created', (_event, wc) => {
    let url = '';
    try {
      url = wc.getURL();
    } catch {
      // pre-load
    }
    dlog('WC:created', { id: wc.id, type: wc.getType(), url });
    wc.on('did-create-window', (_window, details) =>
      dlog('WC:did-create-window', { id: wc.id, url: details.url })
    );
    wc.on('render-process-gone', (_e, details) =>
      dlog('WC:render-process-gone', { id: wc.id, reason: details.reason, exitCode: details.exitCode })
    );
    wc.on('unresponsive', () => {
      let curUrl = '';
      try {
        curUrl = wc.getURL();
      } catch {
        // ignore
      }
      dlog('WC:UNRESPONSIVE', { id: wc.id, url: curUrl });
    });
    wc.on('responsive', () => dlog('WC:responsive', { id: wc.id }));
    wc.on('console-message', (_e, level, message) => {
      if (level >= 2 || message.includes('Notification') || message.includes('error')) {
        dlog('WC:console', { id: wc.id, level, message: message.substring(0, 200) });
      }
    });
  });

  app.whenReady().then(() => {
    clearDebugLog();
    dlog('=== BOXB STARTUP ===', {
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron
    });
    if (process.platform === 'win32') {
      dlog('APP:user-model-id-set', { id: 'app.boxb' });
    }
    if (!app.isPackaged) {
      console.log(
        '[BoxB] Native toast notifications disabled in dev mode. They activate in packaged builds (npm run package). Badges still work.'
      );
      dlog('APP:dev-mode-toast-disabled');
    }

    const storage = registerIpcHandlers();
    dlog('APP:ipc-handlers-registered');
    initPermissions(storage, getMainWindow);
    dlog('APP:permissions-initialized');
    initHibernation();
    dlog('APP:hibernation-initialized');
    createMainWindow();
    dlog('APP:main-window-created');
    createTray(getMainWindow);
    dlog('APP:tray-created');

    app.on('activate', () => {
      dlog('APP:activate');
      const all = getAllWindows();
      if (all.length === 0) {
        createMainWindow();
        return;
      }
      for (const w of all) {
        if (!w.isVisible()) w.show();
      }
      const primary = getMainWindow() ?? all[0];
      if (primary) primary.focus();
    });
  });

  // Minimize-to-tray: don't quit when all windows are closed.
  app.on('window-all-closed', () => {
    dlog('APP:window-all-closed (intentional no-op)');
  });
}
