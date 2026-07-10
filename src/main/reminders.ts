import { ipcMain } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import type { Reminder, TodoItem } from '@shared/types';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';
import { showReminderToast, showToast } from './in-app-toast';
import { getAllWindows } from './windows';
import { getMainWindow } from './window';

// Phase 9.7: reminders + tasks. Main owns boxb-reminders.json (same
// single-source-of-truth pattern as the scanner state): every mutation goes
// through IPC, main persists, then broadcasts `reminders:changed` to ALL
// windows so each renderer re-lists. The scheduler is a 15-second sweep
// (not per-reminder setTimeout) — robust across laptop sleep/wake, and a
// ±15s firing precision is fine for human reminders.

const SWEEP_INTERVAL_MS = 15_000;
const SNOOZE_MS = 10 * 60 * 1000;
const MAX_TEXT_LEN = 200;
// At startup, if more than this many reminders were missed while BoxB was
// closed, collapse them into one summary toast instead of a toast storm.
const MISSED_SUMMARY_THRESHOLD = 3;

interface StoreSchema {
  reminders?: Reminder[];
  todos?: TodoItem[];
}

const store = new Store<StoreSchema>({ name: 'boxb-reminders' });

let reminders: Reminder[] = [];
let todos: TodoItem[] = [];
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function sanitizeReminder(raw: unknown): Reminder | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Reminder>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.text !== 'string' || !r.text.trim()) return null;
  if (typeof r.dueAt !== 'number' || !Number.isFinite(r.dueAt)) return null;
  return {
    id: r.id,
    text: r.text.slice(0, MAX_TEXT_LEN),
    dueAt: r.dueAt,
    createdAt:
      typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
        ? r.createdAt
        : Date.now(),
    serviceId: typeof r.serviceId === 'string' && r.serviceId ? r.serviceId : null,
    firedAt:
      typeof r.firedAt === 'number' && Number.isFinite(r.firedAt) ? r.firedAt : null
  };
}

function sanitizeTodo(raw: unknown): TodoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<TodoItem>;
  if (typeof t.id !== 'string' || !t.id) return null;
  if (typeof t.text !== 'string' || !t.text.trim()) return null;
  return {
    id: t.id,
    text: t.text.slice(0, MAX_TEXT_LEN),
    done: Boolean(t.done),
    createdAt:
      typeof t.createdAt === 'number' && Number.isFinite(t.createdAt)
        ? t.createdAt
        : Date.now()
  };
}

function load(): void {
  const rawReminders = store.get('reminders');
  const rawTodos = store.get('todos');
  reminders = Array.isArray(rawReminders)
    ? rawReminders.map(sanitizeReminder).filter((r): r is Reminder => r !== null)
    : [];
  todos = Array.isArray(rawTodos)
    ? rawTodos.map(sanitizeTodo).filter((t): t is TodoItem => t !== null)
    : [];
}

function save(): void {
  store.set('reminders', reminders);
  store.set('todos', todos);
}

function broadcastChanged(): void {
  for (const win of getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.reminders.changed);
    }
  }
}

// Bring the primary window forward and tell its renderer to either focus
// the linked service or open the Reminders panel. Mirrors the notification
// click flow in permissions.ts.
function focusFromToast(reminder: Reminder): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  if (reminder.serviceId) {
    win.webContents.send(IPC.reminders.focusService, {
      serviceId: reminder.serviceId
    });
  } else {
    win.webContents.send(IPC.reminders.openPanel);
  }
}

function openPanelFromToast(): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send(IPC.reminders.openPanel);
}

function fire(reminder: Reminder): void {
  reminder.firedAt = Date.now();
  dlog('REMINDERS:fire', { id: reminder.id, dueAt: reminder.dueAt });
  showReminderToast({
    id: `reminder:${reminder.id}`,
    title: 'Reminder',
    body: reminder.text,
    onClick: () => focusFromToast(reminder)
  });
}

function sweep(): void {
  const now = Date.now();
  let fired = 0;
  for (const r of reminders) {
    if (r.firedAt === null && r.dueAt <= now) {
      fire(r);
      fired++;
    }
  }
  if (fired > 0) {
    save();
    broadcastChanged();
  }
}

// Startup catch-up: reminders that came due while BoxB was closed. A small
// number fire individually; a pile-up collapses into one summary toast so
// the user isn't greeted by a toast storm after a week away.
function catchUpMissed(): void {
  const now = Date.now();
  const missed = reminders.filter((r) => r.firedAt === null && r.dueAt <= now);
  if (missed.length === 0) return;
  dlog('REMINDERS:catch-up', { count: missed.length });
  if (missed.length > MISSED_SUMMARY_THRESHOLD) {
    for (const r of missed) r.firedAt = now;
    showReminderToast({
      id: 'reminder:missed-summary',
      title: 'Missed reminders',
      body: `${missed.length} reminders came due while BoxB was closed.`,
      onClick: () => openPanelFromToast()
    });
  } else {
    for (const r of missed) fire(r);
  }
  save();
  broadcastChanged();
}

function reminderIdFromToastId(toastId: unknown): string | null {
  if (typeof toastId !== 'string') return null;
  if (!toastId.startsWith('reminder:')) return null;
  const id = toastId.slice('reminder:'.length);
  return id && id !== 'missed-summary' ? id : null;
}

export function initReminders(): void {
  load();
  catchUpMissed();
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  dlog('REMINDERS:init', {
    reminders: reminders.length,
    todos: todos.length
  });
}

