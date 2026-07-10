import { useOnboardingStore, type HelpTab } from '../store/onboarding';
import { CloseIcon } from './Icons';

// Phase 9.5: "?" help modal. Two tabs — a re-runnable Quick Tour and a
// keyboard-shortcuts cheatsheet. Both tab panels stay mounted (toggled with
// `hidden`) so each keeps its own scroll position when the user flips back
// and forth, per the design spec.

interface Shortcut {
  keys: string;
  desc: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

// Mirrors the global keydown handler in App.tsx. Keep in sync when shortcuts
// change there.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { keys: 'Ctrl+K', desc: 'Open the command bar' },
      { keys: 'Ctrl+1 – 9', desc: 'Jump to a service by position' },
      { keys: 'Esc', desc: 'Close menus, modals & overlays' }
    ]
  },
  {
    title: 'AI & Productivity',
    items: [
      { keys: 'Ctrl+Shift+K', desc: 'Ask AI about any text (Context Bridge)' },
      { keys: 'Right-click', desc: '"Ask AI about selection" on selected text' },
      { keys: 'Ctrl+K → remind…', desc: '"remind me to call Ali at 5pm"' }
    ]
  },
  {
    title: 'Workspaces',
    items: [
      { keys: 'Ctrl+Shift+]', desc: 'Next workspace' },
      { keys: 'Ctrl+Shift+[', desc: 'Previous workspace' },
      { keys: 'Ctrl+N', desc: 'Open a new BoxB window' }
    ]
  },
  {
    title: 'Terminal',
    items: [
      { keys: 'Ctrl+J  ·  Ctrl+`', desc: 'Toggle the terminal panel' },
      { keys: 'Ctrl+Shift+J', desc: 'New terminal tab' },
      { keys: 'Ctrl+Tab', desc: 'Cycle terminal tabs' },
      { keys: 'Ctrl+W', desc: 'Close the current terminal tab' }
    ]
  }
];

function TabButton({
  tab,
  label,
  active,
  onClick
}: {
  tab: HelpTab;
  label: string;
  active: boolean;
  onClick: (tab: HelpTab) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={[
        'relative px-1 pb-2 text-[13px] font-medium transition-colors duration-150',
        active ? 'text-fg' : 'text-muted hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm'
      ].join(' ')}
    >
      {label}
      {active && (
        <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-accent rounded-full" />
      )}
    </button>
  );
}

export function HelpModal(): JSX.Element | null {
  const helpOpen = useOnboardingStore((s) => s.helpOpen);
  const helpTab = useOnboardingStore((s) => s.helpTab);
  const setHelpTab = useOnboardingStore((s) => s.setHelpTab);
  const closeHelp = useOnboardingStore((s) => s.closeHelp);
  const startTutorial = useOnboardingStore((s) => s.startTutorial);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 animate-cmd-fade"
      onClick={closeHelp}
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] mx-4 max-h-[60vh] bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Help & shortcuts"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-medium text-fg">Help</h2>
          <button
            type="button"
            onClick={closeHelp}
            aria-label="Close"
            className={[
              'flex items-center justify-center text-muted rounded',
              'transition-colors duration-150 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="flex items-center gap-5 px-5 mt-3 border-b-[0.5px] border-b-[#1A1A1A]">
          <TabButton
            tab="tour"
            label="Quick Tour"
            active={helpTab === 'tour'}
            onClick={setHelpTab}
          />
          <TabButton
            tab="shortcuts"
            label="Keyboard Shortcuts"
            active={helpTab === 'shortcuts'}
            onClick={setHelpTab}
          />
        </div>

        {/* Quick Tour panel */}
        <div
          className={[
            'flex-1 min-h-0 overflow-y-auto px-5 py-5',
            helpTab === 'tour' ? '' : 'hidden'
          ].join(' ')}
        >
          <p className="text-[13px] leading-relaxed text-muted">
            A quick 60-second walkthrough of the BoxB essentials — adding
            services, workspaces, the system tray, and the command bar.
          </p>
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-semibold tracking-wider uppercase text-muted">
              New in v0.2.0
            </div>
            <p className="text-[13px] leading-relaxed text-fg/90">
              <span className="text-accent">Reminders &amp; Tasks</span> — bell
              icon in the sidebar, or type &ldquo;remind me to…&rdquo; in Ctrl+K.
            </p>
            <p className="text-[13px] leading-relaxed text-fg/90">
              <span className="text-accent">Calendar</span> — calendar icon in
              the sidebar; paste your Google/Outlook secret ICS link once and
              see all events in one agenda.
            </p>
            <p className="text-[13px] leading-relaxed text-fg/90">
              <span className="text-accent">Meeting Briefs</span> — a toast 15
              minutes before each meeting; click it for details and AI prep
              notes.
            </p>
            <p className="text-[13px] leading-relaxed text-fg/90">
              <span className="text-accent">Ask AI</span> — select text in any
              service, right-click → &ldquo;Ask AI about selection&rdquo; to
              summarize, translate, or draft a reply.
            </p>
          </div>
          <button
            type="button"
            onClick={startTutorial}
            className={[
              'mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-bg',
              'transition-opacity duration-150 hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            Replay tutorial
          </button>
        </div>

        {/* Keyboard Shortcuts panel */}
        <div
          className={[
            'flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-5',
            helpTab === 'shortcuts' ? '' : 'hidden'
          ].join(' ')}
        >
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-[11px] font-semibold tracking-wider uppercase text-muted mb-2">
                {group.title}
              </div>
              <div className="space-y-1.5">
                {group.items.map((s) => (
                  <div key={s.keys} className="flex items-baseline gap-4">
                    <span className="font-mono text-[12px] text-accent whitespace-nowrap w-[140px] shrink-0">
                      {s.keys}
                    </span>
                    <span className="text-[13px] text-fg">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
