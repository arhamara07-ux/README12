// App state, persistence (localStorage) and undo.
import { nextOccurrence, toDateInput } from './dates.js';

const KEY = 'remindly.v1';
const listeners = new Set();

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const LIST_COLORS = ['#5b5bf6', '#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#20c997', '#22b8cf', '#4dabf7', '#cc5de8', '#f06595', '#868e96'];
export const LIST_ICONS = ['📌', '🏠', '💼', '🛒', '❤️', '💊', '💸', '🎓', '✈️', '🎉', '🏋️', '🐶', '🌱', '📚', '🎮', '🍳', '🚗', '🧾', '🎁', '⭐'];

export const PRIORITIES = [
  { v: 0, label: 'None', color: 'var(--muted)' },
  { v: 1, label: 'Low', color: '#4dabf7' },
  { v: 2, label: 'Medium', color: '#ffa94d' },
  { v: 3, label: 'High', color: '#ff6b6b' },
];

const defaultSettings = () => ({
  theme: 'dark', // auto | light | dark
  accent: 'mono', // 'mono' or a hex color
  notifications: false,
  sound: true,
  uiSounds: true,
  haptics: true,
  h24: false,
  defaultTime: '09:00',
  defaultAlert: 0, // minutes before due
  digest: true,
  digestTime: '08:00',
  showCompleted: false,
  name: '',
});

function seed() {
  const lists = [
    { id: 'personal', name: 'Personal', color: '#5b5bf6', icon: '🏠', glyph: 'loop' },
    { id: 'work', name: 'Work', color: '#4dabf7', icon: '💼', glyph: 'grid' },
    { id: 'shopping', name: 'Shopping', color: '#51cf66', icon: '🛒', glyph: 'bag' },
    { id: 'health', name: 'Health', color: '#ff6b6b', icon: '❤️', glyph: 'wave' },
    { id: 'bills', name: 'Bills', color: '#ffa94d', icon: '💸', glyph: 'rings' },
  ];
  const at = (days, h, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const r = (o) => ({ ...blankReminder(), ...o });
  const reminders = [
    r({
      title: 'Welcome to Remindly 👋',
      notes: 'Tap a reminder to edit it. Swipe right to complete, left to delete. Try the quick-add bar: "Call mom tomorrow at 6pm #personal !!"',
      listId: 'personal',
      pinned: true,
    }),
    r({ title: 'Drink a glass of water', due: at(0, new Date().getHours() + 1), repeat: { type: 'daily', interval: 1 }, listId: 'health', tags: ['habit'] }),
    r({
      title: 'Weekly groceries',
      due: at(2, 18),
      listId: 'shopping',
      subtasks: [
        { id: uid(), title: 'Milk', done: false },
        { id: uid(), title: 'Eggs', done: true },
        { id: uid(), title: 'Fresh fruit', done: false },
      ],
    }),
    r({ title: 'Pay phone bill', due: at(5, 10), listId: 'bills', priority: 3, repeat: { type: 'monthly', interval: 1 } }),
    r({ title: 'Plan the week', due: at(1, 9), listId: 'work', priority: 2, tags: ['planning'] }),
  ];
  return { version: 1, lists, reminders, log: [], settings: defaultSettings(), meta: { created: Date.now(), lastDigest: null, onboarded: false, design: 2 } };
}

export function blankReminder() {
  return {
    id: uid(),
    title: '',
    notes: '',
    due: null,
    alertBefore: 0,
    repeat: { type: 'none', interval: 1 },
    priority: 0,
    listId: 'personal',
    tags: [],
    subtasks: [],
    pinned: false,
    done: false,
    doneAt: null,
    snoozedUntil: null,
    fired: [],
    createdAt: Date.now(),
    url: '',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const s = JSON.parse(raw);
    s.settings = { ...defaultSettings(), ...s.settings };
    s.meta = { lastDigest: null, onboarded: true, ...s.meta };
    s.log = s.log || [];
    s.lists = s.lists || [];
    s.reminders = (s.reminders || []).map((r) => ({ ...blankReminder(), ...r }));
    // One-time move to the monochrome "v2" look.
    if ((s.meta.design || 1) < 2) {
      s.settings.theme = 'dark';
      s.settings.accent = 'mono';
      s.meta.design = 2;
    }
    return s;
  } catch (e) {
    console.warn('Failed to load state, starting fresh', e);
    return seed();
  }
}

export const state = load();

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Save failed', e);
    }
  }, 60);
}

