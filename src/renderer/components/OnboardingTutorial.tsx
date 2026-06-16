import { useEffect, useState, type CSSProperties } from 'react';
import { useOnboardingStore, TOTAL_STEPS } from '../store/onboarding';

// Phase 9.5: first-launch interactive tour. Four short steps, each dimming
// the window and (where possible) spotlighting one UI element. Targets are
// located by `data-tour` attributes so this component doesn't have to thread
// refs through Sidebar/TopBar. Steps with no target render a centered or
// corner tooltip (e.g. the command bar is a modal with nothing to point at,
// and the system tray lives outside the BoxB window entirely).

type Placement = 'right' | 'corner' | 'center';

interface StepDef {
  // CSS selector for the element to spotlight, or null for no spotlight.
  target: string | null;
  placement: Placement;
  text: string;
}

const STEPS: StepDef[] = [
  {
    target: '[data-tour="add-service"]',
    placement: 'right',
    text: 'Click + to add a service like WhatsApp, Telegram, Slack, or any custom URL. You can add as many as you need.'
  },
  {
    target: '[data-tour="workspaces"]',
    placement: 'right',
    text: 'Workspaces let you organize services by context — Work, Personal, Client A, etc. Right-click any workspace to rename or open it in its own window.'
  },
  {
    target: null,
    placement: 'corner',
    text: "Closing the window doesn't quit BoxB — it stays running in the system tray near your clock. Click the tray icon anytime to bring BoxB back."
  },
  {
    target: null,
    placement: 'center',
    text: 'Press Ctrl+K anytime to open the command bar. Search for any service, switch workspaces, or add new services instantly. This is the fastest way to navigate BoxB.'
  }
];

const TOOLTIP_WIDTH = 320;
const SPOTLIGHT_PAD = 6;
const GAP = 16;
const MARGIN = 16;
// Approximate tooltip height used only for vertical clamping so the card
// never spills off the bottom edge. The real height varies with text length;
// this is deliberately generous.
const APPROX_TOOLTIP_H = 220;

function computeTooltipStyle(
  placement: Placement,
  rect: DOMRect | null
): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (placement === 'center' || !rect) {
    if (placement === 'corner') {
      return { right: MARGIN, bottom: MARGIN, width: TOOLTIP_WIDTH };
    }
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: TOOLTIP_WIDTH
    };
  }

  if (placement === 'corner') {
    return { right: MARGIN, bottom: MARGIN, width: TOOLTIP_WIDTH };
  }

  // 'right' — place beside the spotlight, flipping to the left if there
  // isn't room, and clamping vertically so it stays on screen.
  let left = rect.right + GAP;
  if (left + TOOLTIP_WIDTH + MARGIN > vw) {
    left = Math.max(MARGIN, rect.left - GAP - TOOLTIP_WIDTH);
  }
  let top = rect.top;
  top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - APPROX_TOOLTIP_H));
  return { left, top, width: TOOLTIP_WIDTH };
}

export function OnboardingTutorial(): JSX.Element | null {
  const tutorialOpen = useOnboardingStore((s) => s.tutorialOpen);
  const step = useOnboardingStore((s) => s.step);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const finishTutorial = useOnboardingStore((s) => s.finishTutorial);

  const [rect, setRect] = useState<DOMRect | null>(null);

  // Measure the current step's target. Retries once after 500ms if the
  // element isn't in the DOM yet (initial-mount race), then gives up and
  // falls back to a no-spotlight centered tooltip so the step still shows.
  useEffect(() => {
    if (!tutorialOpen) return;
    const def = STEPS[step];
    if (!def || !def.target) {
      setRect(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = (attempt: number): void => {
      const el = document.querySelector(def.target as string);
      if (el) {
        setRect(el.getBoundingClientRect());
        return;
      }
      if (attempt === 0) {
        timer = setTimeout(() => measure(1), 500);
      } else {
        setRect(null);
      }
    };
    measure(0);

    const onResize = (): void => measure(0);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
    };
  }, [tutorialOpen, step]);

  if (!tutorialOpen) return null;

  const def = STEPS[step];
  if (!def) return null;

  const isLast = step === TOTAL_STEPS - 1;
  const tooltipStyle = computeTooltipStyle(def.placement, rect);

  const handleNext = (): void => {
    if (isLast) {
      void finishTutorial();
    } else {
      nextStep();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] animate-cmd-fade"
      role="dialog"
      aria-modal="true"
      aria-label="BoxB tutorial"
    >
      {/* Dim layer + spotlight. When a target rect exists we use the
          box-shadow trick: a transparent cutout with a massive spread that
          darkens everything else. Otherwise a flat full-screen dim. Both are
          pointer-events-none; the wrapper below catches clicks so the app
          underneath stays inert during the tour. */}
      <div className="absolute inset-0" aria-hidden="true">
        {rect ? (
          <div
            className="absolute rounded-lg pointer-events-none transition-all duration-200 ease-out"
            style={{
              top: rect.top - SPOTLIGHT_PAD,
              left: rect.left - SPOTLIGHT_PAD,
              width: rect.width + SPOTLIGHT_PAD * 2,
              height: rect.height + SPOTLIGHT_PAD * 2,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
              border: '1px solid #D4AF37'
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/70 pointer-events-none" />
        )}
      </div>

      {/* Tooltip card. role="dialog" on a direct child triggers the shared
          cmd-pop entrance once; transition handles between-step movement. */}
      <div
        className="absolute bg-surface border border-accent rounded-xl shadow-2xl p-4 transition-[left,top] duration-200 ease-out"
        style={tooltipStyle}
        role="dialog"
        aria-label={`Tutorial step ${step + 1}`}
      >
        <div className="text-[11px] font-medium tracking-wider uppercase text-muted">
          {step + 1} of {TOTAL_STEPS}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-fg">{def.text}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void finishTutorial()}
            className={[
              'px-2.5 py-1.5 rounded-md text-[12px] font-medium text-muted',
              'transition-colors duration-150 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            Skip Tutorial
          </button>
          <button
            type="button"
            onClick={handleNext}
            className={[
              'px-4 py-1.5 rounded-md text-[13px] font-medium bg-accent text-bg',
              'transition-opacity duration-150 hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
