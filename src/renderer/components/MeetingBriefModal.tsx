import { useEffect } from 'react';
import { useCalendarStore } from '../store/calendar';
import { CalendarIcon, CloseIcon } from './Icons';

// Phase 9.9: meeting brief modal. Self-gates on the calendar store's
// briefEvent. Shows event details immediately; the AI prep note streams
// in after (generated on open — user chose on-click generation, and
// opening the brief IS the click).

function whenLabel(start: number, end: number, allDay: boolean): string {
  const d = new Date(start);
  const dayPart = d.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
  if (allDay) return `${dayPart} — all day`;
  const fmt = (t: number): string =>
    new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dayPart}, ${fmt(start)} – ${fmt(end)}`;
}

export function MeetingBriefModal(): JSX.Element | null {
  const briefEvent = useCalendarStore((s) => s.briefEvent);
  const briefText = useCalendarStore((s) => s.briefText);
  const briefLoading = useCalendarStore((s) => s.briefLoading);
  const briefError = useCalendarStore((s) => s.briefError);
  const closeBrief = useCalendarStore((s) => s.closeBrief);
  const generateBrief = useCalendarStore((s) => s.generateBrief);

  // Kick off AI generation whenever a new event opens.
  useEffect(() => {
    if (briefEvent) void generateBrief();
  }, [briefEvent, generateBrief]);

  if (!briefEvent) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={closeBrief}
      role="presentation"
    >
      <div
        className={[
          'w-full max-w-[520px] mx-4 max-h-[80vh] flex flex-col',
          'bg-surface border border-accent rounded-xl shadow-2xl overflow-hidden'
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Meeting brief"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b-[0.5px] border-b-[#1A1A1A]">
          <div className="flex items-start gap-2.5 min-w-0">
            <CalendarIcon size={18} className="text-accent mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-[15px] font-medium text-fg break-words">
                {briefEvent.title}
              </h1>
              <p className="text-[12px] text-muted mt-0.5">
                {whenLabel(briefEvent.start, briefEvent.end, briefEvent.allDay)}
              </p>
              {briefEvent.location && (
                <p className="text-[12px] text-muted mt-0.5 truncate">
                  {briefEvent.location}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={closeBrief}
            aria-label="Close brief"
            className={[
              'flex items-center justify-center text-muted rounded shrink-0 ml-3',
              'transition-colors duration-150 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {briefEvent.attendees.length > 0 && (
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                Attendees
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {briefEvent.attendees.map((a) => (
                  <span
                    key={a}
                    className="px-2 py-1 rounded-full bg-bg border-[0.5px] border-[#1A1A1A] text-[11px] text-fg/90"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {briefEvent.description && (
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                Details
              </h2>
              <p className="text-[13px] text-fg/90 leading-relaxed whitespace-pre-wrap break-words max-h-[140px] overflow-y-auto">
                {briefEvent.description}
              </p>
            </div>
          )}

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-1.5">
              AI Prep
            </h2>
            {briefLoading && (
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                Writing your brief…
              </div>
            )}
            {!briefLoading && briefText && (
              <p className="text-[13px] text-fg leading-relaxed whitespace-pre-wrap break-words">
                {briefText}
              </p>
            )}
            {!briefLoading && !briefText && briefError && (
              <p className="text-[12px] text-muted">{briefError}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t-[0.5px] border-t-[#1A1A1A] text-[11px] text-muted">
          Esc to close
        </div>
      </div>
    </div>
  );
}
