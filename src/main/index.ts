import { app } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { getAllWindows } from './windows';
import { registerIpcHandlers } from './ipc';
import { initPermissions } from './permissions';
import { initDownloads } from './downloads';
import { createTray, setOpenExportModal, setOpenSetApiKeyModal } from './tray';
import { lifecycle } from './lifecycle';
import { dlog, clearDebugLog } from './debug-log';
import { initHibernation, getHibernationSnapshot } from './hibernation';
import { initToastWindow } from './in-app-toast';
import { initAutoUpdater } from './auto-update';
import { registerTerminalIpc, killAllPtys } from './terminal';
import { detectLaunchConfig, registerManagedIpc } from './managed-config';
import { registerAiIpc } from './command-bar-ai';
import { IPC } from '@shared/ipc';

// AUMID is harmless to set even though we no longer rely on Windows toast
// resolution (Phase 6.5 retired that path — see src/main/in-app-toast.ts).
// Kept in case future features want it (jump lists, taskbar grouping).
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
    // Best-effort kill of every pty before electron tears the renderers down.
    // SIGINT first so PowerShell can release file handles, SIGKILL after a
    // 1s grace inside killEntry. Without this, orphaned powershell.exe
    // processes can survive after BoxB closes.
    killAllPtys('app-before-quit');
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
      // BUG-2-DIAG: hib snapshot on popup creation — remove after v0.1.5 fix
      dlog('WC:did-create-window', {
        id: wc.id,
        url: details.url,
        hib: wc.getType() === 'webview' ? getHibernationSnapshot() : undefined
      })
    );
    // BUG-2-DIAG: capture nav redirects + upload-related console msgs from
    // webviews to diagnose forward-to-individual failure. Remove after v0.1.5.
    if (wc.getType() === 'webview') {
      wc.on('will-navigate', (_e, navUrl) =>
        dlog('BUG2:will-navigate', {
          id: wc.id,
          url: navUrl.substring(0, 200),
          hib: getHibernationSnapshot()
        })
      );
      wc.on('console-message', (_e, level, msg) => {
        const m = msg.toLowerCase();
        if (
          m.includes('upload') ||
          m.includes('forward') ||
          m.includes('encrypt') ||
          m.includes('e2e')
        ) {
          dlog('BUG2:console', { id: wc.id, level, msg: msg.substring(0, 200) });
        }
      });
    }
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

    initToastWindow();
    dlog('APP:toast-window-initialized');
    const storage = registerIpcHandlers();
    dlog('APP:ipc-handlers-registered');
    registerTerminalIpc();
    dlog('APP:terminal-ipc-registered');
    registerManagedIpc();
    dlog('APP:managed-ipc-registered');
    registerAiIpc();
    dlog('APP:ai-ipc-registered');
    // Detect any pending managed config BEFORE the main window mounts so
    // the renderer's first managed:check-launch-config call sees it.
    detectLaunchConfig();
    dlog('APP:launch-config-detected');
    initPermissions(storage, getMainWindow);
    dlog('APP:permissions-initialized');
    initDownloads();
    dlog('APP:downloads-initialized');
    initHibernation();
    dlog('APP:hibernation-initialized');
    createMainWindow();
    dlog('APP:main-window-created');
    createTray(getMainWindow);
    dlog('APP:tray-created');
    // Wire the tray export item to a renderer message. Tray menu items run
    // in main, but the export modal lives in the renderer; this bridges.
    setOpenExportModal(() => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.managed.openExportModal);
      }
    });
    // Same bridge for Phase 9.2 "Set Anthropic API Key…" tray item.
    setOpenSetApiKeyModal(() => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.ai.openSetApiKeyModal);
      }
    });
    initAutoUpdater();
    dlog('APP:auto-updater-initialized');

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
