// Auto-update wiring on top of electron-updater.
//
// Behavior summary:
//   - 30s after init, check GitHub Releases for a newer version.
//   - Download silently in the background (no user-facing UI during download).
//   - When a build is fully downloaded, show an action toast offering Restart
//     or Later. Restart calls quitAndInstall(); Later relies on
//     autoInstallOnAppQuit so the update applies on the next natural quit.
//   - Recheck every 4 hours so users who keep the app open for days still get
//     updates within a reasonable window.
//
// Skipped entirely in dev (`!app.isPackaged`) and when
// BOXB_DISABLE_AUTOUPDATE=1 is set, since electron-updater needs a packaged
// app + signed metadata to do anything useful.
import { app, globalShortcut, ipcMain } from 'electron';
import log from 'electron-log';
// electron-updater is published as CommonJS; under our ESM main process the
// `autoUpdater` named export isn't visible. Pull it off the default export.
import updaterPkg from 'electron-updater';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';
import { showActionToast } from './in-app-toast';

const { autoUpdater } = updaterPkg;

const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 30 * 1000;
const RESTART_TOAST_ID = 'boxb-update-ready';

let initialized = false;

export function initAutoUpdater(): void {
  if (initialized) {
    dlog('AUTOUPDATE:already-initialized');
    return;
  }
  initialized = true;

  try {
    // electron-log writes to %APPDATA%\boxb\logs\main.log on Windows by
    // default. We let electron-log own its own file rotation (5MB default).
    log.transports.file.level = 'info';
    log.transports.console.level = 'info';

    // Always wire IPC handlers. Even in dev, the manual Ctrl+Shift+U test
    // shortcut needs them to verify the toast button wiring end-to-end.
    registerIpcHandlers();

    if (!app.isPackaged) {
      dlog('AUTOUPDATE:dev-skipped');
      log.info('autoUpdater: dev-skipped (app not packaged)');
      registerDevTestShortcut();
      return;
    }

    if (process.env.BOXB_DISABLE_AUTOUPDATE === '1') {
      dlog('AUTOUPDATE:env-disabled');
      log.info('autoUpdater: env-disabled (BOXB_DISABLE_AUTOUPDATE=1)');
      return;
    }

    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    wireEventHandlers();

    setTimeout(() => {
      void checkForUpdates();
    }, FIRST_CHECK_DELAY_MS);

    setInterval(() => {
      void checkForUpdates();
    }, RECHECK_INTERVAL_MS);

    dlog('AUTOUPDATE:initialized', {
      firstCheckMs: FIRST_CHECK_DELAY_MS,
      recheckMs: RECHECK_INTERVAL_MS
    });
  } catch (err) {
    // electron-updater can throw at module level if its config is malformed
    // or if it can't resolve the publish provider. Don't crash the app over
    // a non-essential feature — log and move on.
    const msg = err instanceof Error ? err.message : String(err);
    dlog('AUTOUPDATE:init-error', { error: msg });
    try {
      log.error('autoUpdater init failed:', err);
    } catch {
      // log itself may be the thing that failed; stay silent.
    }
  }
}

function wireEventHandlers(): void {
  autoUpdater.on('checking-for-update', () => {
    dlog('AUTOUPDATE:checking');
  });
  autoUpdater.on('update-available', (info) => {
    dlog('AUTOUPDATE:available', {
      version: info?.version,
      releaseDate: info?.releaseDate
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    dlog('AUTOUPDATE:not-available', { version: info?.version });
  });
  autoUpdater.on('error', (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    dlog('AUTOUPDATE:error', { error: msg });
    // Per spec: silent failure, no user-facing UI. electron-updater retries
    // on next setInterval tick automatically.
  });
  autoUpdater.on('download-progress', (p) => {
    dlog('AUTOUPDATE:progress', {
      percent: typeof p?.percent === 'number' ? Math.round(p.percent) : null
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    dlog('AUTOUPDATE:downloaded', {
      version: info?.version,
      releaseDate: info?.releaseDate
    });
    showRestartToast(info?.version ?? 'unknown');
  });
}

async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dlog('AUTOUPDATE:check-throw', { error: msg });
  }
}

export function showRestartToast(version: string): void {
  showActionToast({
    id: RESTART_TOAST_ID,
    title: 'BoxB',
    body: `Update v${version} ready. Restart to install.`
  });
}

function registerIpcHandlers(): void {
  ipcMain.on(IPC.update.restartNow, () => {
    dlog('AUTOUPDATE:restart-clicked', { packaged: app.isPackaged });
    if (!app.isPackaged) {
      // In dev, just prove the wire works. quitAndInstall would fail anyway
      // since there's no installer to launch.
      log.info('autoUpdater: restart clicked (dev — quitAndInstall skipped)');
      return;
    }
    try {
      autoUpdater.quitAndInstall();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dlog('AUTOUPDATE:quit-and-install-error', { error: msg });
    }
  });

  ipcMain.on(IPC.update.dismiss, () => {
    dlog('AUTOUPDATE:dismiss-clicked');
    // No-op on the main side: the toast renderer animates itself out, and
    // autoInstallOnAppQuit applies the update on the next natural quit.
  });
}

function registerDevTestShortcut(): void {
  // Ctrl+Shift+U manually fires the restart toast so we can verify the action
  // toast UI without triggering a real update. Guarded by !app.isPackaged so
  // the shortcut never registers in shipped builds. initAutoUpdater is
  // called from within app.whenReady, so globalShortcut is safe to use here.
  const ok = globalShortcut.register('Control+Shift+U', () => {
    dlog('AUTOUPDATE:dev-trigger-shortcut');
    showRestartToast('0.1.1-test');
  });
  dlog('AUTOUPDATE:dev-shortcut-registered', { ok });
}
