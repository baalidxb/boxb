import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PATTERNS } from './patterns';
import type { ScanResult } from '@shared/types';

// Phase 9.6: the scanning core. Pure Node (no Electron) so it can be shared
// by the main-process IPC layer AND bundled into the standalone CLI that git
// hooks invoke. Everything here is defensive: bad paths, binaries, and
// oversized files are skipped silently rather than throwing.

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — larger suggests data/binary
const BINARY_SNIFF_BYTES = 1024; // null-byte check window

// Directory names and file suffixes we never scan. Kept here (not just in
// the directory walker) so a path passed directly to scanFile is also
// filtered — the CLI receives arbitrary argv paths.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out']);
const SKIP_FILE_RE = /(\.lock|\.min\.js|\.map)$/i;

// Redact a matched secret for safe display. Keeps a short head/tail so a
// human can still recognize which value tripped the scanner without exposing
// the full credential. Short matches are fully masked.
export function redact(value: string): string {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function shouldSkipPath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  const segments = norm.split('/');
  if (segments.some((s) => SKIP_DIRS.has(s))) return true;
  if (SKIP_FILE_RE.test(norm)) return true;
  return false;
}

// Heuristic binary detection: a null byte in the first 1KB is a strong
// signal the file isn't source text. IMPORTANT: only call this on buffers
// that are NOT UTF-16 — UTF-16-encoded text is full of null bytes (every
// ASCII char is encoded as two bytes, one of which is 0x00), so running this
// on UTF-16 would false-positive every such file as "binary". See
// decodeBuffer for the encoding gate that protects against that.
function isBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

// Decode a UTF-16 big-endian buffer. Node has no 'utf16be' encoding, so we
// byte-swap into little-endian and decode that. swap16() requires an even
// length and mutates in place, hence the copy + trim of any dangling byte.
function decodeUtf16BE(bytes: Buffer): string {
  const even =
    bytes.length % 2 === 0 ? bytes : bytes.subarray(0, bytes.length - 1);
  const copy = Buffer.from(even);
  copy.swap16();
  return copy.toString('utf16le');
}

// Detect a BOM-less UTF-16 file by its tell-tale alternating null-byte
// pattern in the first 256 bytes. ASCII text written as UTF-16 LE looks like
// [char, 0x00, char, 0x00, …] (zeros at ODD offsets); UTF-16 BE is the
// mirror ([0x00, char, …], zeros at EVEN offsets). Pure UTF-8/ASCII has no
// null bytes, so it never triggers here. Returns null when there's no clear
// signal (we then fall back to the binary check / UTF-8).
function detectBomlessUtf16(buf: Buffer): 'le' | 'be' | null {
  const limit = Math.min(buf.length, 256);
  const evenLimit = limit - (limit % 2);
  if (evenLimit < 4) return null;
  let zerosAtOdd = 0; // → UTF-16 LE
  let zerosAtEven = 0; // → UTF-16 BE
  let pairs = 0;
  for (let i = 0; i + 1 < evenLimit; i += 2) {
    pairs++;
    if (buf[i + 1] === 0) zerosAtOdd++;
    if (buf[i] === 0) zerosAtEven++;
  }
  if (pairs === 0) return null;
  const THRESHOLD = 0.9;
  if (zerosAtOdd / pairs >= THRESHOLD && zerosAtEven / pairs < 0.5) return 'le';
  if (zerosAtEven / pairs >= THRESHOLD && zerosAtOdd / pairs < 0.5) return 'be';
  return null;
}

// Strip a leading BOM character (U+FEFF) left over after decoding. Keeping it
// would shift column numbers on line 1 and could break a pattern anchored at
// the very start of the file.
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

interface DecodedFile {
  // Short label for diagnostics only.
  encoding: string;
  // Decoded text, or null when the buffer is genuinely binary (skip it).
  text: string | null;
}

