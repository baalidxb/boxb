import { app, shell } from 'electron';
import type { Session } from 'electron';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { dlog } from './debug-log';

// All intercepted downloads land here. We rely on the OS to recycle %TEMP%
// (no manual cleanup) — anything important is saved deliberately by the user
// from inside their default viewer.
const TEMP_DIR = join(tmpdir(), 'boxb-temp');
let tempDirReady = false;

function ensureTempDir(): boolean {
  if (tempDirReady) return true;
  try {
    mkdirSync(TEMP_DIR, { recursive: true });
    tempDirReady = true;
    return true;
  } catch (err) {
    dlog('DOWNLOAD:tempdir-create-failed', { dir: TEMP_DIR, error: String(err) });
    return false;
  }
}

function uniqueTempPath(filename: string): string {
  const safe = filename.replace(/[\\/:*?"<>|]+/g, '_') || 'download';
  const parsed = parse(safe);
  const base = parsed.name || 'download';
  // Timestamp suffix prevents collisions when the same file is clicked twice
  // (intentional: each click yields a fresh copy in case content changed).
  return join(TEMP_DIR, `${base}-${Date.now()}${parsed.ext}`);
}

function attachDownloadHandler(ses: Session): void {
  ses.on('will-download', (_event, item, wc) => {
    const filename = item.getFilename() || 'download';
    const mime = item.getMimeType();
    const wcId = wc?.id;
    dlog('DOWNLOAD:will-download', { wcId, filename, mime });

    if (!ensureTempDir()) {
      // Fall back to Electron's default Save As dialog so the user still has
      // a path to retrieve the file even if temp is unwritable.
      return;
    }

    const savePath = uniqueTempPath(filename);
    item.setSavePath(savePath);
    dlog('DOWNLOAD:redirect-to-temp', { wcId, savePath });

    item.once('done', (_e, state) => {
      if (state !== 'completed') {
        dlog('DOWNLOAD:not-completed', { wcId, state, savePath });
        return;
      }
      dlog('DOWNLOAD:complete', { wcId, savePath });
      void shell.openPath(savePath).then((errMsg) => {
        if (errMsg) {
          dlog('DOWNLOAD:open-failed', { wcId, savePath, error: errMsg });
        }
      });
    });
  });
}

export function initDownloads(): void {
  app.on('session-created', (ses) => {
    attachDownloadHandler(ses);
    dlog('DOWNLOAD:session-attached');
  });
}
