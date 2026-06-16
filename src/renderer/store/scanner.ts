import { create } from 'zustand';
import type { ProtectedRepo, ScanReport } from '@shared/types';

// Phase 9.6: secret-scanner UI state. Per-window. The protected-repo list is
// the single source of truth in main (boxb-scanner.json); this store mirrors
// it after hydrate() and keeps the panel/scan UI state.

// Informational notices (e.g. "hook preserved") auto-dismiss after a few
// seconds so the toolbar doesn't accrue stale messages. Module-scoped so a
// new notice cancels the previous one's pending clear.
const NOTICE_TTL_MS = 7000;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

interface ScannerStore {
  hydrated: boolean;
  repos: ProtectedRepo[];

  // Security panel visibility (toggled from the sidebar shield button).
  panelOpen: boolean;

  // Scan progress. scanningRepoId narrows the spinner to one row; the most
  // recent report is kept so the panel can render its findings.
  scanningRepoId: string | null;
  lastScanReport: ScanReport | null;
  // Surfaces add-repo validation failures (e.g. not a git repo) inline (red).
  addError: string | null;
  // Neutral informational message (muted) — e.g. "kept your custom hook".
  notice: string | null;
  // Set when addRepo reported a foreign pre-commit hook; drives the
  // ReplaceHookConfirmModal. Holds the picked folder path for the confirm
  // step. Null when no conflict is pending.
  pendingConflictPath: string | null;

  hydrate: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  // Opens the native folder picker, validates + (if no hook conflict) adds
  // the repo. On a foreign-hook conflict it sets pendingConflictPath instead
  // of adding. Returns an error string on failure, else null.
  pickAndAddRepo: () => Promise<string | null>;
  // Second step after the user confirms replacing a foreign hook.
  confirmReplaceHook: () => Promise<void>;
  cancelReplaceHook: () => void;
  removeRepo: (id: string) => Promise<void>;
  scanRepo: (id: string) => Promise<void>;
  clearMessages: () => void;
}

export const useScannerStore = create<ScannerStore>()((set, get) => ({
  hydrated: false,
  repos: [],
  panelOpen: false,
  scanningRepoId: null,
  lastScanReport: null,
  addError: null,
  notice: null,
  pendingConflictPath: null,

  hydrate: async () => {
    try {
      const repos = await window.boxb.scanner.listRepos();
      set({ repos: Array.isArray(repos) ? repos : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  pickAndAddRepo: async () => {
    set({ addError: null, notice: null });
    let path: string | null = null;
    try {
      path = await window.boxb.scanner.pickFolder();
    } catch {
      const msg = 'Could not open the folder picker.';
      set({ addError: msg });
      return msg;
    }
    if (!path) return null; // user cancelled — not an error
    try {
      const result = await window.boxb.scanner.addRepo(path);
      // Foreign hook detected — hold the path and let the UI confirm replace.
      if (result.needsConfirm) {
        set({ pendingConflictPath: path });
        return null;
      }
      if (!result.ok) {
        const msg = result.error ?? 'Failed to add repository.';
        set({ addError: msg });
        return msg;
      }
      // Re-list from main so the store reflects the canonical (deduped) set.
      const repos = await window.boxb.scanner.listRepos();
      set({ repos: Array.isArray(repos) ? repos : [] });
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ addError: msg });
      return msg;
    }
  },

  confirmReplaceHook: async () => {
    const path = get().pendingConflictPath;
    if (!path) return;
    set({ pendingConflictPath: null, addError: null });
    try {
      const result = await window.boxb.scanner.confirmAddRepo(path);
      if (!result.ok) {
        set({ addError: result.error ?? 'Failed to add repository.' });
        return;
      }
      const repos = await window.boxb.scanner.listRepos();
      set({
        repos: Array.isArray(repos) ? repos : [],
        notice: 'Existing hook backed up to pre-commit.boxb-backup.'
      });
    } catch (err) {
      set({ addError: err instanceof Error ? err.message : String(err) });
    }
  },

  cancelReplaceHook: () => {
    set({
      pendingConflictPath: null,
      addError: 'Repo not added — your existing pre-commit hook was kept.'
    });
  },

  removeRepo: async (id) => {
    let result: { removed: boolean; restored: boolean; foreign: boolean } = {
      removed: false,
      restored: false,
      foreign: false
    };
    try {
      result = await window.boxb.scanner.removeRepo(id);
    } catch {
      // best effort — re-list below reflects whatever main persisted
    }
    const repos = await window.boxb.scanner.listRepos();
    // Translate the hook outcome into a one-line user notice.
    let notice: string | null = null;
    if (result.foreign) {
      // The user edited the hook after we installed it (no marker), so we
      // left it in place — tell them where it is and that cleanup is on them.
      notice =
        'Hook was modified after install — preserved as-is in .git/hooks/pre-commit. Remove manually if you no longer need it.';
    } else if (result.restored) {
      notice = 'Removed. Your previous pre-commit hook was restored.';
    }
    set((s) => ({
      repos: Array.isArray(repos) ? repos : [],
      notice,
      addError: null,
      // Drop a stale report belonging to the removed repo.
      lastScanReport:
        s.lastScanReport && !repos.some((r) => r.path === s.lastScanReport?.repo)
          ? null
          : s.lastScanReport
    }));
    if (notice) {
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        // Only clear if this exact notice is still showing — a newer notice
        // or an error must not be wiped out by a stale timer.
        if (get().notice === notice) set({ notice: null });
        noticeTimer = null;
      }, NOTICE_TTL_MS);
    }
  },

  scanRepo: async (id) => {
    if (get().scanningRepoId) return; // one scan at a time
    set({ scanningRepoId: id, lastScanReport: null });
    try {
      const report = await window.boxb.scanner.scanRepo(id);
      set({ lastScanReport: report ?? null });
    } catch {
      set({ lastScanReport: null });
    } finally {
      set({ scanningRepoId: null });
      // Refresh repos so the updated lastScanAt shows in the list.
      try {
        const repos = await window.boxb.scanner.listRepos();
        set({ repos: Array.isArray(repos) ? repos : [] });
      } catch {
        // keep existing list
      }
    }
  },

  clearMessages: () => {
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    set({ addError: null, notice: null });
  }
}));
