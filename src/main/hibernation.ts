import { ipcMain, webContents } from 'electron';
import type { WebContents } from 'electron';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';

const HIBERNATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TYPING_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds — scan cadence
const HAS_TEXT_TIMEOUT_MS = 500; // executeJavaScript guard for skip-if-typing

type HibernationMode = 'light' | 'aggressive';

// One Entry per (window, service) — i.e. per webview WebContents. Two
// windows showing the same service have two entries with the same partition
// and serviceId but different wcIds and hostWindowWcIds.
interface Entry {
  wcId: number;
  partition: string;
  serviceId: string;
  hibernation: HibernationMode;
  lastActiveAt: number;
  isActive: boolean;
  didFinishLoad: boolean;
  // True after we sent a 'freeze' to this webview. Reset on thaw / on
  // re-activation. Aggressive entries never set this — they get unmounted
  // entirely and their entry is removed via the 'destroyed' handler.
  lightFrozen: boolean;
  hostWindowWcId: number;
}

const entries = new Map<number, Entry>();
let scanTimer: NodeJS.Timeout | null = null;

function getById(wcId: number): WebContents | null {
  try {
    const wc = webContents.fromId(wcId);
    return wc && !wc.isDestroyed() ? wc : null;
  } catch {
    return null;
  }
}

function attachLifecycleHandlers(entry: Entry): void {
  const wc = getById(entry.wcId);
  if (!wc) return;
  wc.on('did-finish-load', () => {
    const e = entries.get(entry.wcId);
    if (!e) return;
    e.didFinishLoad = true;
  });
  wc.on('destroyed', () => {
    const removed = entries.delete(entry.wcId);
    if (removed) {
      dlog('HIBERNATION:webview-destroyed', {
        wcId: entry.wcId,
        serviceId: entry.serviceId
      });
    }
  });
}

interface RegisterPayload {
  wcId: number;
  partition: string;
  serviceId: string;
  hibernation: HibernationMode;
  isActive: boolean;
}

function register(payload: RegisterPayload, hostWindowWcId: number): void {
  const existing = entries.get(payload.wcId);
  if (existing) {
    // Re-register (e.g. dom-ready firing after the initial register):
    // refresh fields but keep lastActiveAt unless transitioning to active.
    existing.partition = payload.partition;
    existing.serviceId = payload.serviceId;
    existing.hibernation = payload.hibernation;
    existing.hostWindowWcId = hostWindowWcId;
    if (payload.isActive && !existing.isActive) {
      existing.lastActiveAt = Date.now();
    }
    existing.isActive = payload.isActive;
    return;
  }
  const wc = getById(payload.wcId);
  if (!wc) {
    dlog('HIBERNATION:register-skip-no-wc', payload);
    return;
  }
  const entry: Entry = {
    wcId: payload.wcId,
    partition: payload.partition,
    serviceId: payload.serviceId,
    hibernation: payload.hibernation,
    lastActiveAt: Date.now(),
    isActive: payload.isActive,
    didFinishLoad: false,
    lightFrozen: false,
    hostWindowWcId
  };
  entries.set(payload.wcId, entry);
  attachLifecycleHandlers(entry);
  // Belt-and-suspenders: explicitly mark background throttling on. Already
  // the Chromium default for non-active webviews, but harmless to set.
  try {
    wc.setBackgroundThrottling(true);
  } catch {
    // some platforms / states reject this; not load-bearing
  }
  dlog('HIBERNATION:register', {
    wcId: payload.wcId,
    partition: payload.partition,
    serviceId: payload.serviceId,
    hibernation: payload.hibernation,
    isActive: payload.isActive,
    hostWindowWcId
  });
}

function unregister(wcId: number): void {
  if (entries.delete(wcId)) {
    dlog('HIBERNATION:unregister', { wcId });
  }
}

function setActive(wcId: number, isActive: boolean): void {
  const e = entries.get(wcId);
  if (!e) return;
  if (isActive) {
    e.isActive = true;
    e.lastActiveAt = Date.now();
    // Auto-thaw if this webview was light-frozen. The user is activating
    // it again; restore timers/animations now so the page is fully
    // responsive the moment it becomes visible.
    if (e.lightFrozen) {
      const wc = getById(wcId);
      if (wc) {
        try {
          wc.send(IPC.hibernation.thaw);
        } catch {
          // best-effort
        }
      }
      e.lightFrozen = false;
      dlog('HIBERNATION:light-thaw', { wcId, serviceId: e.serviceId });
      dlog('HIBERNATION:wake', {
        wcId,
        serviceId: e.serviceId,
        mode: 'light'
      });
    }
  } else {
    e.isActive = false;
  }
}

async function hasUnsentText(wc: WebContents): Promise<boolean> {
  try {
    const promise = wc.executeJavaScript(
      'window.__boxbHasUnsentText && window.__boxbHasUnsentText() ? true : false',
      true
    ) as Promise<unknown>;
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), HAS_TEXT_TIMEOUT_MS);
    });
    const result = await Promise.race([promise, timeout]);
    return result === true;
  } catch {
    // Fail-safe: if we can't tell, assume the user is mid-typing and skip
    // this round. Better to delay hibernation than lose a draft.
    return true;
  }
}

