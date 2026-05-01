import { BrowserWindow, ipcMain, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Window is sized to comfortably hold MAX_VISIBLE stacked toasts plus
// margins; individual toasts size themselves to their content. The window
// is positioned bottom-right of the primary display's workArea (i.e. above
// the Windows taskbar), and stays put — multi-monitor moves are Phase 7+
// polish.
const TOAST_WINDOW_WIDTH = 400;
const TOAST_WINDOW_HEIGHT = 560;
const SCREEN_MARGIN_PX = 12;
const MAX_VISIBLE_TOASTS = 5;
const AUTO_DISMISS_MS = 5000;
// Action toasts (e.g. "update ready, restart?") stay visible much longer so
// the user can see them after stepping away from the desk. They still auto-
// hide eventually so a forgotten one doesn't camp on screen forever.
const ACTION_AUTO_DISMISS_MS = 5 * 60 * 1000;

interface ShowOptions {
  id: string;
  title: string;
  body: string;
  iconUrl?: string | undefined;
  onClick: () => void;
}

interface ActionToastOptions {
  id: string;
  title: string;
  body: string;
}

let toastWindow: BrowserWindow | null = null;
let rendererReady = false;
const pendingShows: ShowPayload[] = [];
const callbacks = new Map<string, ShowOptions>();

interface ShowPayload {
  id: string;
  title: string;
  body: string;
  iconUrl?: string | undefined;
  timestamp: number;
  kind?: 'notification' | 'action';
}

const TOAST_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: http: data: blob:; connect-src 'none'; font-src 'none'">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    color: #ffffff;
    -webkit-user-select: none;
    user-select: none;
    cursor: default;
  }
  #stack {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    background: #0F0F0F;
    border: 1px solid #D4AF37;
    border-radius: 8px;
    padding: 10px 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(212, 175, 55, 0.1);
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 2px;
    align-items: start;
    transform: translateX(120%);
    opacity: 0;
    transition: transform 200ms ease-out, opacity 200ms ease-out, border-color 120ms ease-out;
    cursor: pointer;
    overflow: hidden;
  }
  .toast.in {
    transform: translateX(0);
    opacity: 1;
  }
  .toast.out {
    transform: translateX(120%);
    opacity: 0;
    transition: transform 150ms ease-in, opacity 150ms ease-in;
  }
  .toast:hover {
    border-color: #F0CC4F;
  }
  .toast .icons {
    grid-row: 1 / span 2;
    grid-column: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    padding-top: 1px;
  }
  .toast .brand {
    width: 20px;
    height: 20px;
  }
  .toast .avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    background: #1a1a1a;
  }
  .toast .title {
    grid-row: 1;
    grid-column: 2;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toast .body {
    grid-row: 2;
    grid-column: 2 / span 2;
    font-size: 12px;
    line-height: 1.35;
    color: #d4d4d4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .toast .time {
    grid-row: 1;
    grid-column: 3;
    font-size: 10px;
    line-height: 1.25;
    color: #6B6B6B;
    white-space: nowrap;
    padding-left: 6px;
    padding-top: 1px;
  }
  .toast.action {
    cursor: default;
  }
  .toast.action .actions {
    grid-row: 3;
    grid-column: 2 / span 2;
    margin-top: 8px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .toast.action .btn {
    pointer-events: auto;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #2a2a2a;
    background: #1a1a1a;
    color: #d4d4d4;
    transition: filter 120ms ease-out, background 120ms ease-out;
  }
  .toast.action .btn:hover {
    filter: brightness(1.2);
  }
  .toast.action .btn-primary {
    background: #D4AF37;
    color: #000;
    border-color: #D4AF37;
    font-weight: 600;
  }
</style>
</head>
<body>
  <div id="stack"></div>
  <script>
  (function () {
    var BRAND_SVG = '<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" class="brand">'
      + '<polygon points="80,40 116,62 116,104 80,126 44,104 44,62" fill="#D4AF37"/>'
      + '<rect x="44" y="72" width="72" height="7" fill="#000000"/>'
      + '<rect x="44" y="92" width="72" height="7" fill="#000000"/>'
      + '</svg>';
    var stack = document.getElementById('stack');
    var live = new Map();

    function relTime(ts) {
      var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 5) return 'now';
      if (s < 60) return s + 's';
      var m = Math.round(s / 60);
      return m + 'm';
    }

    function dismiss(id) {
      var entry = live.get(id);
      if (!entry) return;
      live.delete(id);
      if (entry.dismissTimer) clearTimeout(entry.dismissTimer);
      if (entry.tickTimer) clearInterval(entry.tickTimer);
      entry.el.classList.remove('in');
      entry.el.classList.add('out');
      setTimeout(function () {
        if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
        try { window.toastApi.dismissed(id); } catch (e) {}
      }, 180);
    }

    function add(payload) {
      var isAction = payload.kind === 'action';

      // Cap visible count by auto-dismissing the oldest before adding.
      while (live.size >= ${MAX_VISIBLE_TOASTS}) {
        var oldestId = null;
        var oldestTs = Infinity;
        live.forEach(function (v, k) {
          if (v.payload.timestamp < oldestTs) {
            oldestTs = v.payload.timestamp;
            oldestId = k;
          }
        });
        if (oldestId == null) break;
        dismiss(oldestId);
      }

      var el = document.createElement('div');
      el.className = 'toast' + (isAction ? ' action' : '');
      el.setAttribute('role', 'alert');
      var iconsHtml = '<div class="icons">' + BRAND_SVG;
      if (!isAction && payload.iconUrl) {
        iconsHtml += '<img class="avatar" src="' + escapeAttr(payload.iconUrl) + '" alt="">';
      }
      iconsHtml += '</div>';
      var titleHtml = '<div class="title">' + escapeText(payload.title || 'BoxB') + '</div>';
      var timeHtml = isAction ? '' : '<div class="time">now</div>';
      var bodyHtml = '<div class="body">' + escapeText(payload.body || '') + '</div>';
      var actionsHtml = isAction
        ? '<div class="actions">'
          + '<button type="button" class="btn btn-later">Later</button>'
          + '<button type="button" class="btn btn-primary btn-restart">Restart</button>'
          + '</div>'
        : '';
      el.innerHTML = iconsHtml + titleHtml + timeHtml + bodyHtml + actionsHtml;

      if (isAction) {
        var restartBtn = el.querySelector('.btn-restart');
        var laterBtn = el.querySelector('.btn-later');
        if (restartBtn) {
          restartBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            try { window.toastApi.updateRestart(payload.id); } catch (e) {}
            dismiss(payload.id);
          });
        }
        if (laterBtn) {
          laterBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            try { window.toastApi.updateDismiss(payload.id); } catch (e) {}
            dismiss(payload.id);
          });
        }
      } else {
        el.addEventListener('click', function () {
          try { window.toastApi.click(payload.id); } catch (e) {}
          dismiss(payload.id);
        });
      }

      stack.appendChild(el);
      // Force layout, then animate in.
      void el.offsetWidth;
      el.classList.add('in');

      var timeEl = el.querySelector('.time');
      var dismissMs = isAction ? ${ACTION_AUTO_DISMISS_MS} : ${AUTO_DISMISS_MS};
      var entry = {
        el: el,
        payload: payload,
        timeEl: timeEl,
        dismissTimer: setTimeout(function () { dismiss(payload.id); }, dismissMs),
        tickTimer: isAction ? null : setInterval(function () {
          if (timeEl) timeEl.textContent = relTime(payload.timestamp);
        }, 5000)
      };
      live.set(payload.id, entry);
    }

    function escapeText(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeAttr(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    if (window.toastApi && typeof window.toastApi.onShow === 'function') {
      window.toastApi.onShow(add);
    }
  })();
  </script>
