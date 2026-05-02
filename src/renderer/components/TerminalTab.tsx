import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import type { TerminalTab } from '@shared/types';
import { useTerminalStore } from '../store/terminal';

interface Props {
  tab: TerminalTab;
  isActive: boolean;
}

// xterm theme reuses BoxB's surface/fg/accent tokens. Selection alpha is
// gold at ~25% so highlights read against the dark surface without losing
// the underlying glyphs.
const XTERM_THEME = {
  background: '#0F0F0F',
  foreground: '#FFFFFF',
  cursor: '#D4AF37',
  cursorAccent: '#0F0F0F',
  selectionBackground: 'rgba(212, 175, 55, 0.3)',
  selectionForeground: '#FFFFFF'
} as const;

const FONT_FAMILY = '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace';

export function TerminalTabView({ tab, isActive }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const handleTabExited = useTerminalStore((s) => s.handleTabExited);

  // Mount: create xterm + addons, attach to container, wire IPC. Runs once
  // per tab (per ptyId). The xterm instance survives tab visibility flips
  // — only the parent's display style changes — so buffers stay intact.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      // Keep a generous scrollback so users can review long output. xterm
      // caps each cell at a few bytes, so 5k lines is well under a MB.
      scrollback: 5000,
      allowProposedApi: false,
      // Default macOS Option behavior on Windows is irrelevant; explicit
      // for safety.
      macOptionIsMeta: false
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    // Initial fit. The container has its laid-out size by the time this
    // effect runs since useEffect fires after layout. If container is
    // hidden (display:none) at mount, xterm picks up size from the parent's
    // computed values; we re-fit on visibility flip in a separate effect.
    try {
      fit.fit();
      const { cols, rows } = term;
      window.boxb.terminal.resize({ ptyId: tab.ptyId, cols, rows });
    } catch {
      // pre-layout edge case — the resize observer below picks it up.
    }

    // User input → pty
    const onDataDisp = term.onData((data) => {
      window.boxb.terminal.write({ ptyId: tab.ptyId, data });
    });

    // Intercept keys our App-level handler owns so xterm doesn't also send
    // them to the shell as control bytes (e.g. Ctrl+W = ETB / 0x17).
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const cmdOrCtrl = ev.ctrlKey || ev.metaKey;
      if (!cmdOrCtrl) return true;
      // Ctrl+`: panel toggle. Ctrl+Shift+`: new tab. Ctrl+W: close tab.
      // Ctrl+Tab: cycle tab. All handled at the App.tsx window listener.
      if (ev.key === '`' || ev.key === '~') return false;
      if ((ev.key === 'w' || ev.key === 'W') && !ev.shiftKey) return false;
      if (ev.key === 'Tab') return false;
      return true;
    });

    // pty stdout → xterm. Filter by ptyId since the host receives data
    // events for all of its window's ptys.
    const offData = window.boxb.terminal.onData((payload) => {
      if (payload.ptyId !== tab.ptyId) return;
      term.write(payload.data);
    });
    const offExit = window.boxb.terminal.onExit((payload) => {
      if (payload.ptyId !== tab.ptyId) return;
      handleTabExited(payload.ptyId);
    });

    // Resize observer: container size changes (panel resize, window
    // resize, sidebar reflow) → re-fit + propagate cols/rows to pty.
    const ro = new ResizeObserver(() => {
      // Skip while hidden — display:none gives 0×0 and fit() throws.
      if (!container.isConnected) return;
      const rect = container.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      try {
        fit.fit();
        const { cols, rows } = term;
        if (cols > 0 && rows > 0) {
          window.boxb.terminal.resize({ ptyId: tab.ptyId, cols, rows });
        }
      } catch {
        // transient layout glitch
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      offData();
      offExit();
      onDataDisp.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // tab.ptyId is stable for the lifetime of this component. handleTabExited
    // comes from a stable store ref. No other deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.ptyId]);

  // Re-fit + focus when the tab becomes active. Hidden tabs accumulate
  // bytes from pty fine, but their xterm internal canvas hasn't been laid
  // out so cursor + scroll position need a nudge after they re-appear.
  useEffect(() => {
    if (!isActive) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    // Defer to next frame so display:flex has actually laid out.
    const id = requestAnimationFrame(() => {
      try {
        fit.fit();
        const { cols, rows } = term;
        if (cols > 0 && rows > 0) {
          window.boxb.terminal.resize({ ptyId: tab.ptyId, cols, rows });
        }
        term.focus();
      } catch {
        // ignore
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isActive, tab.ptyId]);

  return (
    <div
      // Hidden tabs stay mounted — display:none is enough to pause render
      // without tearing down the xterm instance.
      style={{ display: isActive ? 'block' : 'none' }}
      className="absolute inset-0 px-2 pt-1"
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
