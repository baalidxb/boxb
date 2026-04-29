import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lifecycle } from './lifecycle';
import { loadWindowState, saveWindowState } from './window-state';
import { dlog } from './debug-log';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

// SECURITY TODO: tighten CSP before public release.
// Phase 1-2 keeps a permissive CSP for dev convenience. Lock down via
// a Content-Security-Policy meta tag in src/renderer/index.html and
// session.defaultSession.webRequest.onHeadersReceived in main.
export function createMainWindow(): BrowserWindow {
  const state = loadWindowState();
  dlog('WIN:create', { state });

  const win = new BrowserWindow({
    ...(typeof state.x === 'number' ? { x: state.x } : {}),
    ...(typeof state.y === 'number' ? { y: state.y } : {}),
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  if (state.isMaximized) {
    dlog('WIN:maximize', { reason: 'restore-state' });
    win.maximize();
  }
  dlog('WIN:show', { reason: 'initial' });
  win.show();

  mainWindow = win;

  if (process.env.ELECTRON_RENDERER_URL) {
    bridgeRendererConsole(win);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    dlog('WIN:loadURL', { devUrl });
    win.loadURL(devUrl);
  } else {
    const filePath = join(__dirname, '../renderer/index.html');
    dlog('WIN:loadFile', { filePath });
    win.loadFile(filePath);
  }

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistCurrentState, 500);
  };
  const persistCurrentState = (): void => {
    if (win.isDestroyed()) return;
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized
    });
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', () => {
    dlog('WIN:event:maximize');
    scheduleSave();
  });
  win.on('unmaximize', () => {
    dlog('WIN:event:unmaximize');
    scheduleSave();
  });

  win.on('close', (event) => {
    dlog('WIN:event:close', { isQuitting: lifecycle.isQuitting });
    if (!lifecycle.isQuitting) {
      event.preventDefault();
      persistCurrentState();
      dlog('WIN:hide', { reason: 'close-to-tray' });
      win.hide();
    } else {
      persistCurrentState();
    }
  });

  win.on('show', () => dlog('WIN:event:show'));
  win.on('hide', () => dlog('WIN:event:hide'));
  win.on('focus', () => dlog('WIN:event:focus'));
  win.on('blur', () => dlog('WIN:event:blur'));

  win.on('closed', () => {
    dlog('WIN:event:closed');
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// Pipe renderer console warnings/errors to main stdout in dev so they
// surface in the dev log even without DevTools open.
// level: 0=verbose, 1=info, 2=warning, 3=error
function bridgeRendererConsole(win: BrowserWindow): void {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      const tag = level === 3 ? 'renderer ERROR' : 'renderer WARN';
      console.log(`[${tag}] ${message} (${sourceId}:${line})`);
    }
  });
}
