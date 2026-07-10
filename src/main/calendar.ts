import { ipcMain } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import type {
  CalendarEvent,
  CalendarFetchStatus,
  CalendarSource
} from '@shared/types';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';
import { getAllWindows } from './windows';

// Phase 9.8: calendar unified view. Sources are secret ICS URLs the user
// pastes (Google/Outlook read-only links). Main owns boxb-calendars.json,
// fetches + parses ICS, expands recurring events into the agenda window,
// and caches the last good result per source so a flaky network shows
// stale data (flagged) instead of an empty panel.
//
// The ICS parser below is deliberately minimal but covers what Google and
// Outlook actually emit for personal calendars: VEVENT, DTSTART/DTEND
// (UTC / TZID / floating / all-day DATE), DURATION, SUMMARY, LOCATION,
// UID, EXDATE, RECURRENCE-ID overrides, and RRULE with FREQ=DAILY/WEEKLY/
// MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (weekly), BYMONTHDAY.
// Exotic rules (BYSETPOS, HOURLY, …) are skipped rather than mis-rendered.

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const AGENDA_PAST_SLACK_MS = 24 * 60 * 60 * 1000; // include yesterday's spillover
const AGENDA_DAYS_AHEAD = 8; // today + 7 full days
const MAX_OCCURRENCE_ITERATIONS = 2000;
const MAX_SOURCES = 10;

// Preset palette. Gold first — brand. Assigned round-robin on add.
const PALETTE = ['#D4AF37', '#4ADE80', '#60A5FA', '#F87171', '#C084FC', '#F97316'];

interface StoreSchema {
  sources?: CalendarSource[];
}

const store = new Store<StoreSchema>({ name: 'boxb-calendars' });

let sources: CalendarSource[] = [];

interface SourceCache {
  events: CalendarEvent[];
  fetchedAt: number;
  ok: boolean;
  error: string | null;
}

const cache = new Map<string, SourceCache>();

function sanitizeSource(raw: unknown): CalendarSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<CalendarSource>;
  if (typeof s.id !== 'string' || !s.id) return null;
  if (typeof s.url !== 'string' || !s.url) return null;
  return {
    id: s.id,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Calendar',
    url: s.url,
    color:
      typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color)
        ? s.color
        : PALETTE[0]!,
    addedAt:
      typeof s.addedAt === 'number' && Number.isFinite(s.addedAt)
        ? s.addedAt
        : Date.now()
  };
}

function load(): void {
  const raw = store.get('sources');
  sources = Array.isArray(raw)
    ? raw.map(sanitizeSource).filter((s): s is CalendarSource => s !== null)
    : [];
}

function save(): void {
  store.set('sources', sources);
}

function broadcastChanged(): void {
  for (const win of getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.calendar.changed);
    }
  }
}

function nextColor(): string {
  const used = new Set(sources.map((s) => s.color));
  for (const c of PALETTE) {
    if (!used.has(c)) return c;
  }
  return PALETTE[sources.length % PALETTE.length]!;
}

// ---------------------------------------------------------------------------
// ICS parsing
// ---------------------------------------------------------------------------

// Unfold RFC 5545 folded lines (continuation lines start with space/tab).
function unfoldIcsLines(text: string): string[] {
  const rawLines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseProperty(line: string): IcsProperty | null {
  // NAME;PARAM=VAL;PARAM2=VAL2:value — find the first ':' that isn't
  // inside a quoted param value.
  let inQuotes = false;
  let colonIdx = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx < 0) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = head.split(';');
  const name = parts[0]!.toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) {
      params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return { name, params, value };
}

