import { ipcMain } from 'electron';
import Store from 'electron-store';
import type { OnboardingState } from '@shared/types';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';

// Phase 9.5: persisted onboarding state for an install. Lives in its own
// file (boxb-onboarding.json) so first-launch detection is independent of
// the services store and the managed-state file. Mirrors the managed-state
// pattern: main owns the file, renderer reads it via IPC on App mount.

interface StoreSchema {
  onboarding?: OnboardingState;
}

const DEFAULT: OnboardingState = {
  hasCompletedTutorial: false,
  lastCompletedAt: null
};

const store = new Store<StoreSchema>({ name: 'boxb-onboarding' });

export function loadOnboardingState(): OnboardingState {
  const saved = store.get('onboarding');
  if (!saved) return { ...DEFAULT };
  return {
    hasCompletedTutorial: Boolean(saved.hasCompletedTutorial),
    lastCompletedAt:
      typeof saved.lastCompletedAt === 'number' &&
      Number.isFinite(saved.lastCompletedAt)
        ? saved.lastCompletedAt
        : null
  };
}

export function saveOnboardingState(state: OnboardingState): void {
  store.set('onboarding', {
    hasCompletedTutorial: Boolean(state.hasCompletedTutorial),
    lastCompletedAt: state.lastCompletedAt
  });
}

export function registerOnboardingIpc(): void {
  ipcMain.handle(IPC.onboarding.getState, (): OnboardingState =>
    loadOnboardingState()
  );

  ipcMain.handle(IPC.onboarding.markComplete, (): OnboardingState => {
    const next: OnboardingState = {
      hasCompletedTutorial: true,
      lastCompletedAt: Date.now()
    };
    saveOnboardingState(next);
    dlog('ONBOARDING:mark-complete', next);
    return next;
  });

  // Dev/debug only — re-arms the first-launch auto-show. Not surfaced in the
  // UI; reachable via window.boxb.onboarding.reset() from DevTools.
  ipcMain.handle(IPC.onboarding.reset, (): OnboardingState => {
    const next: OnboardingState = { ...DEFAULT };
    saveOnboardingState(next);
    dlog('ONBOARDING:reset');
    return next;
  });
}
