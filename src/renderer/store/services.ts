import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ipcStorage } from './storage';

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
  name: string;
  iconUrl: string;
  url: string;
  partition: string;
  userAgent?: string;
  unreadCount: number;
  isMuted: boolean;
  addedAt: number;
}

type NewServiceInput = Omit<
  Service,
  'id' | 'partition' | 'unreadCount' | 'isMuted' | 'addedAt'
>;

interface ContextMenuTarget {
  serviceId: string;
  x: number;
  y: number;
}

interface ServicesState {
  services: Service[];
  activeServiceId: string | null;
  isAddModalOpen: boolean;
  contextMenu: ContextMenuTarget | null;
  confirmRemoveFor: string | null;

  addService: (svc: NewServiceInput) => string;
  removeService: (id: string) => void;
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
}

export const useServicesStore = create<ServicesState>()(
  persist(
    (set, get) => ({
      services: [],
      activeServiceId: null,
      isAddModalOpen: false,
      contextMenu: null,
      confirmRemoveFor: null,

      addService: (svc) => {
        const id = crypto.randomUUID();
        const next: Service = {
          ...svc,
          id,
          partition: `persist:${id}`,
          unreadCount: 0,
          isMuted: false,
          addedAt: Date.now()
        };
        set((state) => ({ services: [...state.services, next] }));
        // Pre-register the partition with main so the permission handler is
        // attached before the webview attaches. Deduped via the module-level
        // Set so dom-ready won't re-fire it.
        registerPartitionOnce(next.partition);
        return id;
      },

      removeService: (id) =>
        set((state) => ({
          services: state.services.filter((s) => s.id !== id),
          activeServiceId: state.activeServiceId === id ? null : state.activeServiceId
        })),

      setActiveService: (id) => set({ activeServiceId: id }),

      reorderServices: (fromIndex, toIndex) =>
        set((state) => {
          if (fromIndex === toIndex) return state;
          if (fromIndex < 0 || fromIndex >= state.services.length) return state;
          if (toIndex < 0 || toIndex >= state.services.length) return state;
          const next = [...state.services];
          const moved = next.splice(fromIndex, 1)[0];
          if (!moved) return state;
          next.splice(toIndex, 0, moved);
          return { services: next };
        }),

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
      },

      openAddModal: () => set({ isAddModalOpen: true }),
      closeAddModal: () => set({ isAddModalOpen: false }),

      openContextMenu: (serviceId, x, y) =>
        set({ contextMenu: { serviceId, x, y } }),
      closeContextMenu: () => set({ contextMenu: null }),

      requestRemove: (serviceId) =>
        set({ contextMenu: null, confirmRemoveFor: serviceId }),
      cancelRemove: () => set({ confirmRemoveFor: null }),

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
      }
    }),
    {
      name: 'boxb-services',
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        services: state.services.map((s) => ({ ...s, unreadCount: 0 })),
        activeServiceId: state.activeServiceId
      })
    }
  )
);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).useServicesStore = useServicesStore;
}
