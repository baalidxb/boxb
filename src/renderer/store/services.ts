import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ipcStorage } from './storage';
import type { Workspace } from '@shared/types';

// Multi-window state sync. Each renderer broadcasts the GLOBAL slice
// (workspaces, services) after every global mutation. Other windows apply
// the snapshot via applyBroadcastSnapshot under a re-entry guard so the
// applied set doesn't echo back. Per-window state (activeWorkspaceId,
// activeServiceId, modal flags) does NOT broadcast.
let isApplyingBroadcast = false;

interface GlobalSnapshot {
  workspaces: Workspace[];
  services: Service[];
}

function broadcastGlobals(snapshot: GlobalSnapshot): void {
  if (isApplyingBroadcast) return;
  if (typeof window === 'undefined') return;
  const api = window.boxb?.window;
  if (!api?.broadcast) return;
  try {
    api.broadcast(snapshot);
  } catch {
    // best effort; broadcast is not load-bearing for correctness in a
    // single-window session.
  }
}

// Renderer-side dedupe of registerPartition IPCs. Both addService (fired
// when a tile is created via the modal) and ServiceWebView's dom-ready
// handler (fired when the page reaches DOM-ready, including for persisted
// services on cold start) call this. First-wins; subsequent calls for the
// same partition are no-ops.
const registeredPartitions = new Set<string>();
export function registerPartitionOnce(partition: string): void {
  if (!partition) return;
  if (registeredPartitions.has(partition)) return;
  registeredPartitions.add(partition);
  try {
    window.boxb.service.registerPartition(partition);
  } catch {
    registeredPartitions.delete(partition);
  }
}

export interface Service {
  id: string;
  catalogId: string;
  // Display name. Per-instance — user can rename via the rename modal.
  name: string;
  // The original name from the catalog (or the user's typed name for
  // custom services). Used to revert when the user clears the rename
  // field. Stable across the service's lifetime.
  defaultName: string;
  iconUrl: string;
  url: string;
  partition: string;
  userAgent?: string;
  unreadCount: number;
  isMuted: boolean;
  addedAt: number;
  workspaceId: string;
}

type NewServiceInput = Omit<
  Service,
  'id' | 'partition' | 'unreadCount' | 'isMuted' | 'addedAt' | 'workspaceId' | 'defaultName'
>;

interface ContextMenuTarget {
  serviceId: string;
  x: number;
  y: number;
}

interface WorkspaceContextMenuTarget {
  workspaceId: string;
  x: number;
  y: number;
}

export const MAX_WORKSPACES = 10;
export const WORKSPACE_NAME_RE = /^[A-Za-z0-9]{1,10}$/;
export const WORKSPACE_ICON_RE = /^[A-Za-z0-9]$/;

export function isValidWorkspaceName(s: string): boolean {
  return WORKSPACE_NAME_RE.test(s);
}

export function isValidWorkspaceIcon(s: string): boolean {
  return s === '' || WORKSPACE_ICON_RE.test(s);
}

export function workspaceDisplayChar(w: Workspace): string {
  if (w.icon) return w.icon;
  return w.name.charAt(0).toUpperCase();
}

export const SERVICE_NAME_MAX = 30;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

// Service rename validation. Permissive: allow letters, numbers, spaces,
// punctuation, and most Unicode (so users can label tiles with emoji,
// non-ASCII names, etc.). Rejects control characters (tab, newline, etc.)
// and overlong strings. Empty input is valid in the modal — saving empty
// resets the tile name to its catalog/creation default.
export function isValidServiceName(s: string): boolean {
  if (CONTROL_CHAR_RE.test(s)) return false;
  if (s.trim().length > SERVICE_NAME_MAX) return false;
  return true;
}

interface ServicesState {
  services: Service[];
  activeServiceId: string | null;
  isAddModalOpen: boolean;
  contextMenu: ContextMenuTarget | null;
  confirmRemoveFor: string | null;
  renameServiceFor: string | null;

