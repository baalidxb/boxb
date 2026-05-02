import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lifecycle } from './lifecycle';
import { loadWindowState, saveWindowState } from './window-state';
import { dlog } from './debug-log';
import { getAllWindows, registerWindow } from './windows';
import { killPtysForWindow } from './terminal';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SECONDARY_CASCADE_PX = 30;
const SECONDARY_DEFAULT_WIDTH = 1200;
const SECONDARY_DEFAULT_HEIGHT = 800;

let primaryWindow: BrowserWindow | null = null;

interface BaseOpts {
  x?: number;
  y?: number;
  width: number;
  height: number;
  lockedWorkspaceId?: string;
}

function buildBaseWindow(opts: BaseOpts): BrowserWindow {
  // Locked windows pass the workspace id to their renderer via
  // process.argv. The preload reads it once at startup; the renderer's
  // store seals the lock and never unsets it.
  const additionalArguments = opts.lockedWorkspaceId
    ? [`--locked-workspace-id=${opts.lockedWorkspaceId}`]
    : [];
  return new BrowserWindow({
    ...(typeof opts.x === 'number' ? { x: opts.x } : {}),
    ...(typeof opts.y === 'number' ? { y: opts.y } : {}),
    width: opts.width,
    height: opts.height,
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
      webviewTag: true,
      additionalArguments
    }
  });
}

function loadContent(win: BrowserWindow): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    dlog('WIN:loadURL', { devUrl, wcId: win.webContents.id });
    win.loadURL(devUrl);
    bridgeRendererConsole(win);
  } else {
    const filePath = join(__dirname, '../renderer/index.html');
    dlog('WIN:loadFile', { filePath, wcId: win.webContents.id });
    win.loadFile(filePath);
  }
}

function attachVisibilityLogs(win: BrowserWindow): void {
  win.on('show', () => dlog('WIN:event:show', { wcId: win.webContents.id }));
  win.on('hide', () => dlog('WIN:event:hide', { wcId: win.webContents.id }));
  win.on('focus', () => dlog('WIN:event:focus', { wcId: win.webContents.id }));
  win.on('blur', () => dlog('WIN:event:blur', { wcId: win.webContents.id }));
  win.on('closed', () => dlog('WIN:event:closed'));
}

// SECURITY TODO: tighten CSP before public release.
// Phase 1-2 keeps a permissive CSP for dev convenience. Lock down via
// a Content-Security-Policy meta tag in src/renderer/index.html and
// session.defaultSession.webRequest.onHeadersReceived in main.
export function createMainWindow(): BrowserWindow {
  const state = loadWindowState();
  dlog('WIN:create-main', { state });

  const win = buildBaseWindow({
    ...(typeof state.x === 'number' ? { x: state.x } : {}),
    ...(typeof state.y === 'number' ? { y: state.y } : {}),
    width: state.width,
    height: state.height
  });

  if (state.isMaximized) {
    dlog('WIN:maximize', { reason: 'restore-state' });
    win.maximize();
  }
  dlog('WIN:show', { reason: 'initial', wcId: win.webContents.id });
  win.show();

  primaryWindow = win;
  registerWindow(win);
  loadContent(win);
  attachVisibilityLogs(win);

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
    const remaining = getAllWindows();
    const isLast = remaining.length <= 1; // includes self
    dlog('WIN:event:close-main', {
      wcId: win.webContents.id,
      isQuitting: lifecycle.isQuitting,
      isLast
    });
    if (lifecycle.isQuitting) {
      persistCurrentState();
      return;
    }
    if (isLast) {
      // Last window: hide to tray. Keep alive so notifications continue.
      event.preventDefault();
      persistCurrentState();
      dlog('WIN:hide', { reason: 'close-to-tray-main' });
      win.hide();
    } else {
      // Other windows still open — destroy this one normally; persist its
      // saved bounds first so it serves as the next-launch geometry.
      persistCurrentState();
    }
  });

  // Capture wcId now — webContents is unreachable inside the closed handler.
  const wcIdMain = win.webContents.id;
  win.on('closed', () => {
    killPtysForWindow(wcIdMain);
    if (primaryWindow === win) {
      const next = getAllWindows()[0] ?? null;
      primaryWindow = next;
      dlog('WIN:primary-promoted', { wcId: next?.webContents.id ?? null });
    }
  });

  return win;
}

// Additional window. Uses cascade offset from the primary window's saved
// bounds so each new window appears slightly offset. Does NOT save its own
// state. Last-window-close still hides to tray. If lockedWorkspaceId is
// passed, the renderer is started in locked mode (sealed to that workspace).
export function createSecondaryWindow(opts?: {
  lockedWorkspaceId?: string;
}): BrowserWindow {
  const cascadeIndex = getAllWindows().length;
  const base = loadWindowState();
  const baseX = typeof base.x === 'number' ? base.x : 100;
  const baseY = typeof base.y === 'number' ? base.y : 100;
  const x = baseX + cascadeIndex * SECONDARY_CASCADE_PX;
  const y = baseY + cascadeIndex * SECONDARY_CASCADE_PX;
  dlog('WIN:create-secondary', {
    x,
    y,
    cascadeIndex,
    lockedWorkspaceId: opts?.lockedWorkspaceId ?? null
  });

  const win = buildBaseWindow({
    x,
    y,
    width: SECONDARY_DEFAULT_WIDTH,
    height: SECONDARY_DEFAULT_HEIGHT,
    ...(opts?.lockedWorkspaceId ? { lockedWorkspaceId: opts.lockedWorkspaceId } : {})
  });
  dlog('WIN:show', { reason: 'initial-secondary', wcId: win.webContents.id });
  win.show();
  registerWindow(win);
  loadContent(win);
  attachVisibilityLogs(win);

  win.on('close', (event) => {
    const remaining = getAllWindows();
    const isLast = remaining.length <= 1;
    dlog('WIN:event:close-secondary', {
      wcId: win.webContents.id,
      isQuitting: lifecycle.isQuitting,
      isLast
    });
    if (lifecycle.isQuitting) return;
    if (isLast) {
      event.preventDefault();
      dlog('WIN:hide', { reason: 'close-to-tray-secondary' });
      win.hide();
    }
    // else: allow destroy
  });

  const wcIdSecondary = win.webContents.id;
  win.on('closed', () => {
    killPtysForWindow(wcIdSecondary);
  });

  return win;
}

export function getMainWindow(): BrowserWindow | null {
  if (primaryWindow && !primaryWindow.isDestroyed()) return primaryWindow;
  return getAllWindows()[0] ?? null;
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
