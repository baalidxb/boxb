import { create } from 'zustand';

// Phase 9.5: onboarding tutorial + help state. Per-window (not broadcast):
// each window decides locally whether to auto-show the tour, and the help
// modal is a per-window UI element. The persisted completion flag lives in
// boxb-onboarding.json (main); this store mirrors it after hydrate().

// Total number of tutorial steps. The step index is 0-based; the last step
// (TOTAL_STEPS - 1) shows "Done" instead of "Next".
export const TOTAL_STEPS = 4;

export type HelpTab = 'tour' | 'shortcuts';

interface OnboardingStore {
  // Persisted-state mirror.
  hydrated: boolean;
  hasCompletedTutorial: boolean;
  lastCompletedAt: number | null;

  // Tutorial overlay state.
  tutorialOpen: boolean;
  step: number; // 0-based

  // Help modal state.
  helpOpen: boolean;
  helpTab: HelpTab;

  hydrate: () => Promise<void>;
  // Open the tour at step 0. Used by both first-launch auto-show and the
  // help modal's "Replay tutorial" button.
  startTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  // Close the tour and persist completion (markComplete in main). Fired by
  // both "Done" and "Skip Tutorial" — a skip still counts as "seen".
  finishTutorial: () => Promise<void>;

  openHelp: (tab?: HelpTab) => void;
  closeHelp: () => void;
  setHelpTab: (tab: HelpTab) => void;
}

export const useOnboardingStore = create<OnboardingStore>()((set, get) => ({
  hydrated: false,
  hasCompletedTutorial: false,
  lastCompletedAt: null,

  tutorialOpen: false,
  step: 0,

  helpOpen: false,
  helpTab: 'tour',

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const state = await window.boxb.onboarding.getState();
      set({
        hasCompletedTutorial: Boolean(state.hasCompletedTutorial),
        lastCompletedAt: state.lastCompletedAt ?? null,
        hydrated: true
      });
    } catch {
      // On failure treat as "not completed" but mark hydrated so the auto-
      // show logic can run. Worst case the tour shows once more than needed.
      set({ hydrated: true });
    }
  },

  startTutorial: () => {
    // Opening the tour from the help modal should close that modal so the
    // overlay isn't competing with it for the screen.
    set({ tutorialOpen: true, step: 0, helpOpen: false });
  },

  nextStep: () => {
    const next = Math.min(get().step + 1, TOTAL_STEPS - 1);
    set({ step: next });
  },

  prevStep: () => {
    const prev = Math.max(get().step - 1, 0);
    set({ step: prev });
  },

  finishTutorial: async () => {
    set({ tutorialOpen: false, step: 0 });
    try {
      const state = await window.boxb.onboarding.markComplete();
      set({
        hasCompletedTutorial: Boolean(state.hasCompletedTutorial),
        lastCompletedAt: state.lastCompletedAt ?? null
      });
    } catch {
      // Persisting failed — flip the in-memory flag anyway so we don't loop
      // the tour within this session. Next launch may re-show it.
      set({ hasCompletedTutorial: true });
    }
  },

  openHelp: (tab) => set({ helpOpen: true, ...(tab ? { helpTab: tab } : {}) }),
  closeHelp: () => set({ helpOpen: false }),
  setHelpTab: (tab) => set({ helpTab: tab })
}));