  workspaces: Workspace[];
  activeWorkspaceId: string;
  // Per-window lock. If non-null, this window is sealed to that workspace:
  // workspace pills are hidden, switching is rejected, and if the workspace
  // is deleted we force-close the window. Set ONCE on mount via
  // initLockedWorkspace from the main-process additionalArguments. Never
  // broadcast, never persisted.
  lockedWorkspaceId: string | null;
  isAddWorkspaceModalOpen: boolean;
  renameWorkspaceFor: string | null;
  confirmDeleteWorkspaceFor: string | null;
  workspaceContextMenu: WorkspaceContextMenuTarget | null;

  addService: (svc: NewServiceInput) => string;
  removeService: (id: string) => void;
  renameService: (id: string, name: string) => void;
  setActiveService: (id: string | null) => void;
  reorderServices: (fromIndex: number, toIndex: number) => void;
  setUnreadCount: (id: string, count: number) => void;
  openAddModal: () => void;
  closeAddModal: () => void;
  openContextMenu: (serviceId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  requestRemove: (serviceId: string) => void;
  cancelRemove: () => void;
  confirmRemove: () => Promise<void>;
  openRenameService: (serviceId: string) => void;
  closeRenameService: () => void;

  addWorkspace: (name: string, icon?: string) => string;
  renameWorkspace: (id: string, name: string, icon?: string) => void;
  deleteWorkspace: (id: string) => void;
  reorderWorkspaces: (orderedIds: string[]) => void;
  setActiveWorkspace: (id: string) => void;
  moveServiceToWorkspace: (serviceId: string, workspaceId: string) => void;
  cycleWorkspace: (direction: 1 | -1) => void;
  initLockedWorkspace: (id: string) => void;

  openAddWorkspaceModal: () => void;
  closeAddWorkspaceModal: () => void;
  openRenameWorkspace: (id: string) => void;
  closeRenameWorkspace: () => void;
  requestDeleteWorkspace: (id: string) => void;
  cancelDeleteWorkspace: () => void;
  confirmDeleteWorkspace: () => void;
  openWorkspaceContextMenu: (workspaceId: string, x: number, y: number) => void;
  closeWorkspaceContextMenu: () => void;
}

function nextWorkspaceOrder(workspaces: Workspace[]): number {
  if (workspaces.length === 0) return 0;
  return Math.max(...workspaces.map((w) => w.order)) + 1;
}

function sortedByOrder(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => a.order - b.order);
}

