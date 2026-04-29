import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ipcStorage } from './storage';

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

interface ServicesState {
  services: Service[];
  activeServiceId: string | null;
  isAddModalOpen: boolean;

  addService: (svc: NewServiceInput) => string;
  removeService: (id: string) => void;
  setActiveService: (id: string | null) => void;
  reorderServices: (fromIndex: number, toIndex: number) => void;
  openAddModal: () => void;
  closeAddModal: () => void;
}

export const useServicesStore = create<ServicesState>()(
  persist(
    (set) => ({
      services: [],
      activeServiceId: null,
      isAddModalOpen: false,

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

      openAddModal: () => set({ isAddModalOpen: true }),
      closeAddModal: () => set({ isAddModalOpen: false })
    }),
    {
      name: 'boxb-services',
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        services: state.services,
        activeServiceId: state.activeServiceId
      })
    }
  )
);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).useServicesStore = useServicesStore;
}
