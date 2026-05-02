import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join, basename } from 'node:path';
import { IPC } from '@shared/ipc';
import {
  MANAGED_CONFIG_VERSION,
  type ManagedConfigFile,
  type ManagedConfigService,
  type ManagedConfigWorkspace,
  type ManagedState
} from '@shared/types';
import { dlog } from './debug-log';
import { loadManagedState, saveManagedState } from './managed-state';
import { rebuildTrayMenu } from './tray';

const CONFIG_EXT = '.boxb-config';
const CLI_FLAG = '--config=';

// Drop folder path: %APPDATA%\boxb\configs\
// Subfolder .applied\ holds files that have been successfully imported,
// so they aren't re-prompted on next launch. We don't delete them — admins
// may want to verify which config was applied last.
function dropFolderRoot(): string {
  return join(app.getPath('userData'), 'configs');
}

function appliedFolder(): string {
  return join(dropFolderRoot(), '.applied');
}

function ensureDropFolder(): void {
  const root = dropFolderRoot();
  const applied = appliedFolder();
  try {
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    if (!existsSync(applied)) mkdirSync(applied, { recursive: true });
  } catch (err) {
    dlog('MANAGED:ensure-folder:err', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

// Strict shape check. Anything weird → reject with a clear error string
// the renderer can show in a modal. We intentionally don't try to repair
// malformed configs — admins should fix the source.
export function validateConfig(raw: unknown): { ok: true; config: ManagedConfigFile } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Config is not a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== 'number') {
    return { ok: false, error: 'Missing or non-numeric "version" field.' };
  }
  if (obj.version > MANAGED_CONFIG_VERSION) {
    return {
      ok: false,
      error: `This config requires a newer BoxB version (config v${obj.version}, app supports v${MANAGED_CONFIG_VERSION}). Please update BoxB.`
    };
  }
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    return { ok: false, error: 'Missing or empty "name" field.' };
  }
  if (obj.managed !== true) {
    return { ok: false, error: '"managed" field must be true.' };
  }
  if (obj.lockMode !== 'hard') {
    return { ok: false, error: 'Only "lockMode": "hard" is supported in this version.' };
  }
  if (!Array.isArray(obj.services)) {
    return { ok: false, error: '"services" must be an array.' };
  }
  if (!Array.isArray(obj.workspaces) || obj.workspaces.length === 0) {
    return { ok: false, error: '"workspaces" must be a non-empty array.' };
  }

  const workspaces: ManagedConfigWorkspace[] = [];
  for (const w of obj.workspaces as unknown[]) {
    if (!w || typeof w !== 'object') {
      return { ok: false, error: 'Workspace entry is not an object.' };
    }
    const ws = w as Record<string, unknown>;
    if (typeof ws.id !== 'string' || ws.id.length === 0) {
      return { ok: false, error: 'Workspace missing "id".' };
    }
    if (typeof ws.name !== 'string' || ws.name.length === 0) {
      return { ok: false, error: 'Workspace missing "name".' };
    }
    if (typeof ws.icon !== 'string') {
      return { ok: false, error: 'Workspace missing "icon".' };
    }
    if (typeof ws.order !== 'number') {
      return { ok: false, error: 'Workspace missing numeric "order".' };
    }
    workspaces.push({
      id: ws.id,
      name: ws.name,
      icon: ws.icon,
      order: ws.order
    });
  }
  const wsIds = new Set(workspaces.map((w) => w.id));

  const services: ManagedConfigService[] = [];
  for (const s of obj.services as unknown[]) {
    if (!s || typeof s !== 'object') {
      return { ok: false, error: 'Service entry is not an object.' };
    }
    const sv = s as Record<string, unknown>;
    const required = ['catalogId', 'name', 'url', 'iconUrl', 'workspaceId'];
    for (const field of required) {
      if (typeof sv[field] !== 'string' || (sv[field] as string).length === 0) {
        return { ok: false, error: `Service missing string field "${field}".` };
      }
    }
    if (sv.hibernation !== 'light' && sv.hibernation !== 'aggressive') {
      return { ok: false, error: `Service "${String(sv.name)}" has invalid hibernation value.` };
    }
    if (!wsIds.has(sv.workspaceId as string)) {
      return {
        ok: false,
        error: `Service "${String(sv.name)}" references unknown workspace id.`
      };
    }
    const built: ManagedConfigService = {
      catalogId: sv.catalogId as string,
      name: sv.name as string,
      url: sv.url as string,
      iconUrl: sv.iconUrl as string,
      hibernation: sv.hibernation,
      workspaceId: sv.workspaceId as string
    };
    if (typeof sv.userAgent === 'string' && sv.userAgent.length > 0) {
      built.userAgent = sv.userAgent;
    }
    services.push(built);
  }

  return {
    ok: true,
    config: {
      version: obj.version,
      name: obj.name.trim(),
      createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
      createdBy: typeof obj.createdBy === 'string' ? obj.createdBy : 'unknown',
      managed: true,
      lockMode: 'hard',
      services,
      workspaces
    }
  };
}

