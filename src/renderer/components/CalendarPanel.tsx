import { useEffect, useState } from 'react';
import { useCalendarStore } from '../store/calendar';
import type { CalendarEvent, CalendarSource } from '@shared/types';
import { CalendarIcon, CloseIcon, PlusIcon, RefreshIcon, TrashIcon } from './Icons';

// Phase 9.8: the "Calendar" view — merged read-only agenda (today + next
// 7 days) across all subscribed ICS calendars. Same overlay pattern as
// SecurityPanel / RemindersPanel.

const DAY_MS = 86_400_000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      todayStart.getTime()) /
      DAY_MS
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeRange(ev: CalendarEvent): string {
  if (ev.allDay) return 'All day';
  const fmt = (t: number): string =>
    new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return ev.end > ev.start ? `${fmt(ev.start)} – ${fmt(ev.end)}` : fmt(ev.start);
}

// Split multi-day events into one row per day so each agenda day shows
// everything happening on it.
function occurrencesByDay(
  events: CalendarEvent[]
): Map<string, { dayStart: number; events: CalendarEvent[] }> {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const windowEnd = todayStart + 8 * DAY_MS;
  const byDay = new Map<string, { dayStart: number; events: CalendarEvent[] }>();
  for (const ev of events) {
    let dayStart = new Date(ev.start);
    dayStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());
    for (
      let t = dayStart.getTime();
      t < ev.end || t === dayStart.getTime();
      t += DAY_MS
    ) {
      if (t >= ev.end && t !== dayStart.getTime()) break;
      if (t < todayStart || t >= windowEnd) continue;
      const key = dayKey(t);
      const bucket = byDay.get(key) ?? { dayStart: t, events: [] };
      bucket.events.push(ev);
      byDay.set(key, bucket);
    }
  }
  return byDay;
}