export function flush() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  persist();
  listeners.forEach((fn) => fn(reason));
}

/* ---------- Undo ---------- */
let undoSnapshot = null;
function snapshot() {
  undoSnapshot = JSON.stringify({ reminders: state.reminders, lists: state.lists, log: state.log });
}
export function undo() {
  if (!undoSnapshot) return false;
  const s = JSON.parse(undoSnapshot);
  state.reminders = s.reminders;
  state.lists = s.lists;
  state.log = s.log;
  undoSnapshot = null;
  emit('undo');
  return true;
}

/* ---------- Queries ---------- */
export const getReminder = (id) => state.reminders.find((r) => r.id === id);
export const getList = (id) => state.lists.find((l) => l.id === id) || state.lists[0] || { id: 'none', name: 'Reminders', color: '#868e96', icon: '📌' };

export function sortReminders(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.due && b.due) return new Date(a.due) - new Date(b.due) || b.priority - a.priority;
  if (a.due) return -1;
  if (b.due) return 1;
  return b.priority - a.priority || a.createdAt - b.createdAt;
}

export const effectiveDue = (r) => (r.snoozedUntil && new Date(r.snoozedUntil) > new Date(r.due || 0) ? r.snoozedUntil : r.due);

/* ---------- Mutations ---------- */
export function saveReminder(data) {
  snapshot();
  const existing = getReminder(data.id);
  if (existing) {
    const dueChanged = existing.due !== data.due || existing.alertBefore !== data.alertBefore;
    Object.assign(existing, data);
    if (dueChanged) {
      existing.fired = [];
      existing.snoozedUntil = null;
      skipPastAlerts(existing);
    }
  } else {
    const r = { ...blankReminder(), ...data };
    skipPastAlerts(r);
    state.reminders.push(r);
  }
  emit('save');
}

// A reminder created or moved into the past shouldn't immediately fire a notification.
function skipPastAlerts(r) {
  if (r.due && new Date(r.due) <= Date.now()) r.fired = [`due@${r.due}`, `pre@${r.due}`];
}

export function addReminder(data) {
  const r = { ...blankReminder(), alertBefore: state.settings.defaultAlert, ...data };
  skipPastAlerts(r);
  snapshot();
  state.reminders.push(r);
  emit('add');
  return r;
}

/** Complete a reminder. Repeating ones roll forward to their next occurrence. Returns 'rolled' | 'done'. */
export function completeReminder(id) {
  const r = getReminder(id);
  if (!r) return null;
  snapshot();
  state.log.push({ id: r.id, title: r.title, listId: r.listId, at: Date.now() });
  if (state.log.length > 3000) state.log.splice(0, state.log.length - 3000);
  if (r.repeat && r.repeat.type !== 'none' && r.due) {
    r.due = nextOccurrence(r.due, r.repeat);
    r.fired = [];
    r.snoozedUntil = null;
    r.subtasks.forEach((s) => (s.done = false));
    emit('complete');
    return 'rolled';
  }
  r.done = true;
  r.doneAt = Date.now();
  emit('complete');
  return 'done';
}

export function uncompleteReminder(id) {
  const r = getReminder(id);
  if (!r) return;
  snapshot();
  r.done = false;
  r.doneAt = null;
  // drop the most recent log entry for this reminder
  for (let i = state.log.length - 1; i >= 0; i--) {
    if (state.log[i].id === id) {
      state.log.splice(i, 1);
      break;
    }
  }
  emit('uncomplete');
}

export function deleteReminder(id) {
  snapshot();
  state.reminders = state.reminders.filter((r) => r.id !== id);
  emit('delete');
}

