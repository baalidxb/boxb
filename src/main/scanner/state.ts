import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import { basename, normalize } from 'node:path';
import type { ProtectedRepo } from '@shared/types';

// Phase 9.6: protected-repo list for the secret scanner. Its own
// electron-store file (boxb-scanner.json), separate from services/managed/
// onboarding state. Paths are stored POSIX-normalized so they compare and
// display consistently regardless of the OS that wrote them.

interface StoreSchema {
  repos?: ProtectedRepo[];
}

const store = new Store<StoreSchema>({ name: 'boxb-scanner' });

function toPosix(p: string): string {
  return normalize(p).replace(/\\/g, '/');
}

export function listRepos(): ProtectedRepo[] {
  const repos = store.get('repos');
  return Array.isArray(repos) ? repos : [];
}

// Add a repo. Idempotent on path: re-adding an already-protected folder
// returns the existing entry instead of creating a duplicate.
export function addRepo(repoPath: string): ProtectedRepo {
  const posix = toPosix(repoPath);
  const repos = listRepos();
  const existing = repos.find((r) => r.path === posix);
  if (existing) return existing;
  const repo: ProtectedRepo = {
    id: randomUUID(),
    path: posix,
    name: basename(posix) || posix,
    enabledAt: Date.now(),
    lastScanAt: null
  };
  store.set('repos', [...repos, repo]);
  return repo;
}

export function removeRepo(id: string): void {
  store.set(
    'repos',
    listRepos().filter((r) => r.id !== id)
  );
}

export function updateLastScanAt(id: string): void {
  store.set(
    'repos',
    listRepos().map((r) => (r.id === id ? { ...r, lastScanAt: Date.now() } : r))
  );
}