// Convert a wall-clock time in an IANA timezone to epoch ms using Intl —
// two-pass offset estimation, good enough for calendar display (DST edge
// cases at the exact transition hour may be off by the shift amount).
function zonedTimeToEpoch(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string
): number {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    // Unknown TZID (e.g. a Windows zone name) — treat as local time.
    return new Date(y, mo - 1, d, h, mi, s).getTime();
  }
  const wallAt = (epoch: number): number => {
    const parts = fmt.formatToParts(new Date(epoch));
    const get = (type: string): number =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');
    // hour "24" appears for midnight in some environments — normalize.
    const hh = get('hour') % 24;
    return Date.UTC(get('year'), get('month') - 1, get('day'), hh, get('minute'), get('second'));
  };
  let epoch = utcGuess - (wallAt(utcGuess) - utcGuess);
  epoch = epoch - (wallAt(epoch) - utcGuess);
  return epoch;
}

interface ParsedDate {
  epoch: number;
  allDay: boolean;
}

function parseIcsDate(prop: IcsProperty): ParsedDate | null {
  const v = prop.value.trim();
  // All-day: VALUE=DATE or a bare 8-digit date.
  if (prop.params['VALUE'] === 'DATE' || /^\d{8}$/.test(v)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { epoch: dt.getTime(), allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  ];
  if (m[7] === 'Z') {
    return { epoch: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  }
  const tzid = prop.params['TZID'];
  if (tzid) {
    return { epoch: zonedTimeToEpoch(y, mo, d, h, mi, s, tzid), allDay: false };
  }
  // Floating time — interpret as local.
  return { epoch: new Date(y, mo - 1, d, h, mi, s).getTime(), allDay: false };
}

// ISO 8601 duration subset: PnDTnHnMnS / PnW.
function parseDuration(v: string): number | null {
  const m = v
    .trim()
    .match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const sign = m[1] ? -1 : 1;
  const weeks = Number(m[2] ?? 0);
  const days = Number(m[3] ?? 0);
  const hours = Number(m[4] ?? 0);
  const mins = Number(m[5] ?? 0);
  const secs = Number(m[6] ?? 0);
  return (
    sign *
    (weeks * 7 * 86_400_000 +
      days * 86_400_000 +
      hours * 3_600_000 +
      mins * 60_000 +
      secs * 1000)
  );
}

interface RawVevent {
  uid: string;
  summary: string;
  location: string | null;
  start: ParsedDate | null;
  end: ParsedDate | null;
  durationMs: number | null;
  rrule: string | null;
  exdates: number[];
  recurrenceId: number | null;
}

function parseVevents(icsText: string): RawVevent[] {
  const lines = unfoldIcsLines(icsText);
  const events: RawVevent[] = [];
  let cur: RawVevent | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {
        uid: '',
        summary: '',
        location: null,
        start: null,
        end: null,
        durationMs: null,
        rrule: null,
        exdates: [],
        recurrenceId: null
      };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const prop = parseProperty(line);
    if (!prop) continue;
    switch (prop.name) {
      case 'UID':
        cur.uid = prop.value.trim();
        break;
      case 'SUMMARY':
        cur.summary = unescapeIcsText(prop.value).trim();
        break;
      case 'LOCATION': {
        const loc = unescapeIcsText(prop.value).trim();
        cur.location = loc || null;
        break;
      }
      case 'DTSTART':
        cur.start = parseIcsDate(prop);
        break;
      case 'DTEND':
        cur.end = parseIcsDate(prop);
        break;
      case 'DURATION':
        cur.durationMs = parseDuration(prop.value);
        break;
      case 'RRULE':
        cur.rrule = prop.value.trim();
        break;
      case 'EXDATE': {
        // EXDATE can carry a comma-separated list.
        for (const chunk of prop.value.split(',')) {
          const d = parseIcsDate({ ...prop, value: chunk });
          if (d) cur.exdates.push(d.epoch);
        }
        break;
      }
      case 'RECURRENCE-ID': {
        const d = parseIcsDate(prop);
        cur.recurrenceId = d ? d.epoch : null;
        break;
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Recurrence expansion
// ---------------------------------------------------------------------------

const WEEKDAY_CODES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
};

interface Rrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: number | null;
  byday: number[] | null;
  bymonthday: number | null;
}

function parseRrule(raw: string): Rrule | null {
  const parts: Record<string, string> = {};
  for (const chunk of raw.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq > 0) parts[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1);
  }
  const freq = parts['FREQ']?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null; // unsupported cadence — caller skips recurrence
  }
  let until: number | null = null;
  if (parts['UNTIL']) {
    const d = parseIcsDate({ name: 'UNTIL', params: {}, value: parts['UNTIL'] });
    until = d ? d.epoch : null;
  }
  let byday: number[] | null = null;
  if (parts['BYDAY']) {
    const days: number[] = [];
    for (const code of parts['BYDAY'].split(',')) {
      // Ordinal prefixes (1MO, -1FR) are monthly/yearly refinements we
      // don't support — bail to "unsupported" so we don't render wrong.
      const m = code.trim().match(/^(-?\d+)?([A-Z]{2})$/i);
      if (!m) return null;
      if (m[1]) return null;
      const wd = WEEKDAY_CODES[m[2]!.toUpperCase()];
      if (wd === undefined) return null;
      days.push(wd);
    }
    byday = days;
  }
  return {
    freq,
    interval: Math.max(1, Number(parts['INTERVAL'] ?? 1) || 1),
    count: parts['COUNT'] ? Math.max(1, Number(parts['COUNT']) || 1) : null,
    until,
    byday,
    bymonthday: parts['BYMONTHDAY'] ? Number(parts['BYMONTHDAY']) || null : null
  };
}

// Expand a recurring event's occurrence START times intersecting the
// window. Iterates from DTSTART (COUNT semantics need the full series).
function expandRrule(
  rule: Rrule,
  dtstart: number,
  allDay: boolean,
  windowStart: number,
  windowEnd: number
): number[] {
  const out: number[] = [];
  const startDate = new Date(dtstart);
  let produced = 0;
  let iter = 0;

  if (rule.freq === 'WEEKLY' && rule.byday && rule.byday.length > 0) {
    // Walk week by week from the week of DTSTART, emitting each BYDAY at
    // DTSTART's time-of-day. Occurrences before DTSTART itself are skipped.
    const weekAnchor = new Date(startDate);
    weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay()); // Sunday
    const sortedDays = [...rule.byday].sort((a, b) => a - b);
    for (;;) {
      if (++iter > MAX_OCCURRENCE_ITERATIONS) break;
      let anyBelowWindowEnd = false;
      for (const wd of sortedDays) {
        const occ = new Date(weekAnchor);
        occ.setDate(occ.getDate() + wd);
        occ.setHours(
          startDate.getHours(),
          startDate.getMinutes(),
          startDate.getSeconds(),
          0
        );
        const t = allDay
          ? new Date(occ.getFullYear(), occ.getMonth(), occ.getDate()).getTime()
          : occ.getTime();
        if (t < dtstart) continue;
        if (rule.until !== null && t > rule.until) continue;
        produced++;
        if (rule.count !== null && produced > rule.count) return out;
        if (t >= windowStart && t <= windowEnd) out.push(t);
        if (t <= windowEnd) anyBelowWindowEnd = true;
      }
      if (!anyBelowWindowEnd && rule.count === null) {
        // Whole week past the window — done (COUNT series must keep
        // counting, but counting past windowEnd can stop too).
        const weekStartT = weekAnchor.getTime();
        if (weekStartT > windowEnd) break;
      }
      if (weekAnchor.getTime() > windowEnd && rule.count === null) break;
      weekAnchor.setDate(weekAnchor.getDate() + 7 * rule.interval);
    }
    return out;
  }

  // DAILY / WEEKLY-without-BYDAY / MONTHLY / YEARLY: step from DTSTART.
  const cur = new Date(startDate);
  for (;;) {
    if (++iter > MAX_OCCURRENCE_ITERATIONS) break;
    const t = cur.getTime();
    if (rule.until !== null && t > rule.until) break;
    if (rule.count !== null && produced >= rule.count) break;
    produced++;
    if (t >= windowStart && t <= windowEnd) out.push(t);
    if (t > windowEnd && rule.count === null && rule.until === null) break;
    if (t > windowEnd) break;
    switch (rule.freq) {
      case 'DAILY':
        cur.setDate(cur.getDate() + rule.interval);
        break;
      case 'WEEKLY':
        cur.setDate(cur.getDate() + 7 * rule.interval);
        break;
      case 'MONTHLY': {
        const targetDay = rule.bymonthday ?? startDate.getDate();
        cur.setDate(1);
        cur.setMonth(cur.getMonth() + rule.interval);
        const daysInMonth = new Date(
          cur.getFullYear(),
          cur.getMonth() + 1,
          0
        ).getDate();
        cur.setDate(Math.min(targetDay, daysInMonth));
        break;
      }
      case 'YEARLY':
        cur.setFullYear(cur.getFullYear() + rule.interval);
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetch + assemble
// ---------------------------------------------------------------------------

function normalizeIcsUrl(raw: string): string | null {
  let u = raw.trim();
  if (u.toLowerCase().startsWith('webcal://')) {
    u = 'https://' + u.slice('webcal://'.length);
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchIcs(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/calendar, text/plain, */*' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      throw new Error('Not a calendar link (no VCALENDAR found).');
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function eventsFromIcs(
  icsText: string,
  source: CalendarSource,
  windowStart: number,
  windowEnd: number
): CalendarEvent[] {
  const raws = parseVevents(icsText);
  const out: CalendarEvent[] = [];

  // RECURRENCE-ID overrides replace one occurrence of their master series.
  // Collect their original occurrence times per UID so expansion skips them;
  // the overrides themselves are added as standalone events.
  const overridesByUid = new Map<string, number[]>();
  for (const ev of raws) {
    if (ev.recurrenceId !== null && ev.uid) {
      const list = overridesByUid.get(ev.uid) ?? [];
      list.push(ev.recurrenceId);
      overridesByUid.set(ev.uid, list);
    }
  }

  for (const ev of raws) {
    if (!ev.start) continue;
    const startInfo = ev.start;
    const durationMs = ((): number => {
      if (ev.end) return Math.max(0, ev.end.epoch - startInfo.epoch);
      if (ev.durationMs !== null) return Math.max(0, ev.durationMs);
      return startInfo.allDay ? 86_400_000 : 0;
    })();
    const title = ev.summary || '(no title)';

    const makeEvent = (occStart: number): CalendarEvent => ({
      id: `${source.id}:${ev.uid || 'nouid'}:${occStart}${ev.recurrenceId !== null ? ':ovr' : ''}`,
      calendarId: source.id,
      title,
      location: ev.location,
      start: occStart,
      end: occStart + durationMs,
      allDay: startInfo.allDay
    });

    const rule = ev.rrule && ev.recurrenceId === null ? parseRrule(ev.rrule) : null;
    if (ev.rrule && ev.recurrenceId === null && !rule) {
      // Unsupported RRULE — render the first occurrence only if it's in
      // the window, rather than pretending the series doesn't exist.
      if (startInfo.epoch >= windowStart && startInfo.epoch <= windowEnd) {
        out.push(makeEvent(startInfo.epoch));
      }
      continue;
    }

    if (rule) {
      const skip = new Set<number>([
        ...ev.exdates,
        ...(overridesByUid.get(ev.uid) ?? [])
      ]);
      for (const occ of expandRrule(
        rule,
        startInfo.epoch,
        startInfo.allDay,
        windowStart,
        windowEnd
      )) {
        if (skip.has(occ)) continue;
        out.push(makeEvent(occ));
      }
    } else {
      // Single event (or an override instance). Include if it overlaps
      // the window at all.
      const end = startInfo.epoch + durationMs;
      if (end >= windowStart && startInfo.epoch <= windowEnd) {
        out.push(makeEvent(startInfo.epoch));
      }
    }
  }
  return out;
}

function agendaWindow(): { windowStart: number; windowEnd: number } {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return {
    windowStart: todayStart - AGENDA_PAST_SLACK_MS,
    windowEnd: todayStart + AGENDA_DAYS_AHEAD * 86_400_000
  };
}

async function refreshSource(
  source: CalendarSource,
  force: boolean
): Promise<CalendarFetchStatus> {
  const cached = cache.get(source.id);
  if (!force && cached && cached.ok && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      calendarId: source.id,
      ok: true,
      stale: false,
      error: null,
      fetchedAt: cached.fetchedAt
    };
  }
  const { windowStart, windowEnd } = agendaWindow();
  try {
    const text = await fetchIcs(source.url);
    const events = eventsFromIcs(text, source, windowStart, windowEnd);
    cache.set(source.id, {
      events,
      fetchedAt: Date.now(),
      ok: true,
      error: null
    });
    dlog('CALENDAR:fetched', { id: source.id, events: events.length });
    return {
      calendarId: source.id,
      ok: true,
      stale: false,
      error: null,
      fetchedAt: Date.now()
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dlog('CALENDAR:fetch-failed', { id: source.id, error: msg });
    if (cached) {
      // Keep serving the last good events, flagged stale.
      return {
        calendarId: source.id,
        ok: false,
        stale: true,
        error: msg,
        fetchedAt: cached.fetchedAt
      };
    }
    return {
      calendarId: source.id,
      ok: false,
      stale: false,
      error: msg,
      fetchedAt: null
    };
  }
}

export function registerCalendarIpc(): void {
  load();

  ipcMain.handle(IPC.calendar.listSources, (): CalendarSource[] => [...sources]);

  ipcMain.handle(
    IPC.calendar.addSource,
    async (
      _event,
      payload: { name?: unknown; url?: unknown }
    ): Promise<{ ok: boolean; source?: CalendarSource; error?: string }> => {
      if (sources.length >= MAX_SOURCES) {
        return { ok: false, error: `Maximum ${MAX_SOURCES} calendars.` };
      }
      const name =
        typeof payload?.name === 'string' && payload.name.trim()
          ? payload.name.trim().slice(0, 60)
          : 'Calendar';
      const url = typeof payload?.url === 'string' ? normalizeIcsUrl(payload.url) : null;
      if (!url) {
        return { ok: false, error: 'That does not look like a valid link.' };
      }
      if (sources.some((s) => s.url === url)) {
        return { ok: false, error: 'This calendar is already added.' };
      }
      const source: CalendarSource = {
        id: randomUUID(),
        name,
        url,
        color: nextColor(),
        addedAt: Date.now()
      };
      // Validate by fetching once BEFORE persisting — a broken link should
      // fail the add, not silently create a dead calendar row.
      const status = await refreshSource(source, true);
      if (!status.ok) {
        cache.delete(source.id);
        return {
          ok: false,
          error: `Could not read the calendar: ${status.error ?? 'unknown error'}`
        };
      }
      sources.push(source);
      save();
      broadcastChanged();
      dlog('CALENDAR:add', { id: source.id, name });
      return { ok: true, source };
    }
  );

  ipcMain.handle(IPC.calendar.removeSource, (_event, id: unknown): boolean => {
    if (typeof id !== 'string') return false;
    const before = sources.length;
    sources = sources.filter((s) => s.id !== id);
    if (sources.length === before) return false;
    cache.delete(id);
    save();
    broadcastChanged();
    dlog('CALENDAR:remove', { id });
    return true;
  });

  ipcMain.handle(
    IPC.calendar.getEvents,
    async (
      _event,
      payload: { force?: unknown }
    ): Promise<{ events: CalendarEvent[]; statuses: CalendarFetchStatus[] }> => {
      const force = Boolean(payload?.force);
      const statuses = await Promise.all(
        sources.map((s) => refreshSource(s, force))
      );
      const { windowStart, windowEnd } = agendaWindow();
      const events: CalendarEvent[] = [];
      for (const s of sources) {
        const c = cache.get(s.id);
        if (!c) continue;
        for (const ev of c.events) {
          if (ev.end >= windowStart && ev.start <= windowEnd) events.push(ev);
        }
      }
      events.sort((a, b) => a.start - b.start || a.end - b.end);
      return { events, statuses };
    }
  );
}
