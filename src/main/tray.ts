import { app, BrowserWindow, Menu, Tray, clipboard, nativeImage, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { platform, release } from 'node:os';
import { lifecycle } from './lifecycle';
import { getAllWindows } from './windows';
import { loadManagedState } from './managed-state';
import { hasApiKey, clearApiKey } from './ai-config';
import { showToast } from './in-app-toast';
import { dlog } from './debug-log';

const __dirname = dirname(fileURLToPath(import.meta.url));

let trayInstance: Tray | null = null;
// Stash the resolver so rebuildTrayMenu (called when managed state flips
// mid-session) can still reach the primary window for window actions.
let getPrimaryWindow: (() => BrowserWindow | null) | null = null;
// Renderer-supplied callback that opens the export modal in-app. Wired by
// registerManagedIpc / index.ts at startup. Keeping this as a setter lets
// the import graph stay tray.ts → managed-state, NOT tray.ts → managed-config.
let openExportModalFn: (() => void) | null = null;
export function setOpenExportModal(fn: () => void): void {
  openExportModalFn = fn;
}
// Same pattern for the Phase 9.2 "Set Anthropic API Key…" item.
let openSetApiKeyModalFn: (() => void) | null = null;
export function setOpenSetApiKeyModal(fn: () => void): void {
  openSetApiKeyModalFn = fn;
}

function resolveTrayIconPath(): string {
  // out/main/index.js → ../../resources/tray/tray-32.png
  const fromBuilt = join(__dirname, '..', '..', 'resources', 'tray', 'tray-32.png');
  return fromBuilt;
}

// Phase 9.3: pre-written share text. Single source of truth so both the
// tray click handler and any future "share from sidebar" use the same copy.
const SHARE_TEXT =
  'Found a clean way to manage all my work tools in one app — messengers, dev tools, AI assistants, all in one place. Check out BoxB: https://boxb.app';

function buildFeedbackMailto(): string {
  const version = app.getVersion();
  const subject = `BoxB Feedback — v${version}`;
  const body = [
    'Hey BoxB team,',
    '',
    '',
    '',
    '---',
    'System info (helps us debug):',
    `- BoxB version: ${version}`,
    `- OS: ${platform()} ${release()}`,
    `- Date: ${new Date().toISOString()}`
  ].join('\n');
  // encodeURIComponent on each piece — handles newlines (\n → %0A),
  // ampersands, em-dashes, etc. Concat into the mailto.
  return `mailto:feedback@boxb.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function handleShareClick(): void {
  try {
    clipboard.writeText(SHARE_TEXT);
  } catch (err) {
    dlog('TRAY:share-clipboard-err', {
      error: err instanceof Error ? err.message : String(err)
    });
    // Fail-soft toast so the user knows the click registered but didn't
    // produce a clipboard write. Same toast type, different copy.
    try {
      showToast({
        id: `share-err-${Date.now()}`,
        title: 'Could not copy',
        body: 'Clipboard write failed. Try again.',
        onClick: (): void => {
          // no-op — toast just dismisses
        }
      });
    } catch {
      // toast system unavailable too — give up silently
    }
    return;
  }
  try {
    showToast({
      id: `share-${Date.now()}`,
      title: 'Copied to clipboard',
      body: 'Paste anywhere to share BoxB ✨',
      onClick: (): void => {
        // no-op — confirmation toast just dismisses on click
      }
    });
  } catch (err) {
    // Clipboard write succeeded; toast failure is cosmetic only.
    dlog('TRAY:share-toast-err', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

function handleFeedbackClick(): void {
  const mailto = buildFeedbackMailto();
  shell
    .openExternal(mailto)
    .catch((err: unknown) => {
      // Most likely cause: no default email client registered. Show a
      // toast pointing the user at the address directly so they can
      // still reach us.
      dlog('TRAY:feedback-open-err', {
        error: err instanceof Error ? err.message : String(err)
      });
      try {
        showToast({
          id: `feedback-err-${Date.now()}`,
          title: 'No email client found',
          body: 'Email feedback@boxb.app directly.',
          onClick: (): void => {
            // no-op
          }
        });
      } catch {
        // toast system unavailable — silent fail
      }
    });
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

function buildMenuTemplate(): MenuItemConstructorOptions[] {
  const getPrimary = getPrimaryWindow ?? ((): BrowserWindow | null => null);
  const managed = loadManagedState();
  const items: MenuItemConstructorOptions[] = [];

  // Managed install gets a non-clickable header at the very top of the
  // menu so users always have a visual anchor for "this BoxB is locked
  // and named X".
  if (managed.isManaged && managed.configName) {
    items.push({
      label: `${managed.configName} (managed)`,
      enabled: false
    });
    items.push({ type: 'separator' });
  }

  items.push({
    label: 'Show BoxB',
    click: () => showAllWindows(getPrimary)
  });
  items.push({
    label: 'Settings',
    click: () => {
      // Phase 5: open settings window/panel.
      console.log('[tray] settings clicked — Phase 5');
    }
  });

  // Export only makes sense on an admin install — a managed user can't
  // re-export their own locked config (and shouldn't be able to).
  if (!managed.isManaged) {
    items.push({ type: 'separator' });
    items.push({
      label: 'Export Managed Config…',
      click: () => {
        // Bring a window to the foreground first so the modal isn't shown
        // behind a hidden BoxB. Then ask the renderer to open the modal.
        showAllWindows(getPrimary);
        openExportModalFn?.();
      }
    });
    // Phase 9.2 AI key management. Hidden in managed mode — admins
    // shouldn't push their own AI keys to team members; managed installs
    // either get a key provisioned via deployment or go without AI.
    items.push({
      label: hasApiKey() ? 'Anthropic API Key (set)…' : 'Set Anthropic API Key…',
      click: () => {
        showAllWindows(getPrimary);
        openSetApiKeyModalFn?.();
      }
    });
    if (hasApiKey()) {
      items.push({
        label: 'Clear stored API key',
        click: () => {
          clearApiKey();
          rebuildTrayMenu();
        }
      });
    }
  }

  // Phase 9.3: share + feedback. Visible in BOTH standard and managed
  // modes — managed users may want to share BoxB with colleagues, and
  // sending feedback is especially important for them since they can't
  // reach the admin's tooling.
  items.push({ type: 'separator' });
  items.push({
    label: 'Share BoxB',
    click: handleShareClick
  });
  items.push({
    label: 'Send Feedback',
    click: handleFeedbackClick
  });

  items.push({ type: 'separator' });
  items.push({
    label: 'Quit BoxB',
    click: () => {
      lifecycle.isQuitting = true;
      app.quit();
    }
  });

  return items;
}

export function rebuildTrayMenu(): void {
  if (!trayInstance) return;
  trayInstance.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

export function createTray(getWindow: () => BrowserWindow | null): Tray | null {
  getPrimaryWindow = getWindow;
  try {
    const image = nativeImage.createFromPath(resolveTrayIconPath());
    const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip('BoxB');
    tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
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