// Turn raw file bytes into text, transparently handling the encodings real
// files show up as on Windows. The order matters:
//   1. Explicit BOMs win — UTF-8, UTF-16 LE, UTF-16 BE.
//   2. Then sniff for BOM-less UTF-16 (PowerShell scripts often omit the BOM).
//   3. Only files that are NEITHER BOM-tagged NOR UTF-16 go through the
//      null-byte binary check — so true binaries are still skipped, but
//      UTF-16 source is never mistaken for binary (the Day-2 bug).
function decodeBuffer(buf: Buffer): DecodedFile {
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    return { encoding: 'utf8-bom', text: stripBom(buf.toString('utf8', 3)) };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return {
      encoding: 'utf16le-bom',
      text: stripBom(buf.toString('utf16le', 2))
    };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return {
      encoding: 'utf16be-bom',
      text: stripBom(decodeUtf16BE(buf.subarray(2)))
    };
  }

  const bomless = detectBomlessUtf16(buf);
  if (bomless === 'le') {
    return { encoding: 'utf16le-nobom', text: stripBom(buf.toString('utf16le')) };
  }
  if (bomless === 'be') {
    return { encoding: 'utf16be-nobom', text: stripBom(decodeUtf16BE(buf)) };
  }

  if (isBinary(buf)) return { encoding: 'binary', text: null };
  return { encoding: 'utf8', text: stripBom(buf.toString('utf8')) };
}

function scanContent(content: string): ScanResult[] {
  const results: ScanResult[] = [];
  const lines = content.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const pattern of PATTERNS) {
      // matchAll on a global regex builds its own iterator, so there's no
      // lastIndex state to reset between lines or patterns.
      for (const match of line.matchAll(pattern.regex)) {
        results.push({
          patternId: pattern.id,
          patternName: pattern.name,
          severity: pattern.severity,
          line: i + 1,
          col: (match.index ?? 0) + 1,
          snippet: redact(match[0])
        });
      }
    }
  }
  return results;
}

export async function scanFile(filePath: string): Promise<ScanResult[]> {
  const dbg = process.env.BOXB_SCAN_DEBUG
    ? (m: string): void => {
        process.stderr.write(`[scan-dbg] ${m}\n`);
      }
    : null;
  try {
    if (shouldSkipPath(filePath)) {
      dbg?.(`SKIP path-filter: ${filePath}`);
      return [];
    }
    const info = await stat(filePath);
    if (!info.isFile()) {
      dbg?.(`SKIP not-a-file: ${filePath}`);
      return [];
    }
    if (info.size > MAX_FILE_SIZE) {
      dbg?.(`SKIP too-big (${info.size}): ${filePath}`);
      return [];
    }
    const buf = await readFile(filePath);
    const { encoding, text } = decodeBuffer(buf);
    if (dbg) {
      const first = Array.from(buf.subarray(0, 8))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
      dbg(`READ ${filePath} size=${info.size} firstBytes=[${first}] encoding=${encoding}`);
      dbg(`CONTENT(first200)=${JSON.stringify((text ?? '').slice(0, 200))}`);
    }
    if (text === null) {
      dbg?.(`SKIP binary-heuristic: ${filePath}`);
      return [];
    }
    const results = scanContent(text);
    dbg?.(`RESULT ${filePath} matches=${results.length} (${encoding})`);
    return results;
  } catch (err) {
    dbg?.(`ERROR ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    // Nonexistent / unreadable / permission error — treat as "nothing to
    // report" rather than failing the whole scan.
    return [];
  }
}

export async function scanFiles(
  filePaths: string[]
): Promise<{ file: string; issues: ScanResult[] }[]> {
  const out: { file: string; issues: ScanResult[] }[] = [];
  for (const filePath of filePaths) {
    const issues = await scanFile(filePath);
    if (issues.length > 0) out.push({ file: filePath, issues });
  }
  return out;
}

// Recursively enumerate scannable files under a repo root, pruning skip
// directories so we never descend into node_modules/.git/etc. Unreadable
// directories are skipped silently.
export async function walkRepoFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const recurse = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await recurse(full);
      } else if (entry.isFile()) {
        if (shouldSkipPath(full)) continue;
        out.push(full);
      }
    }
  };
  await recurse(root);
  return out;
}
