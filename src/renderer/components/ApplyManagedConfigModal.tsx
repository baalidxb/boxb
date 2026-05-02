import { useState } from 'react';
import type { ManagedConfigFile } from '@shared/types';
import { useManagedStore } from '../store/managed';

interface Props {
  config: ManagedConfigFile;
  // True when the install is already managed AND the new config has a
  // different name from the current one. Changes the modal copy so the
  // user understands their current managed setup will be overwritten.
  isReplace: boolean;
  onClose: () => void;
}

export function ApplyManagedConfigModal({ config, isReplace, onClose }: Props): JSX.Element {
  const applyConfig = useManagedStore((s) => s.applyConfig);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsCount = config.workspaces.length;
  const svcCount = config.services.length;

  const handleApply = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await applyConfig(config);
      // Tell main to move the source file out of the drop folder so it
      // doesn't re-prompt next launch.
      try {
        await window.boxb.managed.applyConfig();
      } catch {
        // applied IPC failure is non-fatal; managed state is already saved.
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const handleCancel = async (): Promise<void> => {
    if (busy) return;
    try {
      await window.boxb.managed.cancelConfig();
    } catch {
      // best effort — main may already have cleared pending state
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Apply Managed Configuration"
      >
        <h2 className="text-lg font-medium text-fg">
          {isReplace ? 'Replace managed configuration?' : 'Apply managed configuration?'}
        </h2>
        <div className="mt-1 text-[13px] text-muted">
          <div className="text-accent font-medium">{config.name}</div>
          <div className="mt-2">
            This will replace your current services with the managed setup
            ({svcCount} service{svcCount === 1 ? '' : 's'}, {wsCount} workspace
            {wsCount === 1 ? '' : 's'}). Existing services will be removed. Once
            applied, you cannot add or remove services without help from your admin.
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-[#3A0F0F] border-[0.5px] border-[#5C1818] p-3 text-[12px] text-[#F87171]">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCancel();
            }}
            disabled={busy}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
              'transition-colors duration-150 hover:bg-[#1A1A1A]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:opacity-50'
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleApply();
            }}
            disabled={busy}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-accent text-bg',
              'transition-opacity duration-150 hover:opacity-90',
              'disabled:opacity-40 disabled:cursor-default disabled:hover:opacity-40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            {busy ? 'Applying…' : isReplace ? 'Replace' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
