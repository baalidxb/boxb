import { useEffect, useRef } from 'react';
import { useCommandBarStore } from '../store/commandBar';
import { useManagedStore } from '../store/managed';
import type { CommandBarAction } from '@shared/types';

interface Props {
  onExecute: (action: CommandBarAction) => void;
}

// Renders a single result row. Pulled out so the active-row styling stays
// consistent (and so we can later memoize / virtualize the list if it grows).
function ResultRow({
  action,
  active,
  onClick,
  onMouseEnter
}: {
  action: CommandBarAction;
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={[
        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left',
        'border-l-2',
        active
          ? 'bg-[#1A1A1A] border-accent text-fg'
          : 'border-transparent text-fg/90 hover:bg-[#141414]',
        'transition-colors duration-100 ease-out'
      ].join(' ')}
    >
      {action.iconKind === 'service' && action.iconUrl && (
        <img src={action.iconUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
      )}
      {action.iconKind === 'workspace' && (
        <div className="w-6 h-6 rounded-full bg-bg border-[0.5px] border-[#1A1A1A] flex items-center justify-center text-[11px] font-semibold text-accent shrink-0">
          {action.iconChar ?? '?'}
        </div>
      )}
      {action.iconKind === 'system' && (
        <div className="w-6 h-6 rounded-md bg-bg border-[0.5px] border-[#1A1A1A] flex items-center justify-center text-muted shrink-0">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] truncate">{action.label}</div>
        {action.hint && (
          <div className="text-[11px] text-muted truncate">{action.hint}</div>
        )}
      </div>
    </button>
  );
}

export function CommandBar({ onExecute }: Props): JSX.Element | null {
  const open = useCommandBarStore((s) => s.open);
  const query = useCommandBarStore((s) => s.query);
  const results = useCommandBarStore((s) => s.results);
  const selectedIndex = useCommandBarStore((s) => s.selectedIndex);
  const isAIQuerying = useCommandBarStore((s) => s.isAIQuerying);
  const aiAvailable = useCommandBarStore((s) => s.aiAvailable);
  const aiAttempted = useCommandBarStore((s) => s.aiAttempted);
  const setQuery = useCommandBarStore((s) => s.setQuery);
  const moveSelection = useCommandBarStore((s) => s.moveSelection);
  const setSelectedIndex = useCommandBarStore((s) => s.setSelectedIndex);
  const close = useCommandBarStore((s) => s.close);
  const askAI = useCommandBarStore((s) => s.askAI);
  const isManaged = useManagedStore((s) => s.isManaged);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the active row scrolled into view as the user arrow-keys past it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector(`[data-idx="${selectedIndex}"]`);
    if (active && active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results]);

  // Focus the input when the modal opens. The autoFocus attribute alone
  // isn't reliable when the component re-renders; explicit .focus() is.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  const handleSelect = (action: CommandBarAction): void => {
    // Filter out actions that are no-ops in managed mode as a defensive
    // measure (the rule + AI parsers already do this, but a stale result
    // shouldn't slip through).
    if (isManaged && action.type === 'add-custom') {
      close();
      return;
    }
    onExecute(action);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const sel = results[selectedIndex];
      if (sel) {
        handleSelect(sel);
        return;
      }
      // No rule match. If AI is available and we haven't tried yet, fire it.
      if (aiAvailable && !aiAttempted && !isAIQuerying && query.trim().length > 0) {
        void askAI();
      }
    }
  };

  // Footer hint adapts to state. Three messages cover the cases:
  //   - Have results: standard nav hint
  //   - No results, AI available, not yet attempted: prompt to ask AI
  //   - No results, no AI or AI tried: examples / no-match
  let footerHint: string;
  if (results.length > 0) {
    footerHint = '↑↓ navigate · Enter to select · Esc to close';
  } else if (query.trim().length === 0) {
    footerHint = "Try: 'open WhatsApp' · 'switch to Work' · 'open terminal'";
  } else if (aiAvailable && !aiAttempted) {
    footerHint = 'No matches. Press Enter to ask AI.';
  } else if (aiAvailable && aiAttempted) {
    footerHint = 'No matches — AI also came up empty.';
  } else {
    footerHint = "No matches. Try: 'open [service]' · 'switch to [workspace]'";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 animate-cmd-fade"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-[600px] mx-4 bg-surface border border-accent rounded-xl shadow-2xl flex flex-col max-h-[60vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command bar"
      >
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…"
            className={[
              'w-full px-5 py-4 text-[18px] text-fg placeholder:text-muted',
              'bg-transparent border-b-[0.5px] border-b-[#1A1A1A]',
              'focus:outline-none caret-accent'
            ].join(' ')}
            aria-controls="cmd-results"
            aria-activedescendant={`cmd-row-${selectedIndex}`}
          />
          {isAIQuerying && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-accent flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
              Asking AI…
            </div>
          )}
        </div>

        <div
          ref={listRef}
          id="cmd-results"
          role="listbox"
          className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1"
        >
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-muted">
              {query.trim().length === 0 ? 'Type to search…' : 'No matches.'}
            </div>
          ) : (
            results.map((action, i) => (
              <div key={action.id} id={`cmd-row-${i}`} data-idx={i}>
                <ResultRow
                  action={action}
                  active={i === selectedIndex}
                  onClick={() => handleSelect(action)}
                  onMouseEnter={() => setSelectedIndex(i)}
                />
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t-[0.5px] border-t-[#1A1A1A] text-[11px] text-muted">
          {footerHint}
        </div>
      </div>
    </div>
  );
}
