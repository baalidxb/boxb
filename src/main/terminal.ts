import { ipcMain, app, webContents } from 'electron';
import { spawn, type IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';
import {
  loadTerminalPanelState,
  saveTerminalPanelState,
  type TerminalPanelState
} from './window-state';

// One pty per terminal tab. Owned by the webContents that requested it,
// so a window close can kill only its own ptys without touching other
// windows' shells. ownerWcId is the host BrowserWindow's webContents id
// (renderer), NOT the pty's child process.
interface Entry {
  pty: IPty;
  ownerWcId: number;
  shell: string;
  cwd: string;
}

const ptys = new Map<string, Entry>();

// Bounded per-window cap matches the renderer's soft cap. Defensive: if a
// renderer bug ever ignores the soft cap, main rejects the create.
const MAX_PTYS_PER_WINDOW = 10;
const KILL_GRACE_MS = 1000;

function defaultShell(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: ['-NoLogo'] };
  }
  // Unsupported on this Phase but harmless to define — main process won't
  // crash if a developer runs the dev server on macOS/Linux.
  const sh = process.env.SHELL ?? '/bin/bash';
  return { command: sh, args: ['-l'] };
}

function defaultCwd(): string {
  // PowerShell's normal startup dir. Falls back to project cwd for sanity.
  try {
    return app.getPath('home');
  } catch {
    return process.cwd();
  }
}

function buildTitle(shell: string, cwd: string): string {
  const shellName = basename(shell, '.exe');
  const cwdName = basename(cwd) || cwd;
  // "PowerShell · home" — middle-dot separator, matches BoxB's typographic feel.
  const display = shellName.toLowerCase() === 'powershell'
    ? 'PowerShell'
    : shellName;
  return `${display} · ${cwdName}`;
}

function killEntry(ptyId: string, entry: Entry, reason: string): void {
  dlog('TERM:kill', { ptyId, reason, pid: entry.pty.pid });
  let exited = false;
  const onExit = (): void => {
    exited = true;
  };
  try {
    entry.pty.onExit(onExit);
  } catch {
    // pty may already be gone
  }
  try {
    // SIGINT first so the shell can release file handles cleanly. node-pty
    // accepts a signal name on POSIX; on Windows it ignores the arg and
    // calls TerminateProcess. Either way we follow up with a hard kill.
    entry.pty.kill('SIGINT');
  } catch {
    // pty already dead
  }
  setTimeout(() => {
    if (exited) return;
    if (!ptys.has(ptyId)) return;
    try {
      entry.pty.kill('SIGKILL');
    } catch {
      // already gone
    }
  }, KILL_GRACE_MS);
}

