import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// SECURITY TODO: tighten CSP before public release.
// Phase 1-2 keeps a permissive CSP for dev convenience. Lock down via
// a Content-Security-Policy meta tag in src/renderer/index.html and
// session.defaultSession.webRequest.onHeadersReceived in main.
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    bridgeRendererConsole(win);
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
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
