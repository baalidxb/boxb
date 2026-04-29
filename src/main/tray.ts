import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lifecycle } from './lifecycle';

const __dirname = dirname(fileURLToPath(import.meta.url));

let trayInstance: Tray | null = null;

function resolveTrayIconPath(): string {
  // out/main/index.js → ../../resources/tray/tray-32.png
  const fromBuilt = join(__dirname, '..', '..', 'resources', 'tray', 'tray-32.png');
  return fromBuilt;
}

function toggleWindow(getWindow: () => BrowserWindow | null): void {
  const win = getWindow();
  if (!win) return;
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

export function createTray(getWindow: () => BrowserWindow | null): Tray | null {
  try {
    const image = nativeImage.createFromPath(resolveTrayIconPath());
    const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip('BoxB');

    const menu = Menu.buildFromTemplate([
      {
        label: 'Show BoxB',
        click: () => {
          const win = getWindow();
          if (!win) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      },
      {
        label: 'Settings',
        click: () => {
          // Phase 5: open settings window/panel.
          console.log('[tray] settings clicked — Phase 5');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit BoxB',
        click: () => {
          lifecycle.isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(menu);

    tray.on('click', () => toggleWindow(getWindow));

    trayInstance = tray;
    return tray;
  } catch (e) {
    console.warn(
      '[tray] creation failed (likely no system tray available on this DE); falling back to no-tray mode.',
      e
    );
    return null;
  }
}

export function getTray(): Tray | null {
  return trayInstance;
}