function safeSend(wcId: number, channel: string, payload: unknown): void {
  try {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return;
    wc.send(channel, payload);
  } catch (err) {
    dlog('TERM:send-failed', {
      channel,
      wcId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

function countPtysForWindow(wcId: number): number {
  let n = 0;
  for (const e of ptys.values()) if (e.ownerWcId === wcId) n++;
  return n;
}

interface CreateRequest {
  cols?: number;
  rows?: number;
}

interface CreateResult {
  ok: true;
  ptyId: string;
  cwd: string;
  shell: string;
  title: string;
}

interface CreateError {
  ok: false;
  error: string;
}

export function registerTerminalIpc(): void {
  ipcMain.handle(
    IPC.terminal.create,
    async (event, req: CreateRequest = {}): Promise<CreateResult | CreateError> => {
      const ownerWcId = event.sender.id;
      if (countPtysForWindow(ownerWcId) >= MAX_PTYS_PER_WINDOW) {
        dlog('TERM:create:rejected-cap', { ownerWcId });
        return { ok: false, error: `Tab cap (${MAX_PTYS_PER_WINDOW}) reached for this window.` };
      }

      const { command, args } = defaultShell();
      const cwd = defaultCwd();
      const ptyId = randomUUID();
      const cols = Math.max(2, Math.floor(req.cols ?? 80));
      const rows = Math.max(2, Math.floor(req.rows ?? 24));

      let pty: IPty;
      try {
        pty = spawn(command, args, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          // Strip ELECTRON_* envs so child shells don't pick up parent
          // process noise. PowerShell starts in user's normal env otherwise.
          env: Object.fromEntries(
            Object.entries(process.env).filter(([k]) => !k.startsWith('ELECTRON_'))
          ) as Record<string, string>
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dlog('TERM:create:spawn-failed', { command, error: msg });
        return { ok: false, error: msg };
      }

      const entry: Entry = { pty, ownerWcId, shell: command, cwd };
      ptys.set(ptyId, entry);
      const title = buildTitle(command, cwd);

      pty.onData((data) => {
        safeSend(ownerWcId, IPC.terminal.data, { ptyId, data });
      });
      pty.onExit(({ exitCode, signal }) => {
        dlog('TERM:exit', { ptyId, pid: pty.pid, exitCode, signal });
        ptys.delete(ptyId);
        safeSend(ownerWcId, IPC.terminal.exit, {
          ptyId,
          exitCode,
          signal: signal ?? null
        });
      });

      dlog('TERM:create:ok', { ptyId, ownerWcId, pid: pty.pid, cwd });
      return { ok: true, ptyId, cwd, shell: command, title };
    }
  );

  ipcMain.on(IPC.terminal.write, (event, payload: { ptyId: string; data: string }) => {
    const entry = ptys.get(payload?.ptyId);
    if (!entry) return;
    if (entry.ownerWcId !== event.sender.id) {
      // Cross-window write attempt. Refuse silently.
      dlog('TERM:write:cross-window-rejected', {
        ptyId: payload.ptyId,
        from: event.sender.id,
        owner: entry.ownerWcId
      });
      return;
    }
    try {
      entry.pty.write(payload.data);
    } catch (err) {
      dlog('TERM:write:err', {
        ptyId: payload.ptyId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  ipcMain.on(
    IPC.terminal.resize,
    (event, payload: { ptyId: string; cols: number; rows: number }) => {
      const entry = ptys.get(payload?.ptyId);
      if (!entry) return;
      if (entry.ownerWcId !== event.sender.id) return;
      const cols = Math.max(2, Math.floor(payload.cols));
      const rows = Math.max(2, Math.floor(payload.rows));
      try {
        entry.pty.resize(cols, rows);
      } catch (err) {
        dlog('TERM:resize:err', {
          ptyId: payload.ptyId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );

  ipcMain.on(IPC.terminal.kill, (event, payload: { ptyId: string }) => {
    const entry = ptys.get(payload?.ptyId);
    if (!entry) return;
    if (entry.ownerWcId !== event.sender.id) return;
    killEntry(payload.ptyId, entry, 'renderer-request');
    // Don't delete here — pty's onExit handler will, after the SIGKILL escalation.
  });

  ipcMain.handle(IPC.terminal.getPanelState, (): TerminalPanelState => {
    return loadTerminalPanelState();
  });

  ipcMain.on(IPC.terminal.setPanelState, (_event, payload: TerminalPanelState) => {
    if (!payload || typeof payload !== 'object') return;
    saveTerminalPanelState({
      open: Boolean(payload.open),
      height: Number(payload.height) || 300
    });
  });
}

// Called from main/index.ts when a window is destroyed. Kills only the
// ptys that belong to that window's renderer webContents — other windows'
// shells stay alive.
export function killPtysForWindow(wcId: number): void {
  let killed = 0;
  for (const [ptyId, entry] of ptys) {
    if (entry.ownerWcId !== wcId) continue;
    killEntry(ptyId, entry, 'window-closed');
    killed++;
  }
  if (killed > 0) dlog('TERM:window-cleanup', { wcId, killed });
}

// Called from app 'before-quit'. Best-effort full shutdown so we don't
// orphan PowerShell processes. Same SIGINT-then-SIGKILL escalation.
export function killAllPtys(reason: string): void {
  if (ptys.size === 0) return;
  dlog('TERM:kill-all', { reason, count: ptys.size });
  for (const [ptyId, entry] of ptys) {
    killEntry(ptyId, entry, reason);
  }
}
