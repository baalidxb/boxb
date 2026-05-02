import { create } from 'zustand';
import type { TerminalTab } from '@shared/types';

// Per-window terminal panel state. Lives in its own store so it doesn't
// touch the multi-window broadcast machinery in the services store —
// terminal state is independently per-window. Persistence is global
// (last-window-to-save wins) and is wired via window-state.ts in main;
// this store calls window.boxb.terminal.{get,set}PanelState directly,
// no zustand persist middleware involved.

export const TERMINAL_DEFAULT_HEIGHT = 300;
export const TERMINAL_MIN_HEIGHT = 150;
export const MAX_TERMINAL_TABS = 10;
const PANEL_STATE_DEBOUNCE_MS = 400;

// Caps the panel at a fraction of the parent so tabs/sidebar stay reachable.
export const TERMINAL_MAX_FRACTION = 0.8;

interface TerminalState {
  open: boolean;
  height: number;
  tabs: TerminalTab[];
  activeTabId: string | null;
  // Set true once we've fetched the persisted state from main; before then,
  // we don't auto-save (would clobber the persisted value with the default).
  hydrated: boolean;

  hydrate: () => Promise<void>;
  toggle: () => Promise<void>;
  open_: () => Promise<void>;
  close: () => void;
  addTab: () => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setHeight: (px: number) => void;
  cycleTab: (direction: 1 | -1) => void;
  // Called by TerminalTab when its pty exits (user typed `exit`, process
  // died, or kill IPC fired). Removes the tab and, if it was the last,
  // closes the panel.
  handleTabExited: (ptyId: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(snapshot: { open: boolean; height: number }): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.boxb.terminal.setPanelState(snapshot);
    } catch {
      // Persistence is best-effort; the panel still works without it.
    }
  }, PANEL_STATE_DEBOUNCE_MS);
}

async function spawnPty(): Promise<TerminalTab | null> {
  try {
    const result = await window.boxb.terminal.create({});
    if (!result.ok) {
      console.warn('[terminal] create failed:', result.error);
      return null;
    }
    return {
      id: crypto.randomUUID(),
      title: result.title,
      cwd: result.cwd,
      ptyId: result.ptyId,
      createdAt: Date.now()
    };
  } catch (err) {
    console.warn('[terminal] create threw:', err);
    return null;
  }
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  open: false,
  height: TERMINAL_DEFAULT_HEIGHT,
  tabs: [],
  activeTabId: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const persisted = await window.boxb.terminal.getPanelState();
      set({
        open: Boolean(persisted.open),
        height: Math.max(TERMINAL_MIN_HEIGHT, persisted.height || TERMINAL_DEFAULT_HEIGHT),
        hydrated: true
      });
    } catch {
      set({ hydrated: true });
    }
    // If persisted state says open, spawn the first tab now so the panel
    // isn't empty on the first paint.
    if (get().open && get().tabs.length === 0) {
      await get().addTab();
    }
  },

  toggle: async () => {
    if (get().open) {
      get().close();
    } else {
      await get().open_();
    }
  },

  open_: async () => {
    if (get().open) return;
    set({ open: true });
    schedulePersist({ open: true, height: get().height });
    if (get().tabs.length === 0) {
      await get().addTab();
    }
  },

  close: () => {
    if (!get().open) return;
    set({ open: false });
    schedulePersist({ open: false, height: get().height });
    // Keep tabs alive so reopening doesn't lose context within the session.
  },

  addTab: async () => {
    const state = get();
    if (state.tabs.length >= MAX_TERMINAL_TABS) {
      console.warn(`[terminal] tab cap (${MAX_TERMINAL_TABS}) reached`);
      return;
    }
    const tab = await spawnPty();
    if (!tab) return;
    set({
      tabs: [...get().tabs, tab],
      activeTabId: tab.id
    });
  },

  closeTab: (id) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    try {
      window.boxb.terminal.kill({ ptyId: tab.ptyId });
    } catch {
      // pty may already be dead; the renderer-side removal still proceeds.
    }
    const remaining = state.tabs.filter((t) => t.id !== id);
    let nextActiveId: string | null = state.activeTabId;
    if (state.activeTabId === id) {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const next = remaining[idx] ?? remaining[idx - 1] ?? remaining[0] ?? null;
      nextActiveId = next ? next.id : null;
    }
    set({ tabs: remaining, activeTabId: nextActiveId });
    if (remaining.length === 0 && state.open) {
      set({ open: false });
      schedulePersist({ open: false, height: get().height });
    }
  },

  handleTabExited: (ptyId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.ptyId === ptyId);
    if (!tab) return;
    // Reuse closeTab's bookkeeping but skip the kill IPC (pty is already gone).
    const remaining = state.tabs.filter((t) => t.id !== tab.id);
    let nextActiveId: string | null = state.activeTabId;
    if (state.activeTabId === tab.id) {
      const idx = state.tabs.findIndex((t) => t.id === tab.id);
      const next = remaining[idx] ?? remaining[idx - 1] ?? remaining[0] ?? null;
      nextActiveId = next ? next.id : null;
    }
    set({ tabs: remaining, activeTabId: nextActiveId });
    if (remaining.length === 0 && state.open) {
      set({ open: false });
      schedulePersist({ open: false, height: get().height });
    }
  },

  setActiveTab: (id) => {
    if (!get().tabs.some((t) => t.id === id)) return;
    set({ activeTabId: id });
  },

  setHeight: (px) => {
    const clamped = Math.max(TERMINAL_MIN_HEIGHT, Math.floor(px));
    set({ height: clamped });
    if (get().hydrated) {
      schedulePersist({ open: get().open, height: clamped });
    }
  },

  cycleTab: (direction) => {
    const state = get();
    if (state.tabs.length <= 1) return;
    const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
    if (idx < 0) return;
    const nextIdx = (idx + direction + state.tabs.length) % state.tabs.length;
    const next = state.tabs[nextIdx];
    if (next) set({ activeTabId: next.id });
  }
}));