function readAndValidate(filePath: string): ManagedConfigFile | null {
  try {
    const text = readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    const result = validateConfig(parsed);
    if (!result.ok) {
      dlog('MANAGED:invalid-config', { filePath, error: result.error });
      return null;
    }
    return result.config;
  } catch (err) {
    dlog('MANAGED:read-failed', {
      filePath,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

// Pending config + its source path. Held only in memory. Renderer queries
// once on mount via managed:check-launch-config and either applies or
// dismisses; both clear pending.
interface PendingConfig {
  config: ManagedConfigFile;
  sourcePath: string | null; // null when source was a CLI flag — no file to move
}

let pending: PendingConfig | null = null;

function detectFromArgv(argv: readonly string[]): string | null {
  // Prefer --config=<path>; fall back to argv[1] if it ends in .boxb-config
  // (Windows file association passes the path as argv[1] directly).
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.startsWith(CLI_FLAG)) {
      const path = arg.slice(CLI_FLAG.length);
      if (path) return path;
    }
  }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a === 'string' && a.toLowerCase().endsWith(CONFIG_EXT)) {
      return a;
    }
  }
  return null;
}

function detectFromDropFolder(): string | null {
  const root = dropFolderRoot();
  if (!existsSync(root)) return null;
  let oldest: { path: string; mtime: number } | null = null;
  try {
    for (const entry of readdirSync(root)) {
      if (!entry.toLowerCase().endsWith(CONFIG_EXT)) continue;
      const full = join(root, entry);
      try {
        const s = statSync(full);
        if (!s.isFile()) continue;
        const mtime = s.mtimeMs;
        if (!oldest || mtime < oldest.mtime) {
          oldest = { path: full, mtime };
        }
      } catch {
        // unreadable file — skip
      }
    }
  } catch (err) {
    dlog('MANAGED:scan-folder:err', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
  return oldest ? oldest.path : null;
}

// Run once at app ready. Establishes pending config from CLI/file-assoc/
// drop folder. Renderer pulls it later via IPC.
export function detectLaunchConfig(): void {
  ensureDropFolder();

  const cliPath = detectFromArgv(process.argv);
  if (cliPath) {
    const config = readAndValidate(cliPath);
    if (config) {
      // For CLI flag invocations sourcePath stays NULL — we don't move the
      // user's hand-supplied file. For file-association invocations the path
      // is passed via argv too but we still leave it alone (it's wherever
      // the user double-clicked from, not a managed location).
      pending = { config, sourcePath: null };
      dlog('MANAGED:detected-cli', { path: cliPath, name: config.name });
      return;
    }
    dlog('MANAGED:cli-rejected', { path: cliPath });
  }

  const dropPath = detectFromDropFolder();
  if (dropPath) {
    const config = readAndValidate(dropPath);
    if (config) {
      pending = { config, sourcePath: dropPath };
      dlog('MANAGED:detected-drop', { path: dropPath, name: config.name });
    } else {
      dlog('MANAGED:drop-rejected', { path: dropPath });
    }
  }
}

function moveToApplied(sourcePath: string): void {
  try {
    const target = join(appliedFolder(), `${Date.now()}-${basename(sourcePath)}`);
    renameSync(sourcePath, target);
    dlog('MANAGED:moved-to-applied', { from: sourcePath, to: target });
  } catch (err) {
    dlog('MANAGED:move-failed', {
      sourcePath,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

interface ExportRequest {
  name: string;
  services: ManagedConfigService[];
  workspaces: ManagedConfigWorkspace[];
}

interface ExportResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  error?: string;
}

export function registerManagedIpc(): void {
  ipcMain.handle(IPC.managed.getState, (): ManagedState => loadManagedState());

  ipcMain.handle(IPC.managed.setState, (_event, payload: ManagedState): void => {
    saveManagedState({
      isManaged: Boolean(payload?.isManaged),
      configName:
        typeof payload?.configName === 'string' && payload.configName.length > 0
          ? payload.configName
          : null,
      importedAt:
        typeof payload?.importedAt === 'number' ? payload.importedAt : null
    });
    // Tray needs to reflect new managed status (export item visibility +
    // header line). Failure to rebuild is not fatal.
    try {
      rebuildTrayMenu();
    } catch (err) {
      dlog('MANAGED:tray-rebuild-err', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  ipcMain.handle(
    IPC.managed.checkLaunchConfig,
    (): ManagedConfigFile | null => (pending ? pending.config : null)
  );

  ipcMain.handle(IPC.managed.applyConfig, (): void => {
    if (!pending) return;
    if (pending.sourcePath) {
      moveToApplied(pending.sourcePath);
    }
    pending = null;
  });

  ipcMain.handle(IPC.managed.cancelConfig, (): void => {
    // Leave the source file in place — admins may delete it manually if
    // they want to stop re-prompts. Just clear in-memory state for this
    // session.
    pending = null;
  });

  ipcMain.handle(
    IPC.managed.export,
    async (event, req: ExportRequest): Promise<ExportResult> => {
      if (!req || typeof req.name !== 'string' || !Array.isArray(req.services) || !Array.isArray(req.workspaces)) {
        return { ok: false, error: 'Invalid export payload.' };
      }

      const trimmedName = req.name.trim() || 'Managed Config';
      const file: ManagedConfigFile = {
        version: MANAGED_CONFIG_VERSION,
        name: trimmedName,
        createdAt: Date.now(),
        createdBy: `BoxB v${app.getVersion()}`,
        managed: true,
        lockMode: 'hard',
        // Re-validate the renderer-supplied data before writing — defends
        // against malformed payloads and gives the export a single source
        // of truth for shape.
        services: req.services.map((s) => {
          const out: ManagedConfigService = {
            catalogId: s.catalogId,
            name: s.name,
            url: s.url,
            iconUrl: s.iconUrl,
            hibernation: s.hibernation,
            workspaceId: s.workspaceId
          };
          if (s.userAgent) out.userAgent = s.userAgent;
          return out;
        }),
        workspaces: req.workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          icon: w.icon,
          order: w.order
        }))
      };

      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const safeName = trimmedName.replace(/[\\/:*?"<>|]/g, '_');
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export Managed Config',
        defaultPath: `BoxB-${safeName}${CONFIG_EXT}`,
        filters: [
          { name: 'BoxB Config', extensions: ['boxb-config'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      try {
        writeFileSync(result.filePath, JSON.stringify(file, null, 2), 'utf8');
        dlog('MANAGED:exported', { path: result.filePath, name: trimmedName });
        return { ok: true, path: result.filePath };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dlog('MANAGED:export-write-failed', { path: result.filePath, error: msg });
        return { ok: false, error: msg };
      }
    }
  );
}
