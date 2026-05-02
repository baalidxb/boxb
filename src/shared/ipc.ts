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
  toast: {
    // Main → toast renderer: append a toast to the visible stack.
    show: 'toast:show',
    // Toast renderer → main: user clicked a toast (id identifies which one).
    click: 'toast:click',
    // Toast renderer → main: toast finished its dismiss animation; main can
    // hide the window once the stack is empty.
    dismissed: 'toast:dismissed'
  },
  update: {
    // Toast renderer → main: user clicked "Restart now" on the update toast.
    // Main calls autoUpdater.quitAndInstall() (only in packaged builds).
    restartNow: 'update:restart-now',
    // Toast renderer → main: user clicked "Later". Main hides the toast;
    // electron-updater's autoInstallOnAppQuit handles install on natural quit.
    dismiss: 'update:dismiss'
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
  },
  terminal: {
    // Renderer → main: spawn a new pty owned by the sender's webContents.
    // Returns { ptyId, cwd, shell }. Main maps ptyId → owner wcId so a
    // window-close can target only its own ptys.
    create: 'terminal:create',
    // Renderer → main: write input bytes to a pty.
    write: 'terminal:write',
    // Renderer → main: resize a pty (cols/rows in characters).
    resize: 'terminal:resize',
    // Renderer → main: kill a pty (SIGINT, then SIGKILL after 1s).
    kill: 'terminal:kill',
    // Main → renderer: pty merged stdout/stderr. Sent only to the owning
    // webContents.
    data: 'terminal:data',
    // Main → renderer: pty exited (user typed `exit`, process died, or
    // kill IPC fired). Renderer should remove the tab.
    exit: 'terminal:exit',
    // Renderer → main: read persisted panel state (open/height) from
    // boxb-window.json. Returned at first window mount so the panel
    // restores to whatever the user had at last quit.
    getPanelState: 'terminal:get-panel-state',
    // Renderer → main: write persisted panel state. Debounced renderer-side.
    setPanelState: 'terminal:set-panel-state'
  }
});

export type IpcChannel = string;
