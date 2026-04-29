export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
  clear(): Promise<void>;
}