</body>
</html>`;

export function initToastWindow(): void {
  if (toastWindow) return;
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const x = wa.x + wa.width - TOAST_WINDOW_WIDTH - SCREEN_MARGIN_PX;
  const y = wa.y + wa.height - TOAST_WINDOW_HEIGHT - SCREEN_MARGIN_PX;

  toastWindow = new BrowserWindow({
    x,
    y,
    width: TOAST_WINDOW_WIDTH,
    height: TOAST_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/toast.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  // 'screen-saver' keeps it above fullscreen apps too. 'pop-up-menu' would
  // also work for normal use; pick screen-saver so a fullscreen WhatsApp
  // call doesn't bury the toast.
  toastWindow.setAlwaysOnTop(true, 'screen-saver');
  // Even with focusable: false there's a brief Windows quirk where show()
  // briefly steals focus; setVisibleOnAllWorkspaces helps the window
  // stay-put across virtual desktops.
  toastWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  toastWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    dlog('TOAST:renderer-ready');
    // Drain any toasts queued while the renderer was loading.
    while (pendingShows.length > 0) {
      const p = pendingShows.shift();
      if (p) sendToRenderer(p);
    }
  });

  // Loading via data: URL keeps the toast UI fully self-contained — no
  // filesystem path resolution to worry about across dev vs packaged builds.
  // The preload still runs because preload binding is independent of the
  // page's URL scheme.
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(TOAST_HTML);
  toastWindow.loadURL(dataUrl);

  toastWindow.on('closed', () => {
    toastWindow = null;
    rendererReady = false;
    callbacks.clear();
    pendingShows.length = 0;
  });

  ipcMain.on(IPC.toast.click, (_event, payload: { id?: unknown }) => {
    const id = String(payload?.id ?? '');
    if (!id) return;
    const cb = callbacks.get(id);
    dlog('TOAST:click', { id, hasCallback: !!cb });
    if (cb) {
      callbacks.delete(id);
      try {
        cb.onClick();
      } catch (err) {
        dlog('TOAST:click-handler-error', {
          id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  });

  ipcMain.on(IPC.toast.dismissed, (_event, payload: { id?: unknown }) => {
    const id = String(payload?.id ?? '');
    if (!id) return;
    callbacks.delete(id);
    dlog('TOAST:dismissed', { id, remaining: callbacks.size });
    if (callbacks.size === 0 && toastWindow && toastWindow.isVisible()) {
      toastWindow.hide();
      dlog('TOAST:window-hidden');
    }
  });
}

function sendToRenderer(payload: ShowPayload): void {
  if (!toastWindow || toastWindow.isDestroyed()) return;
  if (!toastWindow.isVisible()) {
    // showInactive avoids stealing focus from whatever the user was doing.
    toastWindow.showInactive();
    dlog('TOAST:window-shown');
  }
  toastWindow.webContents.send(IPC.toast.show, payload);
}

export function showToast(opts: ShowOptions): void {
  if (!toastWindow) {
    dlog('TOAST:show-before-init', { id: opts.id });
    return;
  }
  callbacks.set(opts.id, opts);
  const payload: ShowPayload = {
    id: opts.id,
    title: opts.title,
    body: opts.body,
    iconUrl: opts.iconUrl,
    timestamp: Date.now(),
    kind: 'notification'
  };
  dlog('TOAST:show', {
    id: opts.id,
    title: opts.title,
    bodyLen: opts.body.length,
    hasIcon: !!opts.iconUrl
  });
  if (rendererReady) {
    sendToRenderer(payload);
  } else {
    pendingShows.push(payload);
  }
}

// Action toasts have buttons (Restart / Later) instead of a whole-toast click
// handler. Currently used only by the auto-updater; the toast renderer wires
// the buttons directly to update:* IPC channels, so no onClick callback is
// stored on the main side.
export function showActionToast(opts: ActionToastOptions): void {
  if (!toastWindow) {
    dlog('TOAST:action-show-before-init', { id: opts.id });
    return;
  }
  const payload: ShowPayload = {
    id: opts.id,
    title: opts.title,
    body: opts.body,
    timestamp: Date.now(),
    kind: 'action'
  };
  dlog('TOAST:action-show', {
    id: opts.id,
    title: opts.title,
    bodyLen: opts.body.length
  });
  if (rendererReady) {
    sendToRenderer(payload);
  } else {
    pendingShows.push(payload);
  }
}

