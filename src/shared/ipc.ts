export const IPC = Object.freeze({
  app: {
    version: 'app:version'
  },
  storage: {
    get: 'storage:get',
    set: 'storage:set',
    delete: 'storage:delete',
    getAll: 'storage:get-all',
    clear: 'storage:clear'
  },
  service: {
    cleanupPartition: 'service:cleanup-partition',
    registerPartition: 'service:register-partition',
    webviewPreloadPath: 'service:webview-preload-path',
    webviewNotificationClick: 'service:webview-notification-click',
    notificationClick: 'service:notification-click'
  },
  window: {
    openNew: 'window:open-new',
    broadcast: 'window:broadcast',
    applyBroadcast: 'window:apply-broadcast',
    forceClose: 'window:force-close'
  },
  hibernation: {
    // Renderer → main: report a webview's wcId + partition + service id +
    // hibernation mode + initial active state. The main-side tracker uses
    // these to drive the inactivity loop and target the right webContents
    // for freeze/thaw.
    register: 'hibernation:register',
    unregister: 'hibernation:unregister',
    // Renderer → main: flip a webview's active flag. When transitioning to
    // active, main bumps lastActiveAt and (if it was light-frozen) sends a
    // thaw to the webview's page world.
    markActive: 'hibernation:mark-active',
    // Main → webview: freeze/thaw signals consumed by webview-preload.
    freeze: 'hibernation:freeze',
    thaw: 'hibernation:thaw',
    // Main → host renderer: the inactivity tracker decided to aggressive-
    // hibernate this service in this window; renderer should unmount the
    // <webview> for that service id (per-window, not broadcast).
    requestUnmount: 'hibernation:request-unmount'
  }
});

export type IpcChannel = string;
