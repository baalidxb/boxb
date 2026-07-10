import { create } from 'zustand';
import type { Reminder, TodoItem } from '@shared/types';

// Phase 9.7: reminders + tasks UI state. Per-window. Main owns
// boxb-reminders.json; this store mirrors it after hydrate() and re-mirrors
// on every reminders:changed broadcast (wired in App.tsx), so all windows
// stay in sync no matter where a mutation originated (panel, command bar,
// toast button, or the scheduler firing).

interface RemindersStore {
  hydrated: boolean;
  reminders: Reminder[];
  todos: TodoItem[];

  // Panel visibility (toggled from the sidebar bell button).
  panelOpen: boolean;

  hydrate: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  create: (payload: {
    text: string;
    dueAt: number;
    serviceId: string | null;
  }) => Promise<string | null>;
  complete: (id: string) => Promise<void>;
  snooze: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;

  addTodo: (text: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  clearDoneTodos: () => Promise<void>;
}

export const useRemindersStore = create<RemindersStore>()((set) => ({
  hydrated: false,
  reminders: [],
  todos: [],
  panelOpen: false,

  hydrate: async () => {
    try {
      const data = await window.boxb.reminders.list();
      set({
        reminders: Array.isArray(data.reminders) ? data.reminders : [],
        todos: Array.isArray(data.todos) ? data.todos : [],
        hydrated: true
      });
    } catch {
      set({ hydrated: true });
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  // Panel creates pass silent:true — the new row appearing IS the feedback.
  // (Command-bar creates go straight through window.boxb.reminders.create
  // in App.tsx's executor, non-silent, so a confirmation toast shows.)
  create: async ({ text, dueAt, serviceId }) => {
    try {
      const result = await window.boxb.reminders.create({
        text,
        dueAt,
        serviceId,
        silent: true
      });
      if (!result.ok) return result.error ?? 'Could not create the reminder.';
      // reminders:changed will re-hydrate, but refresh now for instant UI.
      const data = await window.boxb.reminders.list();
      set({
        reminders: Array.isArray(data.reminders) ? data.reminders : [],
        todos: Array.isArray(data.todos) ? data.todos : []
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },

  complete: async (id) => {
    try {
      await window.boxb.reminders.complete(id);
    } catch {
      // reminders:changed (or lack of it) keeps state truthful
    }
  },

  snooze: async (id) => {
    try {
      await window.boxb.reminders.snooze(id);
    } catch {
      // best effort
    }
  },

  remove: async (id) => {
    try {
      await window.boxb.reminders.remove(id);
    } catch {
      // best effort
    }
  },

  addTodo: async (text) => {
    try {
      await window.boxb.reminders.addTodo(text);
    } catch {
      // best effort
    }
  },

  toggleTodo: async (id) => {
    try {
      await window.boxb.reminders.toggleTodo(id);
    } catch {
      // best effort
    }
  },

  removeTodo: async (id) => {
    try {
      await window.boxb.reminders.removeTodo(id);
    } catch {
      // best effort
    }
  },

  clearDoneTodos: async () => {
    try {
      await window.boxb.reminders.clearDoneTodos();
    } catch {
      // best effort
    }
  }
}));