export function CalendarPanel(): JSX.Element {
  const sources = useCalendarStore((s) => s.sources);
  const events = useCalendarStore((s) => s.events);
  const statuses = useCalendarStore((s) => s.statuses);
  const loading = useCalendarStore((s) => s.loading);
  const addError = useCalendarStore((s) => s.addError);
  const adding = useCalendarStore((s) => s.adding);
  const closePanel = useCalendarStore((s) => s.closePanel);
  const refresh = useCalendarStore((s) => s.refresh);
  const addSource = useCalendarStore((s) => s.addSource);
  const removeSource = useCalendarStore((s) => s.removeSource);
  const clearAddError = useCalendarStore((s) => s.clearAddError);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    clearAddError();
  }, [clearAddError]);

  const sourceById = new Map<string, CalendarSource>(sources.map((s) => [s.id, s]));
  const failedStatuses = statuses.filter((st) => !st.ok);

  const byDay = occurrencesByDay(events);
  const dayBuckets = [...byDay.values()].sort((a, b) => a.dayStart - b.dayStart);
  for (const bucket of dayBuckets) {
    bucket.events.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start - b.start;
    });
  }

  const submitAdd = async (): Promise<void> => {
    const ok = await addSource(name.trim() || 'Calendar', url);
    if (ok) {
      setName('');
      setUrl('');
      setShowAdd(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b-[0.5px] border-b-[#1A1A1A]">
        <div className="flex items-center gap-2.5">
          <CalendarIcon size={20} className="text-accent" />
          <div>
            <h1 className="text-base font-medium text-fg">Calendar</h1>
            <p className="text-[12px] text-muted">
              All your calendars in one view — today and the next 7 days.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close calendar panel"
          className={[
            'flex items-center justify-center text-muted rounded',
            'transition-colors duration-150 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          ].join(' ')}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Toolbar: subscribed calendars + add + refresh */}
      <div className="px-6 py-3 border-b-[0.5px] border-b-[#1A1A1A]">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setShowAdd((v) => !v);
              clearAddError();
            }}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
              'bg-accent text-bg transition-opacity duration-150 hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            <PlusIcon size={16} />
            Add Calendar
          </button>
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={loading}
            aria-label="Refresh calendars"
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium',
              'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
              'transition-colors duration-150 hover:border-accent hover:text-accent',
              'disabled:opacity-40 disabled:cursor-default',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            <RefreshIcon size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {sources.map((s) => (
            <span
              key={s.id}
              className={[
                'group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full',
                'bg-surface border-[0.5px] border-[#1A1A1A] text-[12px] text-fg'
              ].join(' ')}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
              <button
                type="button"
                onClick={() => void removeSource(s.id)}
                aria-label={`Remove ${s.name}`}
                title="Remove calendar"
                className={[
                  'ml-0.5 flex items-center justify-center rounded',
                  'text-muted/50 group-hover:text-muted hover:!text-[#F87171]',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]'
                ].join(' ')}
              >
                <TrashIcon size={12} />
              </button>
            </span>
          ))}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mt-3 rounded-lg border-[0.5px] border-[#1A1A1A] bg-surface p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Work, ABC)"
                maxLength={60}
                className={[
                  'w-[180px] px-3 py-2 rounded-md text-sm text-fg placeholder:text-muted',
                  'bg-bg border-[0.5px] border-[#1A1A1A]',
                  'focus:outline-none focus:border-accent caret-accent'
                ].join(' ')}
              />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitAdd();
                }}
                placeholder="Paste the calendar's secret ICS link (https://…ics)"
                className={[
                  'flex-1 min-w-[240px] px-3 py-2 rounded-md text-sm text-fg placeholder:text-muted',
                  'bg-bg border-[0.5px] border-[#1A1A1A]',
                  'focus:outline-none focus:border-accent caret-accent font-mono text-[12px]'
                ].join(' ')}
              />
              <button
                type="button"
                onClick={() => void submitAdd()}
                disabled={adding || !url.trim()}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium shrink-0',
                  'bg-accent text-bg transition-opacity duration-150 hover:opacity-90',
                  'disabled:opacity-40 disabled:cursor-default',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                ].join(' ')}
              >
                {adding ? 'Checking…' : 'Add'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted leading-snug">
              Google Calendar: Settings → your calendar → &ldquo;Secret address in
              iCal format&rdquo;. Outlook: Settings → Calendar → Shared calendars →
              Publish → ICS link. The link stays on this computer.
            </p>
            {addError && (
              <div className="mt-2 text-[12px] text-[#F87171]">{addError}</div>
            )}
          </div>
        )}

        {/* Per-source fetch problems (partial failure) */}
        {failedStatuses.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {failedStatuses.map((st) => {
              const src = sourceById.get(st.calendarId);
              return (
                <div key={st.calendarId} className="text-[11px] text-[#F87171]">
                  {src?.name ?? 'Calendar'} unreachable
                  {st.stale ? ' — showing last known events' : ''}
                  {st.error ? ` (${st.error})` : ''}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agenda */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {sources.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <CalendarIcon size={40} className="text-muted/40" />
            <p className="mt-4 text-sm text-muted max-w-[360px]">
              No calendars yet. Click{' '}
              <span className="text-fg font-medium">Add Calendar</span> and paste
              your calendar&rsquo;s secret ICS link — works with Google Calendar
              and Outlook, no login needed.
            </p>
          </div>
        ) : dayBuckets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <CalendarIcon size={40} className="text-muted/40" />
            <p className="mt-4 text-sm text-muted">
              Nothing scheduled in the next 7 days.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {dayBuckets.map((bucket) => (
              <div key={bucket.dayStart}>
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">
                  {dayLabel(bucket.dayStart)}
                </h2>
                <div className="space-y-1.5">
                  {bucket.events.map((ev) => {
                    const src = sourceById.get(ev.calendarId);
                    return (
                      <div
                        key={`${ev.id}:${bucket.dayStart}`}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border-[0.5px] border-[#1A1A1A]"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: src?.color ?? '#6B6B6B' }}
                          title={src?.name}
                        />
                        <span className="w-[130px] shrink-0 text-[12px] text-muted">
                          {timeRange(ev)}
                        </span>
                        <span className="flex-1 min-w-0 text-sm text-fg truncate">
                          {ev.title}
                        </span>
                        {ev.location && (
                          <span className="max-w-[220px] shrink-0 text-[12px] text-muted truncate">
                            {ev.location}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
