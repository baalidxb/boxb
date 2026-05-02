import { useEffect, useState } from 'react';
import { useCommandBarStore } from '../store/commandBar';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SetApiKeyModal({ isOpen, onClose }: Props): JSX.Element | null {
  const aiAvailable = useCommandBarStore((s) => s.aiAvailable);
  const setAiAvailable = useCommandBarStore((s) => s.setAiAvailable);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setKey('');
      setBusy(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (): Promise<void> => {
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await window.boxb.ai.setApiKey(trimmed);
      if (!ok) {
        setError('Failed to save key.');
        setBusy(false);
        return;
      }
      setAiAvailable(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await window.boxb.ai.clearApiKey();
      setAiAvailable(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Anthropic API Key"
      >
        <h2 className="text-lg font-medium text-fg">Anthropic API Key</h2>
        <p className="mt-1 text-[13px] text-muted">
          The command bar uses your key to fall back to Claude when no
          built-in rule matches. Get a key at{' '}
          <span className="text-fg/80 font-mono">console.anthropic.com</span>.
          Stored locally — never transmitted except to Anthropic.
        </p>

        <div className="mt-5">
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="ai-key">
            API key
          </label>
          <input
            id="ai-key"
            autoFocus
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={aiAvailable ? '•••••••••••••••• (existing key set)' : 'sk-ant-…'}
            disabled={busy}
            className={[
              'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted font-mono',
              'bg-bg border-[0.5px] border-[#1A1A1A]',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'disabled:opacity-50'
            ].join(' ')}
          />
          {aiAvailable && (
            <p className="mt-1 text-[11px] text-muted">
              An API key is already stored. Enter a new value to replace it,
              or clear it below.
            </p>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-[#3A0F0F] border-[0.5px] border-[#5C1818] p-3 text-[12px] text-[#F87171]">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          {/* Clear is only useful when there's something to clear. Keeps
              the destructive action separate from primary save. */}
          {aiAvailable ? (
            <button
              type="button"
              onClick={() => {
                void handleClear();
              }}
              disabled={busy}
              className={[
                'px-3 py-2 rounded-lg text-xs font-medium',
                'text-[#F87171] hover:bg-[#3A0F0F]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]',
                'disabled:opacity-50'
              ].join(' ')}
            >
              Clear stored key
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
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
                void handleSave();
              }}
              disabled={busy || key.trim().length === 0}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-accent text-bg',
                'transition-opacity duration-150 hover:opacity-90',
                'disabled:opacity-40 disabled:cursor-default disabled:hover:opacity-40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              ].join(' ')}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
