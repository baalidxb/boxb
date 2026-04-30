// Webview preload. Loaded by every <webview> tag.
//
// We replace window.Notification entirely with a fake constructor that:
//   1. Returns immediately with a Notification-shaped object so the page's
//      JS doesn't block on construction.
//   2. Sends the notification data to main via IPC so Electron's main-side
//      Notification class can fire the actual OS toast (this is the path
//      Slack/Discord use; the in-page HTML5 path was hanging Windows).
//   3. Keeps a page-world registry of fake notifications so click events
//      coming back from main can fire the page's onclick / addEventListener
//      listeners.
//
// We never call `new OriginalNotification(...)` — it's the call that hangs.
//
// Phase 6 also injects a page-world hibernation shim:
//   - window.__boxbHibernationState: 'active' | 'frozen'
//   - window.__boxbHibernationFreeze(): throttle rAF + setInterval
//   - window.__boxbHibernationThaw(): restore originals
//   - window.__boxbHasUnsentText(): scan inputs for unsent text
// Triggered from main via ipcRenderer.on('hibernation:freeze' | 'thaw').
import { contextBridge, ipcRenderer, webFrame } from 'electron';

// IMPORTANT: do NOT import from '@shared/ipc' here. Sandboxed Electron
// preloads can't require() relative files at runtime, and Rollup will
// split a shared module into chunks/*.cjs the moment two preload entries
// import the same source — silently breaking both preloads. Hard-code
// channel name strings instead. Keep these in sync with src/shared/ipc.ts.
const WEBVIEW_NOTIFICATION_CLICK = 'service:webview-notification-click';
const HIBERNATION_FREEZE = 'hibernation:freeze';
const HIBERNATION_THAW = 'hibernation:thaw';

// Functional bridges (kept for the click-to-switch-tile feature).
contextBridge.exposeInMainWorld('__boxbNotifyClick', () => {
  ipcRenderer.send(WEBVIEW_NOTIFICATION_CLICK);
});

// Debug mirroring (kept so the debug log keeps showing notification activity).
contextBridge.exposeInMainWorld('__boxbNotifyCreated', (title: string) => {
  ipcRenderer.send('debug:notification-created', { title });
});
contextBridge.exposeInMainWorld('__boxbNotifyClicked', (title: string) => {
  ipcRenderer.send('debug:notification-clicked', { title });
});

// Page → main: full notification payload, fire-and-forget.
contextBridge.exposeInMainWorld(
  '__boxbCreateNotif',
  (data: {
    id: string;
    title: string;
    body?: string;
    icon?: string;
    tag?: string;
  }) => {
    ipcRenderer.send('notif:create-from-page', data);
  }
);

// Main → page: when the user clicks the OS toast, route the id through to
// the page-world handler so the page's own onclick/listeners fire.
ipcRenderer.on('notif:clicked', (_event, payload: { id?: string }) => {
  const id = payload && typeof payload.id === 'string' ? payload.id : '';
  if (!id) return;
  const escapedId = JSON.stringify(id);
  webFrame
    .executeJavaScript(
      'if (window.__boxbHandleNotifClick) window.__boxbHandleNotifClick(' + escapedId + ');'
    )
    .catch(() => {
      // page may have navigated; safe to ignore
    });
});

