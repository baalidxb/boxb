import { app } from 'electron';
import Store from 'electron-store';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dlog } from './debug-log';

// v0.2.0 polish: sweep orphaned partition folders at startup.
//
// `cleanupPartition` (service removal) clears a session's storage and cache
// but cannot delete the folder itself — the Session object stays alive until
// app exit and Windows locks files under it. Result: %APPDATA%/boxb/
// Partitions/ accretes dead folders (27 observed from old test sessions).
//
// This sweep runs once per launch, BEFORE any webview mounts (no sessions
// open → no file locks), and deletes Partitions/* entries whose partition id
// no longer belongs to any persisted service.
//
// SAFETY RULE: if the services store cannot be read and parsed with
// certainty, delete NOTHING. A wrongly deleted partition is an unrecoverable
// logout (WhatsApp re-pairing etc.) — a leftover folder is just disk space.

interface PersistedService {
  partition?: unknown;
}

function readLivePartitionIds(): Set<string> | null {
  try {
    const store = new Store<Record<string, unknown>>({ name: 'boxb' });
    const raw = store.get('boxb-services');
    // zustand's createJSONStorage writes a JSON string; tolerate an object
    // in case the storage layer ever deserializes it.
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      parsed = JSON.parse(raw);
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const state = (parsed as { state?: { services?: unknown } }).state;
    if (!state || !Array.isArray(state.services)) return null;
    const ids = new Set<string>();
    for (const svc of state.services as PersistedService[]) {
      if (typeof svc?.partition === 'string' && svc.partition.startsWith('persist:')) {
        ids.add(svc.partition.slice('persist:'.length));
      }
    }
    return ids;
  } catch {
    return null;
  }
}

export async function sweepOrphanPartitions(): Promise<void> {
  try {
    const dir = join(app.getPath('userData'), 'Partitions');
    if (!existsSync(dir)) return;
    const live = readLivePartitionIds();
    if (live === null) {
      dlog('PARTITION-SWEEP:aborted-unreadable-services');
      return;
    }
    const entries = await readdir(dir, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Electron URI-encodes partition names for folder paths; UUIDs are
      // safe chars so this is usually a no-op, but decode defensively.
      let id = entry.name;
      try {
        id = decodeURIComponent(entry.name);
      } catch {
        // keep raw name
      }
      if (live.has(id) || live.has(entry.name)) continue;
      try {
        await rm(join(dir, entry.name), { recursive: true, force: true });
        removed++;
        dlog('PARTITION-SWEEP:removed', { folder: entry.name });
      } catch (err) {
        // Locked or permission issue — leave it; next launch retries.
        dlog('PARTITION-SWEEP:remove-failed', {
          folder: entry.name,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    dlog('PARTITION-SWEEP:done', {
      total: entries.length,
      live: live.size,
      removed
    });
  } catch (err) {
    dlog('PARTITION-SWEEP:error', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
