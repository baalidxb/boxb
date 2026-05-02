import Store from 'electron-store';
import type { ManagedState } from '@shared/types';

// Persisted managed-state for an install. Lives in its own file
// (boxb-managed.json) so the main process — including the tray menu
// builder — can read it without going through the renderer's storage
// adapter or parsing zustand-persisted JSON. Renderer mirrors this state
// into a Zustand store at App mount via the managed:get-state IPC.

interface StoreSchema {
  managed?: ManagedState;
}

const DEFAULT: ManagedState = {
  isManaged: false,
  configName: null,
  importedAt: null
};

const store = new Store<StoreSchema>({ name: 'boxb-managed' });

export function loadManagedState(): ManagedState {
  const saved = store.get('managed');
  if (!saved) return { ...DEFAULT };
  return {
    isManaged: Boolean(saved.isManaged),
    configName:
      typeof saved.configName === 'string' && saved.configName.length > 0
        ? saved.configName
        : null,
    importedAt:
      typeof saved.importedAt === 'number' && Number.isFinite(saved.importedAt)
        ? saved.importedAt
        : null
  };
}

export function saveManagedState(state: ManagedState): void {
  store.set('managed', {
    isManaged: Boolean(state.isManaged),
    configName: state.configName,
    importedAt: state.importedAt
  });
}