export const useServicesStore = create<ServicesState>()(
  persist(
    (set, get) => ({
      services: [],
      activeServiceId: null,
      isAddModalOpen: false,
      contextMenu: null,
      confirmRemoveFor: null,
      renameServiceFor: null,

      workspaces: [],
      activeWorkspaceId: '',
      lockedWorkspaceId: null,
      isAddWorkspaceModalOpen: false,
      renameWorkspaceFor: null,
      confirmDeleteWorkspaceFor: null,
      workspaceContextMenu: null,

      addService: (svc) => {
        const id = crypto.randomUUID();
        const next: Service = {
          ...svc,
          id,
          // Snapshot the catalog/creation name so the rename modal can
          // revert when the user clears the field.
          defaultName: svc.name,
          partition: `persist:${id}`,
          unreadCount: 0,
          isMuted: false,
          addedAt: Date.now(),
          workspaceId: get().activeWorkspaceId
        };
        set((state) => ({ services: [...state.services, next] }));
        // Pre-register the partition with main so the permission handler is
        // attached before the webview attaches. Deduped via the module-level
        // Set so dom-ready won't re-fire it.
        registerPartitionOnce(next.partition);
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
        return id;
      },

      removeService: (id) => {
        set((state) => ({
          services: state.services.filter((s) => s.id !== id),
          activeServiceId: state.activeServiceId === id ? null : state.activeServiceId
        }));
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      setActiveService: (id) => set({ activeServiceId: id }),

      reorderServices: (fromIndex, toIndex) => {
        let changed = false;
        set((state) => {
          if (fromIndex === toIndex) return state;
          if (fromIndex < 0 || fromIndex >= state.services.length) return state;
          if (toIndex < 0 || toIndex >= state.services.length) return state;
          const next = [...state.services];
          const moved = next.splice(fromIndex, 1)[0];
          if (!moved) return state;
          next.splice(toIndex, 0, moved);
          changed = true;
          return { services: next };
        });
        if (changed) {
          const s = get();
          broadcastGlobals({ workspaces: s.workspaces, services: s.services });
        }
      },

      setUnreadCount: (id, count) => {
        const state = get();
        const service = state.services.find((s) => s.id === id);
        const willUpdate = !!service && service.unreadCount !== count;
        console.log(
          '[BoxB] setUnreadCount:',
          id,
          count,
          'previous:',
          service?.unreadCount,
          'will-update:',
          willUpdate
        );
        if (!service) return; // service gone — bail
        if (service.unreadCount === count) return; // SAME value — DO NOT trigger re-render
        set({
          services: state.services.map((s) =>
            s.id === id ? { ...s, unreadCount: count } : s
          )
        });
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      openAddModal: () => set({ isAddModalOpen: true }),
      closeAddModal: () => set({ isAddModalOpen: false }),

      openContextMenu: (serviceId, x, y) =>
        set({ contextMenu: { serviceId, x, y } }),
      closeContextMenu: () => set({ contextMenu: null }),

      requestRemove: (serviceId) =>
        set({ contextMenu: null, confirmRemoveFor: serviceId }),
      cancelRemove: () => set({ confirmRemoveFor: null }),

      renameService: (id, name) => {
        // Validate first so callers see a clear error in dev. The modal
        // also gates Save on the same predicate.
        if (!isValidServiceName(name)) {
          throw new Error('Invalid service name');
        }
        const trimmed = name.trim();
        set((state) => ({
          services: state.services.map((s) =>
            s.id === id
              ? { ...s, name: trimmed === '' ? s.defaultName : trimmed }
              : s
          )
        }));
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      openRenameService: (serviceId) =>
        set({ renameServiceFor: serviceId, contextMenu: null }),
      closeRenameService: () => set({ renameServiceFor: null }),

      confirmRemove: async () => {
        const id = get().confirmRemoveFor;
        if (!id) return;
        const svc = get().services.find((s) => s.id === id);
        get().removeService(id);
        set({ confirmRemoveFor: null });
        if (svc) {
          window.boxb.service
            .cleanupPartition(svc.partition)
            .then((r) => {
              if (!r.ok) {
                console.error(
                  '[cleanup] partition',
                  svc.partition,
                  r.error ?? 'unknown error'
                );
              }
            })
            .catch((err) => {
              console.error('[cleanup] partition', svc.partition, err);
            });
        }
      },

      addWorkspace: (name, icon) => {
        const state = get();
        if (state.workspaces.length >= MAX_WORKSPACES) {
          throw new Error(`Maximum ${MAX_WORKSPACES} workspaces`);
        }
        if (!isValidWorkspaceName(name)) {
          throw new Error('Invalid workspace name');
        }
        const finalIcon = (icon ?? '').trim();
        if (!isValidWorkspaceIcon(finalIcon)) {
          throw new Error('Invalid workspace icon');
        }
        const id = crypto.randomUUID();
        const ws: Workspace = {
          id,
          name,
          icon: finalIcon || name.charAt(0).toUpperCase(),
          order: nextWorkspaceOrder(state.workspaces),
          createdAt: Date.now()
        };
        set({ workspaces: [...state.workspaces, ws] });
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
        return id;
      },

      renameWorkspace: (id, name, icon) => {
        if (!isValidWorkspaceName(name)) {
          throw new Error('Invalid workspace name');
        }
        const finalIcon = (icon ?? '').trim();
        if (!isValidWorkspaceIcon(finalIcon)) {
          throw new Error('Invalid workspace icon');
        }
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === id
              ? { ...w, name, icon: finalIcon || name.charAt(0).toUpperCase() }
              : w
          )
        }));
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      deleteWorkspace: (id) => {
        const state = get();
        const remaining = state.workspaces.filter((w) => w.id !== id);
        if (remaining.length === 0) {
          throw new Error('Cannot delete the last remaining workspace');
        }
        const target = sortedByOrder(remaining)[0];
        if (!target) {
          throw new Error('No migration target available');
        }
        const services = state.services.map((s) =>
          s.workspaceId === id ? { ...s, workspaceId: target.id } : s
        );
        // Renormalize order to be contiguous 0..N-1 by current order.
        const renormalized = sortedByOrder(remaining).map((w, i) => ({
          ...w,
          order: i
        }));
        const activeWorkspaceId =
          state.activeWorkspaceId === id ? target.id : state.activeWorkspaceId;
        set({
          workspaces: renormalized,
          services,
          activeWorkspaceId,
          confirmDeleteWorkspaceFor: null,
          renameWorkspaceFor: null,
          workspaceContextMenu: null
        });
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      reorderWorkspaces: (orderedIds) => {
        set((state) => {
          const indexById = new Map<string, number>();
          orderedIds.forEach((id, i) => indexById.set(id, i));
          const updated = state.workspaces.map((w) => {
            const idx = indexById.get(w.id);
            return typeof idx === 'number' ? { ...w, order: idx } : w;
          });
          return { workspaces: updated };
        });
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      setActiveWorkspace: (id) => {
        const state = get();
        // Locked windows can't switch away from their workspace.
        if (state.lockedWorkspaceId && id !== state.lockedWorkspaceId) return;
        if (id === state.activeWorkspaceId) return;
        // Preserve activeServiceId only if the active service belongs to the
        // new workspace; otherwise clear so the user sees the empty state.
        const active = state.services.find((s) => s.id === state.activeServiceId);
        const keep = active && active.workspaceId === id;
        set({ activeWorkspaceId: id, activeServiceId: keep ? state.activeServiceId : null });
      },

      moveServiceToWorkspace: (serviceId, workspaceId) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === serviceId ? { ...s, workspaceId } : s
          )
        }));
        const s = get();
        broadcastGlobals({ workspaces: s.workspaces, services: s.services });
      },

      cycleWorkspace: (direction) => {
        const state = get();
        if (state.lockedWorkspaceId) return;
        const ordered = sortedByOrder(state.workspaces);
        if (ordered.length === 0) return;
        const idx = ordered.findIndex((w) => w.id === state.activeWorkspaceId);
        const nextIdx =
          idx < 0
            ? 0
            : (idx + direction + ordered.length) % ordered.length;
        const nextWs = ordered[nextIdx];
        if (nextWs) get().setActiveWorkspace(nextWs.id);
      },

      initLockedWorkspace: (id) => {
        const state = get();
        if (state.lockedWorkspaceId) return; // Sealed once at startup.
        const ws = state.workspaces.find((w) => w.id === id);
        if (!ws) {
          // Workspace was deleted between the right-click and this window
          // mounting. Nothing to lock onto — close ourselves.
          try {
            window.boxb.window.forceClose();
          } catch {
            // best-effort; the window will at least show empty.
          }
          return;
        }
        set({
          lockedWorkspaceId: id,
          activeWorkspaceId: id,
          activeServiceId: null
        });
      },

      openAddWorkspaceModal: () => set({ isAddWorkspaceModalOpen: true }),
      closeAddWorkspaceModal: () => set({ isAddWorkspaceModalOpen: false }),

      openRenameWorkspace: (id) =>
        set({ renameWorkspaceFor: id, workspaceContextMenu: null }),
      closeRenameWorkspace: () => set({ renameWorkspaceFor: null }),

      requestDeleteWorkspace: (id) =>
        set({ confirmDeleteWorkspaceFor: id, workspaceContextMenu: null }),
      cancelDeleteWorkspace: () => set({ confirmDeleteWorkspaceFor: null }),

      confirmDeleteWorkspace: () => {
        const id = get().confirmDeleteWorkspaceFor;
        if (!id) return;
        get().deleteWorkspace(id);
      },

      openWorkspaceContextMenu: (workspaceId, x, y) =>
        set({ workspaceContextMenu: { workspaceId, x, y } }),
      closeWorkspaceContextMenu: () => set({ workspaceContextMenu: null })
    }),
    {
      name: 'boxb-services',
      storage: createJSONStorage(() => ipcStorage),
      // activeServiceId is per-window (each window starts at "no active
      // service" on open). activeWorkspaceId is persisted because it serves
      // as the seed for new windows opened via Ctrl+N. Modal/context-menu
      // state is per-window and never persisted.
      partialize: (state) => ({
        services: state.services.map((s) => ({ ...s, unreadCount: 0 })),
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId
      })
    }
  )
);

