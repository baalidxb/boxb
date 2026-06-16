import { useScannerStore } from '../store/scanner';

// Phase 9.6 (Day 2): shown when the user tries to protect a repo that already
// has a non-BoxB pre-commit hook. Confirming backs the existing hook up to
// pre-commit.boxb-backup and installs the BoxB hook; cancelling aborts the
// add entirely (the repo is NOT added and the existing hook is left as-is).

export function ReplaceHookConfirmModal(): JSX.Element | null {
  const pendingConflictPath = useScannerStore((s) => s.pendingConflictPath);
  const confirmReplaceHook = useScannerStore((s) => s.confirmReplaceHook);
  const cancelReplaceHook = useScannerStore((s) => s.cancelReplaceHook);

  if (!pendingConflictPath) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 animate-cmd-fade"
      onClick={cancelReplaceHook}
      role="presentation"
    >
      <div
        className="w-full max-w-[460px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Replace existing pre-commit hook"
      >
        <h2 className="text-lg font-medium text-fg">Existing pre-commit hook</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          This repo already has a pre-commit hook. Replace it? Your existing
          hook will be backed up to{' '}
          <span className="font-mono text-fg/80">pre-commit.boxb-backup</span>{' '}
          and restored if you later remove the repo from BoxB.
        </p>
        <p className="mt-3 text-[12px] font-mono text-muted truncate">
          {pendingConflictPath}
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancelReplaceHook}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
              'transition-colors duration-150 hover:bg-[#1A1A1A]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmReplaceHook()}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium bg-accent text-bg',
              'transition-opacity duration-150 hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