// Page-world wrap: replaces window.Notification with FakeNotification.
// Idempotent. Preserves prototype + static API so apps that gate on
// Notification.permission, instanceof Notification, etc. behave identically.
const wrapSource = `
(function() {
  if (window.__boxbNotificationWrapped) return;
  window.__boxbNotificationWrapped = true;

  var OriginalNotification = window.Notification;
  if (!OriginalNotification) return;

  var registry = new Map();
  var seq = 0;

  function genId() {
    seq = (seq + 1) | 0;
    return 'n-' + Date.now() + '-' + seq;
  }

  function FakeNotification(title, options) {
    options = options || {};
    var id = genId();
    var listeners = { click: [], close: [], error: [], show: [] };
    var fake = {
      title: String(title == null ? '' : title),
      body: typeof options.body === 'string' ? options.body : '',
      icon: typeof options.icon === 'string' ? options.icon : '',
      tag: typeof options.tag === 'string' ? options.tag : '',
      data: options.data,
      onclick: null,
      onclose: null,
      onerror: null,
      onshow: null,
      close: function() { /* no-op; main-side toast self-dismisses */ },
      addEventListener: function(event, listener) {
        if (listeners[event] && typeof listener === 'function') {
          listeners[event].push(listener);
        }
      },
      removeEventListener: function(event, listener) {
        if (listeners[event]) {
          var idx = listeners[event].indexOf(listener);
          if (idx >= 0) listeners[event].splice(idx, 1);
        }
      },
      dispatchEvent: function() { return true; },
      __boxbId: id,
      __boxbListeners: listeners
    };
    registry.set(id, fake);

    try {
      if (window.__boxbCreateNotif) {
        window.__boxbCreateNotif({
          id: id,
          title: fake.title,
          body: fake.body,
          icon: fake.icon,
          tag: fake.tag
        });
      }
    } catch (e) { /* never throw from the wrap */ }

    try {
      if (window.__boxbNotifyCreated) window.__boxbNotifyCreated(fake.title);
    } catch (e) {}

    return fake;
  }

  window.__boxbHandleNotifClick = function(id) {
    var fake = registry.get(id);
    if (!fake) return;
    try {
      if (typeof fake.onclick === 'function') {
        fake.onclick.call(fake, { type: 'click', target: fake });
      }
    } catch (e) {}
    var clickListeners = (fake.__boxbListeners && fake.__boxbListeners.click) || [];
    for (var i = 0; i < clickListeners.length; i++) {
      try {
        clickListeners[i].call(fake, { type: 'click', target: fake });
      } catch (e) {}
    }
    try { if (window.__boxbNotifyClicked) window.__boxbNotifyClicked(fake.title); } catch (e) {}
    try { if (window.__boxbNotifyClick) window.__boxbNotifyClick(); } catch (e) {}
  };

  try {
    FakeNotification.requestPermission =
      OriginalNotification.requestPermission.bind(OriginalNotification);
  } catch (e) {}
  try {
    Object.defineProperty(FakeNotification, 'permission', {
      get: function() { return OriginalNotification.permission; }
    });
  } catch (e) {}
  try { FakeNotification.maxActions = OriginalNotification.maxActions; } catch (e) {}
  FakeNotification.prototype = OriginalNotification.prototype;

  window.Notification = FakeNotification;
})();
`;

webFrame.executeJavaScript(wrapSource).catch(() => {
  // Page may have been destroyed before injection. Safe to ignore.
});

