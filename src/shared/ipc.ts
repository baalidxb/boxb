export const IPC = Object.freeze({
  app: {
    version: 'app:version',
    // Renderer → main: full process exit. Same effect as the tray
    // "Quit BoxB" item; sets lifecycle.isQuitting so close handlers
    // skip their hide-to-tray fallback. Used by the command bar's
    // quit action.
    quit: 'app:quit'
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
  },
  managed: {
    // Renderer → main: open native save dialog and write a .boxb-config
    // file containing the supplied snapshot. Returns { ok, path? } or
    // { ok: false, cancelled: true } when the user dismisses the dialog.
    export: 'managed:export',
    // Renderer → main: read persisted ManagedState from boxb-managed.json.
    // Renderer mirrors this into its store on App mount.
    getState: 'managed:get-state',
    // Renderer → main: write ManagedState (also rebuilds the tray menu so
    // the export item disappears once an install becomes managed).
    setState: 'managed:set-state',
    // Renderer → main: read the pending config detected at launch (from
    // --config CLI flag, argv[1] file association, or %APPDATA%/boxb/
    // configs/ drop folder). Returns parsed config or null if none.
    checkLaunchConfig: 'managed:check-launch-config',
    // Renderer → main: confirm the pending config was applied. Main moves
    // the source file to .applied/ so it doesn't re-prompt next launch.
    applyConfig: 'managed:apply-config',
    // Renderer → main: user dismissed the apply modal. Main clears the
    // in-memory pending config; the source file stays in the drop folder
    // so a subsequent launch re-prompts (admins can delete it manually).
    cancelConfig: 'managed:cancel-config',
    // Main → renderer: tray "Export Managed Config…" item was clicked;
    // renderer should open the export modal. Sent only to the primary
    // window — the modal is a per-window UI element.
    openExportModal: 'managed:open-export-modal'
  },
  ai: {
    // Renderer → main: write/read/clear the user's Anthropic API key.
    // Stored as plain text in boxb-ai.json — see ai-config.ts for the
    // documented limitation. Returns simple ok/booleans.
    setApiKey: 'ai:set-api-key',
    clearApiKey: 'ai:clear-api-key',
    hasApiKey: 'ai:has-api-key',
    // Renderer → main: ask the model to parse a natural-language query
    // into a CommandBarAction. Returns null on no-key/network/parse error
    // — UI falls back to "no match" silently.
    parseIntent: 'ai:parse-intent',
    // Main → renderer: tray "Set Anthropic API Key…" item was clicked;
    // renderer should open the SetApiKeyModal. Same primary-window-only
    // pattern as the managed-config export modal.
    openSetApiKeyModal: 'ai:open-set-api-key-modal'
  }
});

export type IpcChannel = string;
