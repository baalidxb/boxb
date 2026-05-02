import { create } from 'zustand';
import type { CommandBarAction } from '@shared/types';
import { useServicesStore } from './services';
import { useManagedStore } from './managed';
import { parseQuery, defaultSuggestions, type RuleContext } from '../utils/commandBarRules';
import { catalog } from '../../catalog/apps';

// Phase 9.2: command bar state. Per-window (not broadcast). Hydrate on
// mount fetches the AI-key flag from main once so the empty-state hint
// can say "Press Enter to ask AI." vs "Try: 'open WhatsApp'" without
// another roundtrip per render.

interface CommandBarStore {
  open: boolean;
  query: string;
  results: CommandBarAction[];
  selectedIndex: number;
  // True while waiting on the Anthropic IPC. UI shows a small spinner
  // and disables Enter so we don't double-fire.
  isAIQuerying: boolean;
  // True when boxb-ai.json has a non-empty key. Set on mount via
  // hydrate(); also flipped manually after the SetApiKeyModal saves.
  aiAvailable: boolean;
  // After an AI call returns an action, we flip showing it as the only
  // result. After an AI call returns null, we set this so the UI can
  // show "AI couldn't match either".
  aiAttempted: boolean;

  hydrate: () => Promise<void>;
  setAiAvailable: (v: boolean) => void;
  open_: () => void;
  close: () => void;
  setQuery: (q: string) => void;
  setSelectedIndex: (i: number) => void;
  moveSelection: (delta: 1 | -1) => void;
  // Triggers the AI fallback. No-op if rules already returned results,
  // if no key, or if a query is empty. Updates results in place.
  askAI: () => Promise<void>;
}

function buildContext(): RuleContext {
  // Phase 9.2.1: command bar searches the FULL phonebook — every service
  // across every workspace, plus the catalog (minus dedup-by-catalogId
  // which the rules apply). Locked windows + managed installs add their
  // own gating inside the rules.
  const svcState = useServicesStore.getState();
  const services = [...svcState.services];
  const workspaces = [...svcState.workspaces].sort((a, b) => a.order - b.order);
  const isManaged = useManagedStore.getState().isManaged;
  const isLocked = svcState.lockedWorkspaceId !== null;
  return {
    services,
    workspaces,
    catalog,
    isManaged,
    isLocked,
    activeWorkspaceId: svcState.activeWorkspaceId
  };
}

export const useCommandBarStore = create<CommandBarStore>()((set, get) => ({
  open: false,
  query: '',
  results: [],
  selectedIndex: 0,
  isAIQuerying: false,
  aiAvailable: false,
  aiAttempted: false,

  hydrate: async () => {
    try {
      const has = await window.boxb.ai.hasApiKey();
      set({ aiAvailable: Boolean(has) });
    } catch {
      // Treat as no-key on failure — UX falls back to "no match" hint.
    }
  },

  setAiAvailable: (v) => set({ aiAvailable: v }),

  open_: () => {
    if (get().open) return;
    const ctx = buildContext();
    set({
      open: true,
      query: '',
      results: defaultSuggestions(ctx),
      selectedIndex: 0,
      isAIQuerying: false,
      aiAttempted: false
    });
  },

  close: () => {
    if (!get().open) return;
    set({
      open: false,
      query: '',
      results: [],
      selectedIndex: 0,
      isAIQuerying: false,
      aiAttempted: false
    });
  },

  setQuery: (q) => {
    const ctx = buildContext();
    const results = parseQuery(q, ctx);
    set({
      query: q,
      results,
      selectedIndex: 0,
      // Clear the AI-attempted flag whenever the user types — fresh query
      // gets a fresh shot at rules before AI is offered again.
      aiAttempted: false
    });
  },

  setSelectedIndex: (i) => {
    const max = Math.max(0, get().results.length - 1);
    set({ selectedIndex: Math.min(Math.max(0, i), max) });
  },

  moveSelection: (delta) => {
    const len = get().results.length;
    if (len === 0) return;
    const cur = get().selectedIndex;
    const next = (cur + delta + len) % len;
    set({ selectedIndex: next });
  },

  askAI: async () => {
    const state = get();
    if (state.isAIQuerying) return;
    if (!state.aiAvailable) return;
    const q = state.query.trim();
    if (!q) return;
    set({ isAIQuerying: true });
    const ctx = buildContext();
    try {
      const result = (await window.boxb.ai.parseIntent({
        query: q,
        services: ctx.services.map((s) => ({
          id: s.id,
          name: s.name,
          catalogId: s.catalogId,
          workspaceId: s.workspaceId
        })),
        workspaces: ctx.workspaces.map((w) => ({ id: w.id, name: w.name })),
        isManaged: ctx.isManaged
      })) as CommandBarAction | null;
      if (result) {
        set({
          results: [result],
          selectedIndex: 0,
          isAIQuerying: false,
          aiAttempted: true
        });
      } else {
        set({ isAIQuerying: false, aiAttempted: true });
      }
    } catch {
      set({ isAIQuerying: false, aiAttempted: true });
    }
  }
}));
