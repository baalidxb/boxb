import { useEffect, useRef, useState } from 'react';
import { useBridgeStore, type BridgeActionId } from '../store/bridge';
import { CloseIcon, SparkIcon } from './Icons';

// Phase 9.10: Context Bridge modal. Text in (from a webview selection or
// pasted), one AI action, result out with a Copy button. The "bridge" is
// the user carrying AI output from one service into another.

const ACTIONS: Array<{ id: BridgeActionId; label: string }> = [
  { id: 'summarize', label: 'Summarize' },
  { id: 'translate', label: 'Translate' },
  { id: 'reply', label: 'Draft Reply' },
  { id: 'explain', label: 'Explain' }
];

export function ContextBridgeModal(): JSX.Element | null {
  const open = useBridgeStore((s) => s.open);
  const sourceText = useBridgeStore((s) => s.sourceText);
  const question = useBridgeStore((s) => s.question);
  const lastAction = useBridgeStore((s) => s.lastAction);
  const result = useBridgeStore((s) => s.result);
  const loading = useBridgeStore((s) => s.loading);
  const error = useBridgeStore((s) => s.error);
  const close = useBridgeStore((s) => s.close);
  const setSourceText = useBridgeStore((s) => s.setSourceText);
  const setQuestion = useBridgeStore((s) => s.setQuestion);
  const run = useBridgeStore((s) => s.run);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the source textarea when opened empty (Ctrl+Shift+K paste flow).
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    if (!sourceText) {
      const id = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  if (!open) return null;

  const copyResult = async (): Promise<void> => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — leave the text selectable for manual copy.
    }
  };

  const actionBtn = (id: BridgeActionId, label: string): JSX.Element => (
    <button
      key={id}
      type="button"
      onClick={() => void run(id)}
      disabled={loading}
      className={[
        'px-3 py-1.5 rounded-md text-[12px] font-medium border-[0.5px]',
        'transition-colors duration-150',
        'disabled:opacity-40 disabled:cursor-default',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        lastAction === id
          ? 'text-accent border-accent bg-accent/10'
          : 'text-fg border-[#1A1A1A] bg-bg hover:border-accent hover:text-accent'
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={close}
      role="presentation"
    >
      <div
        className={[
          'w-full max-w-[620px] mx-4 max-h-[85vh] flex flex-col',
          'bg-surface border border-accent rounded-xl shadow-2xl overflow-hidden'
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI about selection"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[0.5px] border-b-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <SparkIcon size={16} className="text-accent" />
            <h1 className="text-[14px] font-medium text-fg">Ask AI</h1>
            <span className="text-[11px] text-muted">Ctrl+Shift+K</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={[
              'flex items-center justify-center text-muted rounded',
              'transition-colors duration-150 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          <textarea
            ref={textareaRef}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Selected text appears here — or paste anything…"
            rows={5}
            maxLength={8000}
            className={[
              'w-full px-3 py-2 rounded-md text-[13px] leading-relaxed text-fg placeholder:text-muted resize-y',
              'bg-bg border-[0.5px] border-[#1A1A1A]',
              'focus:outline-none focus:border-accent caret-accent',
              'max-h-[180px]'
            ].join(' ')}
          />

          <div className="flex flex-wrap items-center gap-2">
            {ACTIONS.map((a) => actionBtn(a.id, a.label))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && question.trim()) void run('custom');
              }}
              placeholder="Or ask your own question about the text…"
              maxLength={500}
              className={[
                'flex-1 min-w-0 px-3 py-2 rounded-md text-[13px] text-fg placeholder:text-muted',
                'bg-bg border-[0.5px] border-[#1A1A1A]',
                'focus:outline-none focus:border-accent caret-accent'
              ].join(' ')}
            />
            <button
              type="button"
              onClick={() => void run('custom')}
              disabled={loading || !question.trim()}
              className={[
                'px-4 py-2 rounded-md text-[12px] font-medium shrink-0',
                'bg-accent text-bg transition-opacity duration-150 hover:opacity-90',
                'disabled:opacity-40 disabled:cursor-default',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              ].join(' ')}
            >
              Ask
            </button>
          </div>

          {/* Result */}
          {loading && (
            <div className="flex items-center gap-2 text-[12px] text-muted pt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
              Thinking…
            </div>
          )}
          {!loading && error && (
            <div className="text-[12px] text-[#F87171] pt-1">{error}</div>
          )}
          {!loading && result && (
            <div className="rounded-lg border-[0.5px] border-accent/40 bg-bg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                  Result
                </span>
                <button
                  type="button"
                  onClick={() => void copyResult()}
                  className={[
                    'px-2.5 py-1 rounded-md text-[11px] font-medium',
                    copied
                      ? 'bg-accent text-bg'
                      : 'bg-surface text-fg border-[0.5px] border-[#1A1A1A] hover:border-accent hover:text-accent',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                  ].join(' ')}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[13px] text-fg leading-relaxed whitespace-pre-wrap break-words select-text">
                {result}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t-[0.5px] border-t-[#1A1A1A] text-[11px] text-muted">
          Right-click selected text in any service → &ldquo;Ask AI about
          selection&rdquo; · Esc to close
        </div>
      </div>
    </div>
  );
}
