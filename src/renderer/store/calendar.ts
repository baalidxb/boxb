import { create } from 'zustand';
import type {
  CalendarEvent,
  CalendarFetchStatus,
  CalendarSource
} from '@shared/types';

// Phase 9.8: calendar UI state. Per-window. Main owns boxb-calendars.json
// and the fetch cache; this store mirrors sources + the merged agenda.

interface CalendarStore {
  hydrated: boolean;
  sources: CalendarSource[];
  events: CalendarEvent[];
  statuses: CalendarFetchStatus[];

  panelOpen: boolean;
  // True while a getEvents roundtrip is in flight (spinner on Refresh).
  loading: boolean;
  // Inline error for the add-calendar form.
  addError: string | null;
  // True while addSource validates the pasted link (it fetches once).
  adding: boolean;

  hydrate: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  refresh: (force: boolean) => Promise<void>;
  addSource: (name: string, url: string) => Promise<boolean>;
  removeSource: (id: string) => Promise<void>;
  clearAddError: () => void;
}

export const useCalendarStore = create<CalendarStore>()((set, get) => ({
  hydrated: false,
  sources: [],
  events: [],
  statuses: [],
  panelOpen: false,
  loading: false,
  addError: null,
  adding: false,

  hydrate: async () => {
    try {
      const sources = await window.boxb.calendar.listSources();
      set({ sources: Array.isArray(sources) ? sources : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  openPanel: () => {
    set({ panelOpen: true });
    // Refresh on open — TTL in main makes this cheap when data is fresh.
    void get().refresh(false);
  },
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => {
    if (get().panelOpen) {
      set({ panelOpen: false });
    } else {
      get().openPanel();
    }
  },

  refresh: async (force) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { events, statuses } = await window.boxb.calendar.getEvents({ force });
      set({
        events: Array.isArray(events) ? events : [],
        statuses: Array.isArray(statuses) ? statuses : []
      });
    } catch {
      // keep whatever we had
    } finally {
      set({ loading: false });
    }
  },

  addSource: async (name, url) => {
    if (get().adding) return false;
    set({ adding: true, addError: null });
    try {
      const result = await window.boxb.calendar.addSource({ name, url });
      if (!result.ok) {
        set({ addError: result.error ?? 'Could not add the calendar.' });
        return false;
      }
      const sources = await window.boxb.calendar.listSources();
      set({ sources: Array.isArray(sources) ? sources : [] });
      await get().refresh(false);
      return true;
    } catch (err) {
      set({ addError: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      set({ adding: false });
    }
  },

  removeSource: async (id) => {
    try {
      await window.boxb.calendar.removeSource(id);
    } catch {
      // best effort
    }
    try {
      const sources = await window.boxb.calendar.listSources();
      set((s) => ({
        sources: Array.isArray(sources) ? sources : [],
        events: s.events.filter((e) => e.calendarId !== id),
        statuses: s.statuses.filter((st) => st.calendarId !== id)
      }));
    } catch {
      // keep existing
    }
  },

  clearAddError: () => set({ addError: null })
}));
