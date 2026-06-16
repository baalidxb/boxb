// Phase 9.6: standalone secret-scanner CLI. This is the binary git hooks
// will invoke (Day 2). It is fully self-contained — bundled by
// scanner-cli.vite.config.ts into out/scanner-cli/index.cjs with the engine
// + patterns inlined, depending only on Node built-ins. No Electron.
//
// Usage:  node out/scanner-cli/index.cjs <file1> <file2> ...
// Exit:   0 = clean, 1 = secrets found (so a pre-commit hook can abort).

import { scanFiles } from '../main/scanner/engine';

// Minimal ANSI helpers. Disabled automatically when stdout isn't a TTY
// (e.g. captured by a git hook) to avoid leaking escape codes into logs.
const useColor = process.stdout.isTTY === true;
const red = (s: string): string => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
const bold = (s: string): string => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string): string => (useColor ? `\x1b[2m${s}\x1b[0m` : s);

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (process.env.BOXB_SCAN_DEBUG) {
    process.stderr.write(`[scan-dbg] argv files=${JSON.stringify(files)}\n`);
  }
  if (files.length === 0) {
    // Nothing to scan — treat as success so an empty staged set never blocks.
    process.exit(0);
  }

  const results = await scanFiles(files);
  const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);

  if (totalIssues === 0) {
    process.exit(0);
  }

  const lines: string[] = [];
  lines.push(
    red(bold(`✗ BoxB Secret Scanner: ${totalIssues} issue(s) found`))
  );
  lines.push('');
  for (const result of results) {
    for (const issue of result.issues) {
      lines.push(
        `    ${bold(issue.patternName)} detected in ${result.file}:${issue.line}`
      );
      lines.push(`      ${dim(`Snippet: ${issue.snippet}`)}`);
    }
  }
  lines.push('');
  lines.push('Fix the issue(s) and re-commit, OR override with:');
  lines.push('');
  lines.push('    git commit --no-verify');
  lines.push('');
  lines.push(dim('Help: https://boxb.app/docs/secret-scanner'));

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(1);
}

void main();
