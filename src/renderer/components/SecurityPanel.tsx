import { useEffect } from 'react';
import { useScannerStore } from '../store/scanner';
import type { ScanSeverity } from '@shared/types';
import { CloseIcon, PlusIcon, ShieldIcon } from './Icons';
import { ReplaceHookConfirmModal } from './ReplaceHookConfirmModal';

// Phase 9.6: the "Security" view. Rendered over the service area when the
// sidebar shield is toggled on. Day 1 supports manual full-repo scans only;
// git-hook wiring and per-pattern ignores arrive in Day 2.

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Never scanned';
  try {
    return `Last scan: ${new Date(ts).toLocaleString()}`;
  } catch {
    return 'Last scan: unknown';
  }
}

const SEVERITY_STYLES: Record<ScanSeverity, string> = {
  high: 'text-[#F87171] border-[#5C1818] bg-[#3A0F0F]',
  medium: 'text-accent border-accent/30 bg-accent/10',
  low: 'text-muted border-[#1A1A1A] bg-bg'
};

function SeverityBadge({ severity }: { severity: ScanSeverity }): JSX.Element {
  return (
    <span
      className={[
        'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border-[0.5px]',
        SEVERITY_STYLES[severity]
      ].join(' ')}
    >
      {severity}
    </span>
  );
}

export function SecurityPanel(): JSX.Element {
  const repos = useScannerStore((s) => s.repos);
  const scanningRepoId = useScannerStore((s) => s.scanningRepoId);
  const lastScanReport = useScannerStore((s) => s.lastScanReport);
  const addError = useScannerStore((s) => s.addError);
  const notice = useScannerStore((s) => s.notice);
  const noticeTone = useScannerStore((s) => s.noticeTone);
  const closePanel = useScannerStore((s) => s.closePanel);
  const pickAndAddRepo = useScannerStore((s) => s.pickAndAddRepo);
  const removeRepo = useScannerStore((s) => s.removeRepo);
  const scanRepo = useScannerStore((s) => s.scanRepo);
  const clearMessages = useScannerStore((s) => s.clearMessages);

  // Clear any stale messages each time the panel mounts (it's mounted fresh
  // on open since App gates it behind panelOpen).
  useEffect(() => {
    clearMessages();
  }, [clearMessages]);

  const busy = scanningRepoId !== null;

  return (
    <div className="absolute inset-0 z-20 bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b-[0.5px] border-b-[#1A1A1A]">
        <div className="flex items-center gap-2.5">
          <ShieldIcon size={20} className="text-accent" />
          <div>
            <h1 className="text-base font-medium text-fg">Security</h1>
            <p className="text-[12px] text-muted">
              Scan protected repositories for committed secrets.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close security panel"
          className={[
            'flex items-center justify-center text-muted rounded',
            'transition-colors duration-150 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          ].join(' ')}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 flex items-center gap-3 border-b-[0.5px] border-b-[#1A1A1A]">
        <button
          type="button"
          onClick={() => void pickAndAddRepo()}
          disabled={busy}
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
            'bg-accent text-bg transition-opacity duration-150 hover:opacity-90',
            'disabled:opacity-40 disabled:cursor-default',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          ].join(' ')}
        >
          <PlusIcon size={16} />
          Add Repo
        </button>
        {addError && (
          <span className="text-[12px] text-[#F87171] flex-1 min-w-0 leading-snug">
            {addError}
          </span>
        )}
        {!addError && notice && (
          <span
            className={[
              'text-[12px] flex-1 min-w-0 leading-snug',
              noticeTone === 'gold' ? 'text-accent' : 'text-muted'
            ].join(' ')}
          >
            {notice}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {repos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <ShieldIcon size={40} className="text-muted/40" />
            <p className="mt-4 text-sm text-muted max-w-[320px]">
              No repos protected yet. Click{' '}
              <span className="text-fg font-medium">Add Repo</span> to add your
              first one.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="rounded-lg border-[0.5px] border-[#1A1A1A] bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg truncate">
                      {repo.name}
                    </div>
                    <div className="text-[12px] text-muted truncate font-mono">
                      {repo.path}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {scanningRepoId === repo.id
                        ? 'Scanning…'
                        : formatTimestamp(repo.lastScanAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void scanRepo(repo.id)}
                      disabled={busy}
                      className={[
                        'px-3 py-1.5 rounded-md text-[12px] font-medium',
                        'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
                        'transition-colors duration-150 hover:border-accent hover:text-accent',
                        'disabled:opacity-40 disabled:cursor-default disabled:hover:text-fg disabled:hover:border-[#1A1A1A]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                      ].join(' ')}
                    >
                      {scanningRepoId === repo.id ? 'Scanning…' : 'Scan Now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeRepo(repo.id)}
                      disabled={busy}
                      className={[
                        'px-3 py-1.5 rounded-md text-[12px] font-medium',
                        'text-[#F87171] hover:bg-[#3A0F0F]',
                        'transition-colors duration-150',
                        'disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]'
                      ].join(' ')}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scan results for the most recent scan */}
        {lastScanReport && (
          <div className="mt-6">
            <div className="text-[12px] text-muted mb-2">
              {lastScanReport.totalIssues === 0 ? (
                <span className="text-[#4ADE80]">
                  ✓ No secrets found in{' '}
                  <span className="font-mono">{lastScanReport.repo}</span>.
                </span>
              ) : (
                <span className="text-[#F87171]">
                  ✗ {lastScanReport.totalIssues} issue(s) found across{' '}
                  {lastScanReport.files.length} file(s).
                </span>
              )}
            </div>
            {lastScanReport.totalIssues > 0 && (
              <div className="space-y-3">
                {lastScanReport.files.map((file) => (
                  <div
                    key={file.path}
                    className="rounded-lg border-[0.5px] border-[#1A1A1A] bg-surface p-3"
                  >
                    <div className="text-[12px] font-mono text-fg/90 truncate mb-2">
                      {file.path}
                    </div>
                    <div className="space-y-1.5">
                      {file.issues.map((issue, i) => (
                        <div
                          key={`${issue.patternId}-${issue.line}-${issue.col}-${i}`}
                          className="flex items-center gap-2 text-[12px]"
                        >
                          <SeverityBadge severity={issue.severity} />
                          <span className="text-fg">{issue.patternName}</span>
                          <span className="text-muted">
                            line {issue.line}:{issue.col}
                          </span>
                          <span className="text-muted font-mono">
                            {issue.snippet}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Replace-existing-hook confirmation. Self-gates on pendingConflictPath. */}
      <ReplaceHookConfirmModal />
    </div>
  );
}
