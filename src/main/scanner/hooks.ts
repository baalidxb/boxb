import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { getScannerCliPath } from './cli-path';
import { dlog } from '../debug-log';

// Phase 9.6 (Day 2): git pre-commit hook install/uninstall.
//
// BoxB identifies its own hooks by an embedded marker line so it never
// clobbers or deletes a hook the user wrote by hand. The hook is a tiny
// POSIX-sh wrapper that locates the bundled CLI and runs it over the staged
// files; on Windows it executes under Git Bash, which is why paths inside the
// hook use forward slashes (Git Bash + node both accept them on Windows).

export const BOXB_HOOK_MARKER = 'BOXB_HOOK_MARKER_v1';
const BACKUP_SUFFIX = '.boxb-backup';

// The hook template. {{BOXB_CLI_PATH}} is substituted at install time with
// the resolved CLI path (forward-slashed). Kept as a string constant rather
// than a separate .sh file so it can't drift from the install logic and
// needs no special bundling to survive asar packaging.
const HOOK_TEMPLATE = `#!/bin/sh
# ${BOXB_HOOK_MARKER} — DO NOT REMOVE THIS LINE (BoxB Secret Scanner identifies its own hooks by this marker)

# Find BoxB CLI scanner path
BOXB_CLI=""
for candidate in \\
  "{{BOXB_CLI_PATH}}" \\
  "$HOME/AppData/Local/Programs/BoxB/resources/app.asar.unpacked/out/scanner-cli/index.cjs" \\
  "$LOCALAPPDATA/Programs/BoxB/resources/app.asar.unpacked/out/scanner-cli/index.cjs"
do
  if [ -f "$candidate" ]; then
    BOXB_CLI="$candidate"
    break
  fi
done

if [ -z "$BOXB_CLI" ]; then
  echo "⚠ BoxB Secret Scanner: CLI not found, skipping scan (this is OK — install BoxB to enable)"
  exit 0
fi

# Get staged files (added/copied/modified, not deleted)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Run scanner on staged files. -d '\\n' handles paths containing spaces.
echo "$STAGED_FILES" | xargs -d '\\n' node "$BOXB_CLI"
exit $?
`;

export type HookState = 'none' | 'boxb' | 'foreign';

function hooksDir(repoPath: string): string {
  return join(repoPath, '.git', 'hooks');
}

function hookPath(repoPath: string): string {
  return join(hooksDir(repoPath), 'pre-commit');
}

function backupPath(repoPath: string): string {
  return join(hooksDir(repoPath), `pre-commit${BACKUP_SUFFIX}`);
}

// Classify whatever pre-commit hook currently exists in the repo.
//   none    — no pre-commit hook
//   boxb    — a hook we installed (carries our marker)
//   foreign — a hook the user (or another tool) put there
export function detectExistingHook(repoPath: string): HookState {
  const p = hookPath(repoPath);
  if (!existsSync(p)) return 'none';
  try {
    const content = readFileSync(p, 'utf8');
    return content.includes(BOXB_HOOK_MARKER) ? 'boxb' : 'foreign';
  } catch {
    // Unreadable — treat as foreign so we never silently overwrite it.
    return 'foreign';
  }
}

function buildHookContent(): string {
  // Forward-slash the path: backslashes are escape characters in sh, and
  // both Git Bash's test (`[ -f ... ]`) and node accept forward slashes on
  // Windows.
  const cliPath = getScannerCliPath().replace(/\\/g, '/');
  // Normalize to LF — git on Windows expects hook scripts with LF endings;
  // CRLF can produce "bad interpreter" errors on the shebang line.
  return HOOK_TEMPLATE.replace('{{BOXB_CLI_PATH}}', cliPath).replace(
    /\r\n/g,
    '\n'
  );
}

// Copy a foreign hook aside before we overwrite it. Idempotent: overwrites a
// previous backup if one somehow exists.
export function backupExistingHook(repoPath: string): boolean {
  const p = hookPath(repoPath);
  if (!existsSync(p)) return false;
  try {
    copyFileSync(p, backupPath(repoPath));
    dlog('SCANNER:hook-backed-up', { repoPath });
    return true;
  } catch (err) {
    dlog('SCANNER:hook-backup-failed', {
      repoPath,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}

// Write the BoxB hook, overwriting whatever pre-commit is there. Callers must
// have already backed up a foreign hook (via the confirm flow) if they care
// to preserve it.
export function installHook(repoPath: string): void {
  const dir = hooksDir(repoPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = hookPath(repoPath);
  writeFileSync(p, buildHookContent(), { encoding: 'utf8' });
  try {
    // No-op-ish on Windows but correct on Unix; Git Bash needs the exec bit.
    chmodSync(p, 0o755);
  } catch {
    // chmod can fail on some Windows filesystems — the hook still runs under
    // Git Bash there, so this is non-fatal.
  }
  dlog('SCANNER:hook-installed', { repoPath, cli: getScannerCliPath() });
}

interface UninstallResult {
  // True when we deleted a BoxB hook. False when there was nothing of ours to
  // remove (none) or we deliberately left a foreign hook in place.
  removed: boolean;
  // True when a backed-up foreign hook was restored to pre-commit.
  restored: boolean;
  // True when a non-BoxB hook was found and intentionally preserved.
  foreign: boolean;
}

// Remove the BoxB hook and restore any backup. Respects foreign hooks: if the
// current pre-commit isn't ours (user edited it), we leave it untouched.
export function uninstallHook(repoPath: string): UninstallResult {
  const state = detectExistingHook(repoPath);
  const p = hookPath(repoPath);
  const backup = backupPath(repoPath);

  if (state === 'foreign') {
    dlog('SCANNER:hook-uninstall-skipped-foreign', { repoPath });
    return { removed: false, restored: false, foreign: true };
  }

  if (state === 'none') {
    // No BoxB hook. If a stray backup exists, restore it so we don't strand
    // the user's original hook.
    if (existsSync(backup)) {
      try {
        copyFileSync(backup, p);
        unlinkSync(backup);
        try {
          chmodSync(p, 0o755);
        } catch {
          /* non-fatal */
        }
        dlog('SCANNER:hook-restored-no-current', { repoPath });
        return { removed: false, restored: true, foreign: false };
      } catch {
        return { removed: false, restored: false, foreign: false };
      }
    }
    return { removed: false, restored: false, foreign: false };
  }

  // state === 'boxb' — delete our hook, then restore a backup if present.
  let removed = false;
  try {
    unlinkSync(p);
    removed = true;
  } catch (err) {
    dlog('SCANNER:hook-delete-failed', {
      repoPath,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  let restored = false;
  if (existsSync(backup)) {
    try {
      copyFileSync(backup, p);
      unlinkSync(backup);
      try {
        chmodSync(p, 0o755);
      } catch {
        /* non-fatal */
      }
      restored = true;
    } catch (err) {
      dlog('SCANNER:hook-restore-failed', {
        repoPath,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  dlog('SCANNER:hook-uninstalled', { repoPath, removed, restored });
  return { removed, restored, foreign: false };
}
