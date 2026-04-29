import Store from 'electron-store';
import type { StorageAdapter } from '@shared/storage';

// TODO(cloud-sync): add a CloudStorageAdapter implementing StorageAdapter
// and select between adapters based on a user setting.
export class ElectronStoreAdapter implements StorageAdapter {
  private readonly store: Store<Record<string, unknown>>;

  constructor() {
    this.store = new Store<Record<string, unknown>>({ name: 'boxb' });
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getAll(): Promise<Record<string, unknown>> {
    return this.store.store;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
