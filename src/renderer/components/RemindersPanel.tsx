import { useEffect, useState } from 'react';
import { useRemindersStore } from '../store/reminders';
import { useServicesStore } from '../store/services';
import { formatDueTime } from '../utils/reminderTime';
import { BellIcon, CheckIcon, CloseIcon, TrashIcon } from './Icons';
import type { Reminder } from '@shared/types';

// Phase 9.7: the "Reminders" view. Rendered over the service area when the
// sidebar bell is toggled on — same overlay pattern as SecurityPanel.
// Two sections: timed reminders (top) and a plain task checklist (bottom).

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

interface QuickPick {
  id: string;
  label: string;
  // Computed at submit time so a chip selected minutes ago doesn't drift.
  compute: () => number;
}

const QUICK_PICKS: QuickPick[] = [
  { id: '30m', label: '30 min', compute: () => Date.now() + 30 * MIN_MS },
  { id: '1h', label: '1 hour', compute: () => Date.now() + HOUR_MS },
  { id: '3h', label: '3 hours', compute: () => Date.now() + 3 * HOUR_MS },
  {
    id: 'tomorrow9',
    label: 'Tomorrow 9am',
    compute: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }
  }
];

// v0.2.0 polish: custom pick-time controls. The native datetime-local input
// on Windows has no clickable spinners (Baali's acceptance feedback), so
// "Pick time…" uses plain dropdowns instead: day / hour / minute / AM-PM.

interface CustomTime {
  dayOffset: number; // 0 = today
  hour12: number; // 1..12
  minute: number; // 0, 5, 10 … 55
  meridiem: 'AM' | 'PM';
}

function defaultCustomTime(): CustomTime {
  // Next full hour, at least 1h out.
  const d = new Date(Date.now() + HOUR_MS);
  const h24 = d.getHours();
  return {
    dayOffset: 0,
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: 0,
    meridiem: h24 >= 12 ? 'PM' : 'AM'
  };
}

function customTimeToEpoch(t: CustomTime): number {
  const now = new Date();
  let h = t.hour12 % 12;
  if (t.meridiem === 'PM') h += 12;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + t.dayOffset,
    h,
    t.minute
  ).getTime();
}

function dayOffsetLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const d = new Date(Date.now() + offset * 24 * HOUR_MS);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function ReminderRow({
  reminder,
  now,
  serviceName,
  serviceIconUrl,
  onDone,
  onSnooze,
  onDelete
}: {
  reminder: Reminder;
  now: number;
  serviceName: string | null;
  serviceIconUrl: string | null;
  onDone: () => void;
  onSnooze: () => void;
  onDelete: () => void;
}): JSX.Element {
  const overdue = reminder.dueAt <= now;
  return (
    <div className="rounded-lg border-[0.5px] border-[#1A1A1A] bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-fg break-words">{reminder.text}</div>
          <div className="flex items-center gap-2 mt-1">
            {overdue ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border-[0.5px] text-accent border-accent/30 bg-accent/10">
                Overdue
              </span>
            ) : null}
            <span className="text-[11px] text-muted">
              {formatDueTime(reminder.dueAt)}
            </span>
            {serviceName && (
              <span className="flex items-center gap-1 text-[11px] text-muted min-w-0">
                ·
                {serviceIconUrl && (
                  <img
                    src={serviceIconUrl}
                    alt=""
                    className="w-3.5 h-3.5 rounded-full"
                  />
                )}
                <span className="truncate">{serviceName}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {overdue && (
            <button
              type="button"
              onClick={onSnooze}
              className={[
                'px-3 py-1.5 rounded-md text-[12px] font-medium',
                'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
                'transition-colors duration-150 hover:border-accent hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              ].join(' ')}
            >
              Snooze 10m
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className={[
              'px-3 py-1.5 rounded-md text-[12px] font-medium',
              'bg-accent text-bg transition-opacity duration-150 hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            Done
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete reminder"
            title="Delete reminder"
            className={[
              'w-7 h-7 flex items-center justify-center rounded-md',
              'text-muted hover:text-[#F87171] hover:bg-[#3A0F0F]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]'
            ].join(' ')}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function RemindersPanel(): JSX.Element {
  const reminders = useRemindersStore((s) => s.reminders);
  const todos = useRemindersStore((s) => s.todos);
  const closePanel = useRemindersStore((s) => s.closePanel);
  const createReminder = useRemindersStore((s) => s.create);
  const complete = useRemindersStore((s) => s.complete);
  const snooze = useRemindersStore((s) => s.snooze);
  const remove = useRemindersStore((s) => s.remove);
  const addTodo = useRemindersStore((s) => s.addTodo);
  const toggleTodo = useRemindersStore((s) => s.toggleTodo);
  const removeTodo = useRemindersStore((s) => s.removeTodo);
  const clearDoneTodos = useRemindersStore((s) => s.clearDoneTodos);

  const services = useServicesStore((s) => s.services);
  const workspaces = useServicesStore((s) => s.workspaces);

  // Create-form state.
  const [text, setText] = useState('');
  const [pickId, setPickId] = useState<string>('1h');
  const [customTime, setCustomTime] = useState<CustomTime>(defaultCustomTime);
  const [serviceId, setServiceId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Todo-form state.
  const [todoText, setTodoText] = useState('');

  // Ticking "now" so Overdue badges and the sort stay honest while the
  // panel is open. 30s granularity is enough for display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const wsById = new Map(workspaces.map((w) => [w.id, w]));

  const sorted = [...reminders].sort((a, b) => {
    const aOver = a.dueAt <= now ? 0 : 1;
    const bOver = b.dueAt <= now ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return a.dueAt - b.dueAt;
  });

  const doneTodoCount = todos.filter((t) => t.done).length;

  const submitReminder = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) {
      setFormError('Type what to remind you about.');
      return;
    }
    let dueAt: number;
    if (pickId === 'custom') {
      const parsed = customTimeToEpoch(customTime);
      if (parsed <= Date.now()) {
        setFormError('That time is in the past.');
        return;
      }
      dueAt = parsed;
    } else {
      const pick = QUICK_PICKS.find((p) => p.id === pickId) ?? QUICK_PICKS[1]!;
      dueAt = pick.compute();
    }
    setFormError(null);
    const err = await createReminder({
      text: trimmed,
      dueAt,
      serviceId: serviceId || null
    });
    if (err) {
      setFormError(err);
      return;
    }
    setText('');
  };

  const submitTodo = async (): Promise<void> => {
    const trimmed = todoText.trim();
    if (!trimmed) return;
    setTodoText('');
    await addTodo(trimmed);
  };

  const chipClass = (active: boolean): string =>
    [
      'px-2.5 py-1.5 rounded-md text-[12px] font-medium border-[0.5px]',
      'transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      active
        ? 'text-accent border-accent bg-accent/10'
        : 'text-muted border-[#1A1A1A] bg-bg hover:text-accent hover:border-accent'
    ].join(' ');

  return (
    <div className="absolute inset-0 z-20 bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b-[0.5px] border-b-[#1A1A1A]">
        <div className="flex items-center gap-2.5">
          <BellIcon size={20} className="text-accent" />
          <div>
            <h1 className="text-base font-medium text-fg">Reminders</h1>
            <p className="text-[12px] text-muted">
              Timed reminders and a simple task list. Also try Ctrl+K:
              &ldquo;remind me to call Ali at 5pm&rdquo;.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close reminders panel"
          className={[
            'flex items-center justify-center text-muted rounded',
            'transition-colors duration-150 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          ].join(' ')}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {/* Create form */}
        <div className="rounded-lg border-[0.5px] border-[#1A1A1A] bg-surface p-4">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitReminder();
            }}
            placeholder="What should I remind you about?"
            maxLength={200}
            className={[
              'w-full px-3 py-2 rounded-md text-sm text-fg placeholder:text-muted',
              'bg-bg border-[0.5px] border-[#1A1A1A]',
              'focus:outline-none focus:border-accent caret-accent'
            ].join(' ')}
          />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {QUICK_PICKS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPickId(p.id)}
                className={chipClass(pickId === p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPickId('custom');
                setCustomTime(defaultCustomTime());
              }}
              className={chipClass(pickId === 'custom')}
            >
              Pick time…
            </button>
            {pickId === 'custom' && (
              <span className="flex items-center gap-1.5">
                <select
                  value={customTime.dayOffset}
                  onChange={(e) =>
                    setCustomTime({ ...customTime, dayOffset: Number(e.target.value) })
                  }
                  aria-label="Day"
                  className="px-2 py-1.5 rounded-md text-[12px] text-fg bg-bg border-[0.5px] border-[#1A1A1A] focus:outline-none focus:border-accent"
                >
                  {Array.from({ length: 14 }, (_, i) => (
                    <option key={i} value={i}>
                      {dayOffsetLabel(i)}
                    </option>
                  ))}
                </select>
                <select
                  value={customTime.hour12}
                  onChange={(e) =>
                    setCustomTime({ ...customTime, hour12: Number(e.target.value) })
                  }
                  aria-label="Hour"
                  className="px-2 py-1.5 rounded-md text-[12px] text-fg bg-bg border-[0.5px] border-[#1A1A1A] focus:outline-none focus:border-accent"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <span className="text-muted text-[12px]">:</span>
                <select
                  value={customTime.minute}
                  onChange={(e) =>
                    setCustomTime({ ...customTime, minute: Number(e.target.value) })
                  }
                  aria-label="Minute"
                  className="px-2 py-1.5 rounded-md text-[12px] text-fg bg-bg border-[0.5px] border-[#1A1A1A] focus:outline-none focus:border-accent"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i * 5} value={i * 5}>
                      {String(i * 5).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <select
                  value={customTime.meridiem}
                  onChange={(e) =>
                    setCustomTime({
                      ...customTime,
                      meridiem: e.target.value === 'PM' ? 'PM' : 'AM'
                    })
                  }
                  aria-label="AM or PM"
                  className="px-2 py-1.5 rounded-md text-[12px] text-fg bg-bg border-[0.5px] border-[#1A1A1A] focus:outline-none focus:border-accent"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              aria-label="Link to a service (optional)"
              className={[
                'flex-1 min-w-0 px-2 py-2 rounded-md text-[12px]',
                'bg-bg border-[0.5px] border-[#1A1A1A]',
                serviceId ? 'text-fg' : 'text-muted',
                'focus:outline-none focus:border-accent'
              ].join(' ')}
            >
              <option value="">No linked service</option>
              {services.map((s) => {
                const ws = wsById.get(s.workspaceId);
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {ws ? ` — ${ws.name}` : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => void submitReminder()}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium shrink-0',
                'bg-accent text-bg transition-opacity duration-150 hover:opacity-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              ].join(' ')}
            >
              Add Reminder
            </button>
          </div>
          {formError && (
            <div className="mt-2 text-[12px] text-[#F87171]">{formError}</div>
          )}
        </div>

        {/* Reminder list */}
        <div className="mt-5">
          {sorted.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <BellIcon size={32} className="text-muted/40" />
              <p className="mt-3 text-sm text-muted max-w-[320px]">
                No reminders yet. Add one above, or press{' '}
                <span className="text-fg font-medium">Ctrl+K</span> and type
                &ldquo;remind me to…&rdquo;
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map((r) => {
                const svc = r.serviceId ? serviceById.get(r.serviceId) : undefined;
                return (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    now={now}
                    serviceName={svc?.name ?? null}
                    serviceIconUrl={svc?.iconUrl ?? null}
                    onDone={() => void complete(r.id)}
                    onSnooze={() => void snooze(r.id)}
                    onDelete={() => void remove(r.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-fg">Tasks</h2>
            {doneTodoCount > 0 && (
              <button
                type="button"
                onClick={() => void clearDoneTodos()}
                className={[
                  'text-[11px] text-muted hover:text-accent',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded'
                ].join(' ')}
              >
                Clear completed ({doneTodoCount})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitTodo();
              }}
              placeholder="Add a task…"
              maxLength={200}
              className={[
                'flex-1 min-w-0 px-3 py-2 rounded-md text-sm text-fg placeholder:text-muted',
                'bg-surface border-[0.5px] border-[#1A1A1A]',
                'focus:outline-none focus:border-accent caret-accent'
              ].join(' ')}
            />
            <button
              type="button"
              onClick={() => void submitTodo()}
              className={[
                'px-3 py-2 rounded-md text-[12px] font-medium shrink-0',
                'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
                'transition-colors duration-150 hover:border-accent hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              ].join(' ')}
            >
              Add
            </button>
          </div>
          {todos.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {todos.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-surface border-[0.5px] border-[#1A1A1A] group"
                >
                  <button
                    type="button"
                    onClick={() => void toggleTodo(t.id)}
                    role="checkbox"
                    aria-checked={t.done}
                    aria-label={t.done ? 'Mark task not done' : 'Mark task done'}
                    className={[
                      'w-[18px] h-[18px] rounded flex items-center justify-center shrink-0',
                      'border-[0.5px] transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      t.done
                        ? 'bg-accent border-accent text-bg'
                        : 'bg-bg border-[#2a2a2a] text-transparent hover:border-accent'
                    ].join(' ')}
                  >
                    <CheckIcon size={12} />
                  </button>
                  <span
                    className={[
                      'flex-1 min-w-0 text-sm break-words',
                      t.done ? 'text-muted line-through' : 'text-fg'
                    ].join(' ')}
                  >
                    {t.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeTodo(t.id)}
                    aria-label="Delete task"
                    className={[
                      'w-6 h-6 flex items-center justify-center rounded shrink-0',
                      'text-muted/0 group-hover:text-muted hover:!text-[#F87171]',
                      'transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]'
                    ].join(' ')}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
