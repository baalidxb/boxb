import { BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { ProtectedRepo, ScanReport } from '@shared/types';
import { addRepo, listRepos, removeRepo, updateLastScanAt } from './state';
import { scanFiles, walkRepoFiles } from './engine';
import {
  backupExistingHook,
  detectExistingHook,
  installHook,
  uninstallHook
} from './hooks';
import { dlog } from '../debug-log';

// Phase 9.6: scanner IPC surface. Mirrors the managed/ai registration
// pattern — a single register fn called from app.whenReady.

interface AddRepoResult {
  ok: boolean;
  repo?: ProtectedRepo;
  error?: string;
  // Set when a foreign pre-commit hook blocks a direct install — the
  // renderer shows the replace-confirm modal and calls confirmAddRepo.
  needsConfirm?: boolean;
}

interface RemoveRepoResult {
  // Whether a BoxB hook was deleted, a backup was restored, or a foreign
  // hook was preserved. Lets the renderer surface the right message.
  removed: boolean;
  restored: boolean;
  foreign: boolean;
}

function isGitRepo(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

export function registerScannerIpc(): void {
  ipcMain.handle(IPC.scanner.listRepos, (): ProtectedRepo[] => listRepos());

  ipcMain.handle(
    IPC.scanner.pickFolder,
    async (event): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = await dialog.showOpenDialog(win!, {
        title: 'Select a git repository to protect',
        properties: ['openDirectory']
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    }
  );

  ipcMain.handle(
    IPC.scanner.addRepo,
    (_event, repoPath: unknown): AddRepoResult => {
      if (typeof repoPath !== 'string' || repoPath.length === 0) {
        return { ok: false, error: 'No folder path provided.' };
      }
      // Git-repo guard: only protect actual repositories. Catches users
      // pointing the picker at a random folder.
      if (!isGitRepo(repoPath)) {
        return {
          ok: false,
          error: 'That folder is not a git repository (no .git found).'
        };
      }
      // A foreign (user-authored) pre-commit hook must not be clobbered
      // silently — bail out and let the renderer ask for confirmation. A
      // pre-existing BoxB hook ('boxb') is safe to overwrite (refreshes the
      // CLI path), so it falls through to the install below.
      if (detectExistingHook(repoPath) === 'foreign') {
        return { ok: false, needsConfirm: true };
      }
      installHook(repoPath);
      const repo = addRepo(repoPath);
      dlog('SCANNER:add-repo', { id: repo.id, path: repo.path });
      return { ok: true, repo };
    }
  );

  ipcMain.handle(
    IPC.scanner.confirmAddRepo,
    (_event, repoPath: unknown): AddRepoResult => {
      if (typeof repoPath !== 'string' || repoPath.length === 0) {
        return { ok: false, error: 'No folder path provided.' };
      }
      if (!isGitRepo(repoPath)) {
        return {
          ok: false,
          error: 'That folder is not a git repository (no .git found).'
        };
      }
      // User confirmed replacement: preserve their hook as a backup, then
      // install ours over the top.
      if (detectExistingHook(repoPath) === 'foreign') {
        backupExistingHook(repoPath);
      }
      installHook(repoPath);
      const repo = addRepo(repoPath);
      dlog('SCANNER:confirm-add-repo', { id: repo.id, path: repo.path });
      return { ok: true, repo };
    }
  );

  ipcMain.handle(
    IPC.scanner.removeRepo,
    (_event, id: unknown): RemoveRepoResult => {
      const empty: RemoveRepoResult = {
        removed: false,
        restored: false,
        foreign: false
      };
      if (typeof id !== 'string') return empty;
      const repo = listRepos().find((r) => r.id === id);
      // Uninstall the hook BEFORE dropping state so we still know the path.
      // A foreign hook is left in place (user modified it); we only stop
      // protecting it in BoxB.
      const result = repo ? uninstallHook(repo.path) : empty;
      removeRepo(id);
      dlog('SCANNER:remove-repo', { id, ...result });
      return result;
    }
  );

  ipcMain.handle(
    IPC.scanner.scanRepo,
    async (_event, id: unknown): Promise<ScanReport | null> => {
      if (typeof id !== 'string') return null;
      const repo = listRepos().find((r) => r.id === id);
      if (!repo) return null;
      const files = await walkRepoFiles(repo.path);
      const scanned = await scanFiles(files);
      updateLastScanAt(id);
      const totalIssues = scanned.reduce((n, f) => n + f.issues.length, 0);
      dlog('SCANNER:scan-repo', {
        id,
        filesScanned: files.length,
        filesWithIssues: scanned.length,
        totalIssues
      });
      return {
        repo: repo.path,
        timestamp: Date.now(),
        files: scanned.map((f) => ({ path: f.file, issues: f.issues })),
        totalIssues
      };
    }
  );
}