async function scanOnce(): Promise<void> {
  const now = Date.now();
  const candidates: Entry[] = [];
  for (const e of entries.values()) {
    if (e.isActive) continue;
    if (!e.didFinishLoad) continue;
    if (e.lightFrozen) continue; // already light-hibernated
    if (now - e.lastActiveAt <= HIBERNATION_TIMEOUT_MS) continue;
    candidates.push(e);
  }
  dlog('HIBERNATION:check-cycle', {
    totalEntries: entries.size,
    candidates: candidates.length
  });
  if (candidates.length === 0) return;

  // Run skip-if-typing checks in parallel — each is bounded by the 500ms
  // executeJavaScript timeout, so worst case the whole scan is ~500ms even
  // with many candidates.
  const checks = await Promise.all(
    candidates.map(async (e) => {
      const wc = getById(e.wcId);
      if (!wc) return { entry: e, hasText: false, missing: true };
      const hasText = await hasUnsentText(wc);
      return { entry: e, hasText, missing: false };
    })
  );

  for (const { entry: e, hasText, missing } of checks) {
    if (missing) continue;
    if (hasText) {
      dlog('HIBERNATION:skipped-typing', {
        wcId: e.wcId,
        serviceId: e.serviceId,
        partition: e.partition,
        mode: e.hibernation
      });
      continue;
    }
    dlog('HIBERNATION:proceeding', {
      wcId: e.wcId,
      serviceId: e.serviceId,
      partition: e.partition,
      mode: e.hibernation
    });
    if (e.hibernation === 'light') {
      const wc = getById(e.wcId);
      if (!wc) continue;
      try {
        wc.send(IPC.hibernation.freeze);
      } catch {
        // best-effort
      }
      e.lightFrozen = true;
      dlog('HIBERNATION:light-freeze', {
        wcId: e.wcId,
        serviceId: e.serviceId,
        partition: e.partition
      });
    } else {
      // Aggressive: tell the host window's renderer to unmount this
      // service's webview. The renderer adds the service id to its
      // per-window hibernatedServiceIds set; ServiceWebView returns null;
      // the inner WebContents is destroyed; our 'destroyed' handler removes
      // the entry from this map. Entry will be re-registered when the user
      // re-activates and ServiceWebView re-mounts.
      const host = getById(e.hostWindowWcId);
      if (host) {
        try {
          host.send(IPC.hibernation.requestUnmount, { serviceId: e.serviceId });
        } catch {
          // best-effort
        }
        dlog('HIBERNATION:aggressive-unmount', {
          wcId: e.wcId,
          serviceId: e.serviceId,
          hostWcId: e.hostWindowWcId
        });
      }
    }
  }
}

export function initHibernation(): void {
  if (scanTimer) return;
  scanTimer = setInterval(() => {
    scanOnce().catch((err) =>
      dlog('HIBERNATION:scan-failed', { error: String(err) })
    );
  }, TYPING_CHECK_INTERVAL_MS);

  ipcMain.on(IPC.hibernation.register, (event, payloadRaw: unknown) => {
    if (!payloadRaw || typeof payloadRaw !== 'object') return;
    const p = payloadRaw as Record<string, unknown>;
    const wcId = Number(p['wcId']);
    if (!Number.isFinite(wcId)) return;
    const partition = typeof p['partition'] === 'string' ? p['partition'] : '';
    const serviceId = typeof p['serviceId'] === 'string' ? p['serviceId'] : '';
    if (!partition || !serviceId) return;
    const hibernation: HibernationMode =
      p['hibernation'] === 'light' ? 'light' : 'aggressive';
    const isActive = !!p['isActive'];
    register(
      { wcId, partition, serviceId, hibernation, isActive },
      event.sender.id
    );
  });

  ipcMain.on(IPC.hibernation.unregister, (_event, payloadRaw: unknown) => {
    if (!payloadRaw || typeof payloadRaw !== 'object') return;
    const p = payloadRaw as Record<string, unknown>;
    const wcId = Number(p['wcId']);
    if (Number.isFinite(wcId)) unregister(wcId);
  });

  ipcMain.on(IPC.hibernation.markActive, (_event, payloadRaw: unknown) => {
    if (!payloadRaw || typeof payloadRaw !== 'object') return;
    const p = payloadRaw as Record<string, unknown>;
    const wcId = Number(p['wcId']);
    if (!Number.isFinite(wcId)) return;
    setActive(wcId, !!p['isActive']);
  });

  dlog('HIBERNATION:init', {
    timeoutMs: HIBERNATION_TIMEOUT_MS,
    scanMs: TYPING_CHECK_INTERVAL_MS
  });
}

// BUG-2-DIAG: remove after v0.1.5 fix
export function getHibernationSnapshot(): Array<{
  serviceId: string;
  isActive: boolean;
  lightFrozen: boolean;
  idleSec: number;
}> {
  const now = Date.now();
  return Array.from(entries.values()).map((e) => ({
    serviceId: e.serviceId,
    isActive: e.isActive,
    lightFrozen: e.lightFrozen,
    idleSec: Math.round((now - e.lastActiveAt) / 1000)
  }));
}
