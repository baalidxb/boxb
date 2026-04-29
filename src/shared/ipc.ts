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
  }
});

export type IpcChannel = string;