// Page-world hibernation shim. Throttles rAF and setInterval when frozen so
// the page stops burning CPU/GPU on background animations and polling. Does
// NOT touch event listeners, the DOM, or globals beyond the timer wrappers
// (per Phase 6 defensive notes — websockets and notification listeners must
// keep working in light-hibernation mode).
//
// __boxbHasUnsentText scans the live DOM for any input/textarea/
// contenteditable with non-empty trimmed value. Called by main before
// hibernating to skip the round if the user is mid-typing.
const hibernationSource = `
(function() {
  if (window.__boxbHibernationInstalled) return;
  window.__boxbHibernationInstalled = true;
  window.__boxbHibernationState = 'active';

  var origRaf = window.requestAnimationFrame;
  var origCancelRaf = window.cancelAnimationFrame;
  var origSetInterval = window.setInterval;
  var origClearInterval = window.clearInterval;

  // While frozen, rAF callbacks are dropped. Pages that re-arm rAF on every
  // frame (typical for animations) will simply stop ticking until thawed.
  function frozenRaf(_cb) { return 0; }
  function frozenCancelRaf(_id) { /* no-op */ }

  // While frozen, setInterval is replaced with a throttled version that
  // fires every 60s regardless of the requested delay. Most "keep alive"
  // pollers and UI tickers tolerate this. setTimeout is intentionally
  // untouched — it's mostly used for one-shot async work.
  var FROZEN_INTERVAL_MS = 60000;
  function frozenSetInterval(cb, _delay) {
    return origSetInterval.call(window, cb, FROZEN_INTERVAL_MS);
  }

  window.__boxbHibernationFreeze = function() {
    if (window.__boxbHibernationState === 'frozen') return;
    window.requestAnimationFrame = frozenRaf;
    window.cancelAnimationFrame = frozenCancelRaf;
    window.setInterval = frozenSetInterval;
    window.__boxbHibernationState = 'frozen';
  };

  window.__boxbHibernationThaw = function() {
    if (window.__boxbHibernationState !== 'frozen') return;
    window.requestAnimationFrame = origRaf;
    window.cancelAnimationFrame = origCancelRaf;
    window.setInterval = origSetInterval;
    window.clearInterval = origClearInterval;
    window.__boxbHibernationState = 'active';
  };

  // For contenteditable elements, only treat them as "drafts" if the element
  // or any ancestor declares role="textbox" or aria-multiline="true". This
  // distinguishes chat/compose inputs (WhatsApp's message bar, Gmail's
  // compose body, Slack/Discord — all wrap contenteditable in role="textbox"
  // for accessibility) from document-style editors (Notion, Google Docs)
  // where every block is contenteditable but the content IS the page's
  // persisted state, not an unsent draft. Without this filter, Notion would
  // never aggressive-hibernate because every block looks like unsent text.
  function isInTextboxRole(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (!n.getAttribute) continue;
      if (n.getAttribute('role') === 'textbox') return true;
      if (n.getAttribute('aria-multiline') === 'true') return true;
    }
    return false;
  }

  // An input/textarea is only a "draft" if the user has modified it from
  // the page's default. Many marketing pages pre-fill inputs (Notion's
  // pricing calculator pre-fills teamSize=10, etc.); those aren't drafts.
  function inputIsModified(el) {
    if (typeof el.value !== 'string') return false;
    if (el.value.trim().length === 0) return false;
    // defaultValue reflects what was in the HTML at parse time. If the
    // current value matches, the user hasn't typed.
    if (typeof el.defaultValue === 'string' && el.value === el.defaultValue) {
      return false;
    }
    return true;
  }

  window.__boxbHasUnsentText = function() {
    try {
      var inputs = document.querySelectorAll('input, textarea, [contenteditable=""], [contenteditable="true"]');
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (el.tagName === 'INPUT') {
          var t = (el.type || '').toLowerCase();
          if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'image' ||
              t === 'checkbox' || t === 'radio' || t === 'reset' || t === 'file' ||
              t === 'number' || t === 'range' || t === 'color' || t === 'date' ||
              t === 'datetime-local' || t === 'month' || t === 'time' || t === 'week') {
            // Numeric / picker inputs are basically never used for chat
            // drafts. Pre-filled marketing forms (Notion pricing calc) and
            // default date pickers would otherwise produce false positives.
            continue;
          }
          if (inputIsModified(el)) return true;
        } else if (el.tagName === 'TEXTAREA') {
          if (inputIsModified(el)) return true;
        } else {
          if (!isInTextboxRole(el)) continue;
          var text = (el.innerText || el.textContent || '');
          if (text.trim().length > 0) return true;
        }
      }
    } catch (e) {
      // If the scan throws (cross-origin frames, exotic DOM), fail safe by
      // reporting unsent text so we don't accidentally hibernate over a draft.
      return true;
    }
    return false;
  };
})();
`;

webFrame.executeJavaScript(hibernationSource).catch(() => {
  // Page may have been destroyed before injection. Safe to ignore.
});

// Main → page: route freeze/thaw signals into the page-world shim.
ipcRenderer.on(HIBERNATION_FREEZE, () => {
  webFrame
    .executeJavaScript('window.__boxbHibernationFreeze && window.__boxbHibernationFreeze();')
    .catch(() => {
      // page may have navigated; safe to ignore
    });
});
ipcRenderer.on(HIBERNATION_THAW, () => {
  webFrame
    .executeJavaScript('window.__boxbHibernationThaw && window.__boxbHibernationThaw();')
    .catch(() => {
      // page may have navigated; safe to ignore
    });
});
