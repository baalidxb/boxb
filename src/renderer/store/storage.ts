import type { StateStorage } from 'zustand/middleware';

export const ipcStorage: StateStorage = {
  getItem: async (name) => {
    const value = await window.boxb.storage.get<string>(name);
    return value ?? null;
  },
  setItem: async (name, value) => {
    await window.boxb.storage.set(name, value);
  },
  removeItem: async (name) => {
    await window.boxb.storage.delete(name);
  }
};
