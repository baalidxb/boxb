import type { BrowserWindow } from 'electron';

const windows = new Set<BrowserWindow>();

export function registerWindow(win: BrowserWindow): void {
  windows.add(win);
  win.on('closed', () => {
    windows.delete(win);
  });
}

export function getAllWindows(): BrowserWindow[] {
  return Array.from(windows).filter((w) => !w.isDestroyed());
}

export function getWindowCount(): number {
  return getAllWindows().length;
}