export function duplicateReminder(id) {
  const r = getReminder(id);
  if (!r) return null;
  snapshot();
  const copy = { ...JSON.parse(JSON.stringify(r)), id: uid(), title: r.title + ' (copy)', done: false, doneAt: null, fired: [], createdAt: Date.now() };
  copy.subtasks.forEach((s) => (s.id = uid()));
  state.reminders.push(copy);
  emit('add');
  return copy;
}

export function snoozeReminder(id, minutes, from = Date.now()) {
  const r = getReminder(id);
  if (!r) return;
  snapshot();
  r.snoozedUntil = new Date(from + minutes * 60_000).toISOString();
  emit('snooze');
}

export function togglePin(id) {
  const r = getReminder(id);
  if (!r) return;
  snapshot();
  r.pinned = !r.pinned;
  emit('pin');
}

export function toggleSubtask(rid, sid) {
  const r = getReminder(rid);
  const s = r && r.subtasks.find((x) => x.id === sid);
  if (!s) return;
  s.done = !s.done;
  emit('subtask');
}

export function markFired(id, key) {
  const r = getReminder(id);
  if (!r || r.fired.includes(key)) return;
  r.fired.push(key);
  if (r.fired.length > 20) r.fired.splice(0, r.fired.length - 20);
  persist();
}

export function clearCompleted() {
  snapshot();
  const n = state.reminders.filter((r) => r.done).length;
  state.reminders = state.reminders.filter((r) => !r.done);
  emit('clear');
  return n;
}

export function saveList(list) {
  snapshot();
  const existing = state.lists.find((l) => l.id === list.id);
  if (existing) Object.assign(existing, list);
  else state.lists.push({ id: uid(), ...list });
  emit('list');
}

export function deleteList(id) {
  if (state.lists.length <= 1) return false;
  snapshot();
  state.lists = state.lists.filter((l) => l.id !== id);
  const fallback = state.lists[0].id;
  state.reminders.forEach((r) => {
    if (r.listId === id) r.listId = fallback;
  });
  emit('list');
  return true;
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  emit('settings');
}

export function setMeta(patch) {
  Object.assign(state.meta, patch);
  persist();
}

/* ---------- Backup ---------- */
export function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `remindly-backup-${toDateInput(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function importData(json) {
  const s = JSON.parse(json);
  if (!s || !Array.isArray(s.reminders) || !Array.isArray(s.lists)) throw new Error('Not a Remindly backup file');
  snapshot();
  state.reminders = s.reminders.map((r) => ({ ...blankReminder(), ...r }));
  state.lists = s.lists;
  state.log = s.log || [];
  state.settings = { ...defaultSettings(), ...s.settings };
  emit('import');
}

export function resetAll() {
  localStorage.removeItem(KEY);
  location.reload();
}

/* ---------- Stats ---------- */
export function stats() {
  const now = new Date();
  const dayKey = (t) => toDateInput(new Date(t));
  const byDay = new Map();
  state.log.forEach((e) => byDay.set(dayKey(e.at), (byDay.get(dayKey(e.at)) || 0) + 1));
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    week.push({ date: d, count: byDay.get(dayKey(d)) || 0 });
  }
  let streak = 0;
  const cur = new Date(now);
  if (!byDay.get(dayKey(cur))) cur.setDate(cur.getDate() - 1); // streak survives until end of today
  while (byDay.get(dayKey(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  let best = 0;
  let run = 0;
  const keys = [...byDay.keys()].sort();
  let prev = null;
  keys.forEach((k) => {
    const d = new Date(k + 'T12:00');
    run = prev && Math.round((d - prev) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  });
  const open = state.reminders.filter((r) => !r.done);
  const overdue = open.filter((r) => r.due && new Date(r.due) < now).length;
  const perList = state.lists.map((l) => ({ list: l, count: state.log.filter((e) => e.listId === l.id).length }));
  return { week, streak, best, total: state.log.length, weekTotal: week.reduce((a, b) => a + b.count, 0), open: open.length, overdue, perList };
}
