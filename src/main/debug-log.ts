import { app } from 'electron';
import { appendFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

let cachedPath: string | null = null;

function getLogPath(): string {
  if (!cachedPath) cachedPath = join(app.getPath('userData'), 'boxb-debug.log');
  return cachedPath;
}

export function dlog(...args: unknown[]): void {
  const line =
    `[${new Date().toISOString()}] ` +
    args
      .map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ') +
    '\n';
  try {
    appendFileSync(getLogPath(), line);
  } catch {
    // ignore write failures — never block app on log
  }
  console.log('[DEBUG]', ...args);
}

export function clearDebugLog(): void {
  try {
    unlinkSync(getLogPath());
  } catch {
    // file may not exist; not an error
  }
}