export function registerRemindersIpc(): void {
  ipcMain.handle(IPC.reminders.list, () => ({
    reminders: [...reminders],
    todos: [...todos]
  }));

  ipcMain.handle(
    IPC.reminders.create,
    (
      _event,
      payload: {
        text?: unknown;
        dueAt?: unknown;
        serviceId?: unknown;
        silent?: unknown;
      }
    ): { ok: boolean; reminder?: Reminder; error?: string } => {
      const text =
        typeof payload?.text === 'string' ? payload.text.trim().slice(0, MAX_TEXT_LEN) : '';
      if (!text) return { ok: false, error: 'Reminder text is empty.' };
      const dueAtRaw =
        typeof payload?.dueAt === 'number' && Number.isFinite(payload.dueAt)
          ? payload.dueAt
          : NaN;
      if (!Number.isFinite(dueAtRaw)) return { ok: false, error: 'Invalid time.' };
      // Clamp slightly-past times (clock skew, slow typing) to "in 5s"
      // instead of rejecting — the user clearly wants the reminder.
      const dueAt = Math.max(dueAtRaw, Date.now() + 5000);
      const reminder: Reminder = {
        id: randomUUID(),
        text,
        dueAt,
        createdAt: Date.now(),
        serviceId:
          typeof payload?.serviceId === 'string' && payload.serviceId
            ? payload.serviceId
            : null,
        firedAt: null
      };
      reminders.push(reminder);
      save();
      broadcastChanged();
      dlog('REMINDERS:create', { id: reminder.id, dueAt, silent: !!payload?.silent });
      // Command-bar creates get a confirmation toast — the bar closes
      // instantly, so without this the user has no feedback the reminder
      // exists. Panel creates are silent (the new row IS the feedback).
      if (!payload?.silent) {
        showToast({
          id: `reminder-set:${reminder.id}`,
          title: 'Reminder set',
          body: `${text} — ${new Date(dueAt).toLocaleString()}`,
          onClick: () => openPanelFromToast()
        });
      }
      return { ok: true, reminder };
    }
  );

  ipcMain.handle(IPC.reminders.complete, (_event, id: unknown): boolean => {
    if (typeof id !== 'string') return false;
    const before = reminders.length;
    reminders = reminders.filter((r) => r.id !== id);
    if (reminders.length === before) return false;
    save();
    broadcastChanged();
    dlog('REMINDERS:complete', { id });
    return true;
  });

  ipcMain.handle(IPC.reminders.snooze, (_event, id: unknown): boolean => {
    if (typeof id !== 'string') return false;
    const r = reminders.find((x) => x.id === id);
    if (!r) return false;
    r.dueAt = Date.now() + SNOOZE_MS;
    r.firedAt = null;
    save();
    broadcastChanged();
    dlog('REMINDERS:snooze', { id, dueAt: r.dueAt });
    return true;
  });

  ipcMain.handle(IPC.reminders.remove, (_event, id: unknown): boolean => {
    if (typeof id !== 'string') return false;
    const before = reminders.length;
    reminders = reminders.filter((r) => r.id !== id);
    if (reminders.length === before) return false;
    save();
    broadcastChanged();
    dlog('REMINDERS:remove', { id });
    return true;
  });

  ipcMain.handle(
    IPC.reminders.addTodo,
    (_event, text: unknown): { ok: boolean; todo?: TodoItem } => {
      const t = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT_LEN) : '';
      if (!t) return { ok: false };
      const todo: TodoItem = {
        id: randomUUID(),
        text: t,
        done: false,
        createdAt: Date.now()
      };
      todos.push(todo);
      save();
      broadcastChanged();
      return { ok: true, todo };
    }
  );

  ipcMain.handle(IPC.reminders.toggleTodo, (_event, id: unknown): boolean => {
    if (typeof id !== 'string') return false;
    const todo = todos.find((t) => t.id === id);
    if (!todo) return false;
    todo.done = !todo.done;
    save();
    broadcastChanged();
    return true;
  });

  ipcMain.handle(IPC.reminders.removeTodo, (_event, id: unknown): boolean => {
    if (typeof id !== 'string') return false;
    const before = todos.length;
    todos = todos.filter((t) => t.id !== id);
    if (todos.length === before) return false;
    save();
    broadcastChanged();
    return true;
  });

  ipcMain.handle(IPC.reminders.clearDoneTodos, (): number => {
    const before = todos.length;
    todos = todos.filter((t) => !t.done);
    const cleared = before - todos.length;
    if (cleared > 0) {
      save();
      broadcastChanged();
    }
    return cleared;
  });

  // Reminder toast buttons. The toast renderer sends the TOAST id
  // (`reminder:<reminderId>`); translate back to the reminder.
  ipcMain.on(IPC.reminders.toastDone, (_event, payload: { id?: unknown }) => {
    const id = reminderIdFromToastId(payload?.id);
    if (!id) return;
    const before = reminders.length;
    reminders = reminders.filter((r) => r.id !== id);
    if (reminders.length === before) return;
    save();
    broadcastChanged();
    dlog('REMINDERS:toast-done', { id });
  });

  ipcMain.on(IPC.reminders.toastSnooze, (_event, payload: { id?: unknown }) => {
    const id = reminderIdFromToastId(payload?.id);
    if (!id) return;
    const r = reminders.find((x) => x.id === id);
    if (!r) return;
    r.dueAt = Date.now() + SNOOZE_MS;
    r.firedAt = null;
    save();
    broadcastChanged();
    dlog('REMINDERS:toast-snooze', { id, dueAt: r.dueAt });
  });
}
