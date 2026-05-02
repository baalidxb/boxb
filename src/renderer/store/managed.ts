import { create } from 'zustand';
import type { ManagedConfigFile, ManagedState } from '@shared/types';
import { useServicesStore, type Service } from './services';
import type { Workspace } from '@shared/types';

// Phase 9.1: managed-mode state for this install. Independent store from
// useServicesStore because it has a different lifecycle: managed state is
// read once from main on App mount (loadManagedState in main → IPC), and
// only changes when an Apply Config flow runs. No multi-window broadcast
// (single source of truth lives in boxb-managed.json on disk).

interface ManagedStore extends ManagedState {
  // True after we've fetched the persisted state from main. Until then
  // managed-aware UI (sidebar lock badge, topbar pill, hidden context items)
  // should NOT render the locked variant — otherwise admin installs would
  // briefly flash a lock badge between mount and IPC return.
  hydrated: boolean;

  hydrate: () => Promise<void>;
  // Wipe existing services + workspaces and rebuild from a managed config.
  // Used by ApplyManagedConfigModal when the user clicks Apply. Returns
  // the new active workspace id so caller can navigate to it.
  applyConfig: (config: ManagedConfigFile) => Promise<string>;
}

export const useManagedStore = create<ManagedStore>()((set, get) => ({
  isManaged: false,
  configName: null,
  importedAt: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const state = await window.boxb.managed.getState();
      set({
        isManaged: Boolean(state.isManaged),
        configName: state.configName ?? null,
        importedAt: state.importedAt ?? null,
        hydrated: true
      });
    } catch {
      set({ hydrated: true });
    }
  },

  applyConfig: async (config) => {
    // Remap workspace ids: config-local ids → fresh UUIDs. We also
    // preserve the order field so the sidebar pills land in the same
    // visual order the admin set.
    const wsIdRemap = new Map<string, string>();
    const newWorkspaces: Workspace[] = config.workspaces.map((w) => {
      const id = crypto.randomUUID();
      wsIdRemap.set(w.id, id);
      return {
        id,
        name: w.name,
        icon: w.icon,
        order: w.order,
        createdAt: Date.now()
      };
    });

    // Build Service objects with fresh UUIDs + partition strings so each
    // managed install has its own session storage (per-user logins, not
    // shared across the team).
    const now = Date.now();
    const newServices: Service[] = config.services
      .map((s, idx) => {
        const remappedWs = wsIdRemap.get(s.workspaceId);
        if (!remappedWs) return null; // skip orphans (validated in main, but defensive)
        const id = crypto.randomUUID();
        const built: Service = {
          id,
          catalogId: s.catalogId,
          name: s.name,
          defaultName: s.name,
          iconUrl: s.iconUrl,
          url: s.url,
          partition: `persist:${id}`,
          unreadCount: 0,
          isMuted: false,
          addedAt: now + idx, // preserve admin-set order via stable addedAt
          workspaceId: remappedWs,
          hibernation: s.hibernation
        };
        if (s.userAgent) built.userAgent = s.userAgent;
        return built;
      })
      .filter((s): s is Service => s !== null);

    // Pick the first workspace by order as the active one.
    const sorted = [...newWorkspaces].sort((a, b) => a.order - b.order);
    const firstWs = sorted[0];
    const activeWorkspaceId = firstWs ? firstWs.id : '';

    // Wipe + replace services store. Also reset per-window selections and
    // drop hibernation tracking — partition strings just changed.
    useServicesStore.setState({
      services: newServices,
      workspaces: newWorkspaces,
      activeWorkspaceId,
      activeServiceId: null,
      hibernatedServiceIds: new Set<string>()
    });

    // Persist managed flags through main so the tray and next-launch
    // hydrate see the new status.
    const next: ManagedState = {
      isManaged: true,
      configName: config.name,
      importedAt: now
    };
    try {
      await window.boxb.managed.setState(next);
    } catch {
      // Persistence failure is non-fatal for the in-memory state — but the
      // user will see "managed" mode reset on next launch. Acceptable for v1.
    }
    set({ ...next, hydrated: true });

    return activeWorkspaceId;
  }
}));
