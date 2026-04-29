import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lifecycle } from './lifecycle';
import { getAllWindows } from './windows';

const __dirname = dirname(fileURLToPath(import.meta.url));

let trayInstance: Tray | null = null;

function resolveTrayIconPath(): string {
  // out/main/index.js → ../../resources/tray/tray-32.png
  const fromBuilt = join(__dirname, '..', '..', 'resources', 'tray', 'tray-32.png');
  return fromBuilt;
}

function showAllWindows(getPrimary: () => BrowserWindow | null): void {
  const all = getAllWindows();
  for (const w of all) {
    if (w.isMinimized()) w.restore();
    if (!w.isVisible()) w.show();
  }
  const primary = getPrimary() ?? all[0] ?? null;
  if (primary) primary.focus();
}

function toggleWindow(getPrimary: () => BrowserWindow | null): void {
  const all = getAllWindows();
  const anyVisible = all.some((w) => w.isVisible() && !w.isMinimized());
  if (anyVisible) {
    for (const w of all) w.hide();
  } else {
    showAllWindows(getPrimary);
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
        click: () => showAllWindows(getWindow)
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
