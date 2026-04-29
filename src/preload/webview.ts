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
import { contextBridge, ipcRenderer, webFrame } from 'electron';

const WEBVIEW_NOTIFICATION_CLICK = 'service:webview-notification-click';

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
