// Phase 9.7: time helpers shared by the Reminders panel and the command-bar
// rule parser. All parsing is LOCAL time — reminders are personal alarms,
// not calendar events, so no timezone gymnastics.

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const DEFAULT_REMINDER_DELAY_MS = HOUR_MS;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeString(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// "5:00 PM" (today) / "Tomorrow 9:00 AM" / "Jul 14, 9:00 AM" (later).
export function formatDueTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (isSameDay(d, now)) return timeString(d);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  if (isSameDay(d, tomorrow)) return `Tomorrow ${timeString(d)}`;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Resolve an hour/minute (+ optional am/pm) to the NEXT matching Date.
// Without am/pm, a small hour like "5" prefers the next occurrence among
// 5:00 and 17:00 — "remind me to call at 5" typed at 2 PM means 5 PM, not
// 5 AM tomorrow. Explicit 24-hour values (13-23) are taken as-is.
function resolveClockTime(
  hourRaw: number,
  minute: number,
  meridiem: string | null,
  dayOffset: 0 | 1,
  now: Date
): number | null {
  if (hourRaw < 0 || hourRaw > 23 || minute < 0 || minute > 59) return null;
  const candidates: number[] = [];
  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (hourRaw > 12) return null;
    let h = hourRaw % 12;
    if (m === 'pm') h += 12;
    candidates.push(h);
  } else if (hourRaw >= 13) {
    candidates.push(hourRaw);
  } else {
    candidates.push(hourRaw, (hourRaw % 12) + 12);
  }

  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + dayOffset
  );
  const options = candidates
    .filter((h) => h >= 0 && h <= 23)
    .map((h) => new Date(base).setHours(h, minute, 0, 0))
    .sort((a, b) => a - b);

  if (dayOffset === 1) {
    // "tomorrow at X" is absolute — first candidate on that day.
    return options[0] ?? null;
  }
  // Today: pick the first candidate still in the future; if all have
  // passed, roll the earliest to tomorrow.
  for (const t of options) {
    if (t > now.getTime()) return t;
  }
  return options.length > 0 ? options[0]! + DAY_MS : null;
}

export interface ParsedReminder {
  text: string;
  dueAt: number;
  // True when no time expression was found and the 1-hour default applied.
  usedDefault: boolean;
}

const LEAD_RE = /^remind(?:\s+me)?(?:\s+to)?\s+/i;
const IN_RE =
  /\s+in\s+(\d{1,3})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s*$/i;
const TOMORROW_RE =
  /\s+tomorrow(?:\s+at)?(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\s*$/i;
const AT_RE = /\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;

// Parse a command-bar query like:
//   "remind me to call Ali at 5pm"
//   "remind me to check the invoice in 30 min"
//   "remind me to follow up tomorrow 9am"
//   "remind me to stretch"              → default: in 1 hour
// Returns null when the query isn't a reminder (no "remind" lead) or the
// text is empty after stripping the time expression.
export function parseReminderQuery(rawQuery: string): ParsedReminder | null {
  const q = rawQuery.trim();
  if (!LEAD_RE.test(q)) return null;
  const rest = q.replace(LEAD_RE, '').trim();
  if (!rest) return null;

  const now = new Date();

  const inMatch = rest.match(IN_RE);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2]!.toLowerCase();
    const ms = unit.startsWith('h') ? n * HOUR_MS : n * MIN_MS;
    const text = rest.slice(0, inMatch.index).trim();
    if (!text || n <= 0) return null;
    return { text, dueAt: now.getTime() + ms, usedDefault: false };
  }

  const tomorrowMatch = rest.match(TOMORROW_RE);
  if (tomorrowMatch) {
    const text = rest.slice(0, tomorrowMatch.index).trim();
    if (!text) return null;
    const hour = tomorrowMatch[1] !== undefined ? Number(tomorrowMatch[1]) : 9;
    const minute = tomorrowMatch[2] !== undefined ? Number(tomorrowMatch[2]) : 0;
    const meridiem = tomorrowMatch[3] ?? null;
    const dueAt = resolveClockTime(hour, minute, meridiem, 1, now);
    if (dueAt === null) return null;
    return { text, dueAt, usedDefault: false };
  }

  const atMatch = rest.match(AT_RE);
  if (atMatch) {
    const text = rest.slice(0, atMatch.index).trim();
    if (!text) return null;
    const hour = Number(atMatch[1]);
    const minute = atMatch[2] !== undefined ? Number(atMatch[2]) : 0;
    const meridiem = atMatch[3] ?? null;
    const dueAt = resolveClockTime(hour, minute, meridiem, 0, now);
    if (dueAt === null) return null;
    return { text, dueAt, usedDefault: false };
  }

  // No time expression — default to one hour out.
  return {
    text: rest,
    dueAt: now.getTime() + DEFAULT_REMINDER_DELAY_MS,
    usedDefault: true
  };
}
