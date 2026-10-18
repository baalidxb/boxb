import { app } from 'electron';
import type { Input, WebContents } from 'electron';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';

// v0.2.2: per-service zoom. Main's only job is to CATCH the zoom gestures
// and forward them; the renderer owns the zoom value (stored per service,
// persisted, applied with webview.setZoomFactor).
//
// Why main: when a <webview> has focus, keydown never reaches the host
// renderer, so App.tsx can't see Ctrl+=. before-input-event on the webview's
// own WebContents can. preventDefault() there also stops the hidden default
// application menu (autoHideMenuBar) from zooming the whole BoxB UI.

type ZoomDirection = 'in' | 'out' | 'reset';

function directionFor(input: Input): ZoomDirection | null {
  if (input.type !== 'keyDown') return null;
  if (!(input.control || input.meta) || input.alt) return null;
  const { key, code } = input;
  if (key === '=' || key === '+' || code === 'NumpadAdd') return 'in';
  if (key === '-' || key === '_' || code === 'NumpadSubtract') return 'out';
  if (key === '0' || code === 'Numpad0') return 'reset';
  return null;
}

function send(target: WebContents | null | undefined, webContentsId: number | null, direction: ZoomDirection): void {
  if (!target || target.isDestroyed()) return;
  target.send(IPC.zoom.request, { webContentsId, direction });
}

export function initZoomShortcuts(): void {
  app.on('web-contents-created', (_event, wc) => {
    const type = wc.getType();
    if (type !== 'webview' && type !== 'window') return;

    wc.on('before-input-event', (event, input) => {
      const direction = directionFor(input);
      if (!direction) return;
      event.preventDefault();
      if (type === 'webview') {
        send(wc.hostWebContents, wc.id, direction);
      } else {
        // Host window focused (sidebar, top bar…) → active service.
        send(wc, null, direction);
      }
      dlog('ZOOM:key', { type, wcId: wc.id, direction });
    });

    // Ctrl+mouse wheel. Electron doesn't apply wheel zoom by itself — it
    // emits this event and leaves it to the app. Only webviews: wheel over
    // the BoxB chrome should never zoom anything.
    if (type === 'webview') {
      wc.on('zoom-changed', (_e, zoomDirection) => {
        send(wc.hostWebContents, wc.id, zoomDirection === 'in' ? 'in' : 'out');
      });
    }
  });
}
