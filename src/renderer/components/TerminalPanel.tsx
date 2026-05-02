import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  TERMINAL_MAX_FRACTION,
  TERMINAL_MIN_HEIGHT,
  useTerminalStore
} from '../store/terminal';
import { TerminalTabView } from './TerminalTab';
import { PlusIcon } from './Icons';

// Top edge resize handle. 1px hairline that grows to a 4px hot-zone.
function ResizeHandle({
  onDragStart
}: {
  onDragStart: (clientY: number) => void;
}): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal panel"
      onMouseDown={(e) => {
        e.preventDefault();
        onDragStart(e.clientY);
      }}
      // Hit zone is 5px tall but only the bottom 1px paints; gives a
      // generous grab target without a visible thick line.
      className="absolute -top-[2px] left-0 right-0 h-[5px] cursor-ns-resize z-10 group"
    >
      <div className="absolute bottom-0 left-0 right-0 h-px bg-accent transition-opacity duration-150 ease-out group-hover:opacity-100 opacity-80" />
    </div>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M2 2 L8 8 M8 2 L2 8" />
    </svg>
  );
}

export const TerminalPanel = forwardRef<HTMLDivElement>(
  function TerminalPanel(_, panelRef): JSX.Element | null {
    const open = useTerminalStore((s) => s.open);
    const height = useTerminalStore((s) => s.height);
    const tabs = useTerminalStore((s) => s.tabs);
    const activeTabId = useTerminalStore((s) => s.activeTabId);
    const setActiveTab = useTerminalStore((s) => s.setActiveTab);
    const closeTab = useTerminalStore((s) => s.closeTab);
    const addTab = useTerminalStore((s) => s.addTab);
    const setHeight = useTerminalStore((s) => s.setHeight);

    const [draftHeight, setDraftHeight] = useState<number | null>(null);
    const dragStateRef = useRef<{
      startY: number;
      startHeight: number;
    } | null>(null);

    const handleDragStart = useCallback(
      (clientY: number) => {
        dragStateRef.current = { startY: clientY, startHeight: height };
        setDraftHeight(height);
        const onMove = (ev: MouseEvent): void => {
          const drag = dragStateRef.current;
          if (!drag) return;
          // Window-relative max so the panel can never push the services
          // area below 80px tall (header + sidebar still need room).
          const winH = window.innerHeight;
          const max = Math.floor(winH * TERMINAL_MAX_FRACTION);
          const delta = drag.startY - ev.clientY;
          const next = Math.min(
            max,
            Math.max(TERMINAL_MIN_HEIGHT, drag.startHeight + delta)
          );
          setDraftHeight(next);
        };
        const onUp = (): void => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          const drag = dragStateRef.current;
          dragStateRef.current = null;
          // Commit only if a real change occurred — avoids a no-op persist
          // when the user just clicks the handle.
          setDraftHeight((current) => {
            if (current !== null && drag && current !== drag.startHeight) {
              setHeight(current);
            }
            return null;
          });
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      [height, setHeight]
    );

    // Cleanup any dangling listeners if the panel unmounts mid-drag.
    useEffect(() => {
      return () => {
        dragStateRef.current = null;
      };
    }, []);

    if (!open) return null;

    const effectiveHeight = draftHeight ?? height;

    return (
      <div
        ref={panelRef}
        // tabIndex makes the panel root focusable so document.activeElement
        // can land on it (e.g. via setActiveTab → focus()) and the App-
        // level keyboard handler can detect terminal focus.
        tabIndex={-1}
        // 200ms slide-in animation only on first open — once open, height
        // changes track the drag in real time so transitioning would lag.
        // We accept a single jump rather than animating the size mid-drag.
        style={{ height: effectiveHeight }}
        className="relative flex flex-col bg-surface border-t border-accent shrink-0 outline-none"
        aria-label="Terminal"
      >
        <ResizeHandle onDragStart={handleDragStart} />

        {/* Tab bar */}
        <div className="flex items-center bg-[#0A0A0A] border-b border-[#1A1A1A] h-[32px] shrink-0 px-1 select-none">
          <div className="flex items-end gap-px overflow-x-auto flex-1 min-w-0 scrollbar-thin">
            {tabs.map((t) => {
              const isActive = t.id === activeTabId;
              return (
                <div
                  key={t.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(t.id)}
                  onAuxClick={(e) => {
                    // Middle-click closes a tab — same as most modern
                    // terminals/browsers. Aux button index 1 = middle.
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(t.id);
                    }
                  }}
                  className={[
                    'group flex items-center gap-2 px-3 h-[28px] text-[12px] cursor-pointer max-w-[200px] shrink-0',
                    'border-b-2',
                    isActive
                      ? 'bg-surface text-fg border-accent'
                      : 'bg-transparent text-muted hover:text-fg border-transparent'
                  ].join(' ')}
                  title={t.title}
                >
                  <span className="truncate">{t.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                    aria-label={`Close ${t.title}`}
                    className={[
                      'flex items-center justify-center w-4 h-4 rounded',
                      'text-muted hover:text-accent hover:bg-[#1A1A1A]',
                      'transition-colors duration-100 ease-out',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent'
                    ].join(' ')}
                  >
                    <CloseIcon />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              void addTab();
            }}
            aria-label="New terminal tab"
            title="New terminal tab (Ctrl+Shift+` or Ctrl+Shift+J)"
            className={[
              'flex items-center justify-center w-7 h-7 rounded ml-1 shrink-0',
              'text-muted hover:text-accent hover:bg-[#1A1A1A]',
              'transition-colors duration-100 ease-out',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent'
            ].join(' ')}
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {/* Tab content area. Each tab stays mounted (display:none on
            inactive) so xterm buffers/scrollback survive switches. */}
        <div className="relative flex-1 min-h-0">
          {tabs.map((t) => (
            <TerminalTabView key={t.id} tab={t} isActive={t.id === activeTabId} />
          ))}
        </div>
      </div>
    );
  }
);
