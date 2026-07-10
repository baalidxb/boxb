import { create } from 'zustand';

// Phase 9.10: Context Bridge UI state. Per-window. The modal opens from a
// webview right-click ("Ask AI about selection" → main sends bridge:open)
// or Ctrl+Shift+K (empty — user pastes text).

export type BridgeActionId = 'summarize' | 'translate' | 'reply' | 'explain' | 'custom';

interface BridgeStore {
  open: boolean;
  sourceText: string;
  question: string;
  // The action whose result is currently shown (highlights its button).
  lastAction: BridgeActionId | null;
  result: string | null;
  loading: boolean;
  error: string | null;

  openWith: (text: string) => void;
  close: () => void;
  setSourceText: (text: string) => void;
  setQuestion: (q: string) => void;
  run: (action: BridgeActionId) => Promise<void>;
}

export const useBridgeStore = create<BridgeStore>()((set, get) => ({
  open: false,
  sourceText: '',
  question: '',
  lastAction: null,
  result: null,
  loading: false,
  error: null,

  openWith: (text) =>
    set({
      open: true,
      sourceText: text,
      question: '',
      lastAction: null,
      result: null,
      loading: false,
      error: null
    }),

  close: () =>
    set({
      open: false,
      sourceText: '',
      question: '',
      lastAction: null,
      result: null,
      loading: false,
      error: null
    }),

  setSourceText: (text) => set({ sourceText: text }),
  setQuestion: (q) => set({ question: q }),

  run: async (action) => {
    const state = get();
    if (state.loading) return;
    const text = state.sourceText.trim();
    if (!text) {
      set({ error: 'Paste or select some text first.', result: null });
      return;
    }
    if (action === 'custom' && !state.question.trim()) {
      set({ error: 'Type a question first.', result: null });
      return;
    }
    set({ loading: true, error: null, lastAction: action });
    try {
      const res = await window.boxb.bridge.run({
        action,
        text,
        ...(action === 'custom' ? { question: state.question.trim() } : {})
      });
      // Modal may have closed while the call was in flight.
      if (!get().open) return;
      if (res.ok && res.text) {
        set({ result: res.text, error: null });
      } else if (res.error === 'no-key') {
        set({
          result: null,
          error: 'Set your Anthropic API key first (tray menu → Set Anthropic API Key…).'
        });
      } else {
        set({ result: null, error: 'AI is unavailable right now. Try again.' });
      }
    } catch {
      if (get().open) {
        set({ result: null, error: 'AI is unavailable right now. Try again.' });
      }
    } finally {
      if (get().open) set({ loading: false });
    }
  }
}));