// Idempotent post-hydration migration. Ensures a "Main" workspace exists,
// every service has a workspaceId, and every service has a defaultName.
// Safe to call multiple times. Called from App.tsx once persistence has
// hydrated.
export function ensureWorkspacesInitialized(): void {
  const state = useServicesStore.getState();
  const orphanedServices = state.services.some((s) => !s.workspaceId);
  const missingDefaultName = state.services.some((s) => !s.defaultName);
  const noWorkspaces = state.workspaces.length === 0;
  const validIds = new Set(state.workspaces.map((w) => w.id));
  const invalidActive = !validIds.has(state.activeWorkspaceId);

  if (!orphanedServices && !missingDefaultName && !noWorkspaces && !invalidActive)
    return;

  let main = state.workspaces.find((w) => w.name === 'Main');
  let workspaces = state.workspaces;
  if (!main) {
    main = {
      id: crypto.randomUUID(),
      name: 'Main',
      icon: 'M',
      order: 0,
      createdAt: Date.now()
    };
    workspaces = [...workspaces, main];
  }
  const services = state.services.map((s) => {
    let next = s;
    if (!next.workspaceId) next = { ...next, workspaceId: main!.id };
    // Backfill defaultName for services persisted before Phase 5c. Their
    // current name is the original (no rename has happened yet), so it's
    // a safe fallback.
    if (!next.defaultName) next = { ...next, defaultName: next.name };
    return next;
  });
  const newValidIds = new Set(workspaces.map((w) => w.id));
  const activeWorkspaceId = newValidIds.has(state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : main.id;

  useServicesStore.setState({ workspaces, services, activeWorkspaceId });
}

// Applies a snapshot received from another window. Replaces the global
// slice (workspaces + services) and reconciles per-window selections so the
// UI doesn't end up pointing at a now-deleted service or workspace. The
// re-entry guard prevents the apply from re-broadcasting and looping.
export function applyBroadcastSnapshot(snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== 'object') return;
  const s = snapshot as Partial<GlobalSnapshot>;
  if (!Array.isArray(s.workspaces) || !Array.isArray(s.services)) return;
  const incoming: GlobalSnapshot = {
    workspaces: s.workspaces,
    services: s.services
  };

  isApplyingBroadcast = true;
  let shouldForceClose = false;
  try {
    useServicesStore.setState((state) => {
      const wsIds = new Set(incoming.workspaces.map((w) => w.id));
      const svcIds = new Set(incoming.services.map((sv) => sv.id));
      // Locked window whose workspace was just deleted: tear it down.
      if (state.lockedWorkspaceId && !wsIds.has(state.lockedWorkspaceId)) {
        shouldForceClose = true;
      }
      // For locked windows whose workspace still exists, keep the active
      // workspace pinned to the lock regardless of incoming state.
      const activeWorkspaceId = state.lockedWorkspaceId
        ? wsIds.has(state.lockedWorkspaceId)
          ? state.lockedWorkspaceId
          : ''
        : wsIds.has(state.activeWorkspaceId)
          ? state.activeWorkspaceId
          : sortedByOrder(incoming.workspaces)[0]?.id ?? '';
      const activeServiceId =
        state.activeServiceId && svcIds.has(state.activeServiceId)
          ? state.activeServiceId
          : null;
      return {
        workspaces: incoming.workspaces,
        services: incoming.services,
        activeWorkspaceId,
        activeServiceId
      };
    });
  } finally {
    isApplyingBroadcast = false;
  }
  if (shouldForceClose) {
    try {
      window.boxb.window.forceClose();
    } catch {
      // best-effort
    }
  }
}

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).useServicesStore = useServicesStore;
}
