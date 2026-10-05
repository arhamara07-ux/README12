// Date helpers: formatting, relative labels and repeat rules.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d, n) {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dayDiff(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY);
}

export function withTime(d, hh, mm) {
  const x = new Date(d);
  x.setHours(hh, mm, 0, 0);
  return x;
}

export function parseTimeStr(str) {
  const [h, m] = (str || '09:00').split(':').map(Number);
  return [h || 0, m || 0];
}

const pad = (n) => String(n).padStart(2, '0');

export function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateKey(d) {
  return toDateInput(d);
}

export function fmtTime(d, h24 = false) {
  if (h24) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return d.getMinutes() ? `${h}:${pad(d.getMinutes())} ${ap}` : `${h} ${ap}`;
}

export function fmtDate(d, withYear) {
  const now = new Date();
  const y = withYear ?? d.getFullYear() !== now.getFullYear();
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}${y ? ', ' + d.getFullYear() : ''}`;
}

export function relDay(d, now = new Date()) {
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  return fmtDate(d);
}

export function fmtDue(iso, h24) {
  const d = new Date(iso);
  return `${relDay(d)} · ${fmtTime(d, h24)}`;
}

export function fmtCountdown(iso, now = new Date()) {
  const ms = new Date(iso) - now;
  const abs = Math.abs(ms);
  let s;
  if (abs < MIN) s = 'now';
  else if (abs < HOUR) s = `${Math.round(abs / MIN)}m`;
  else if (abs < DAY) s = `${Math.floor(abs / HOUR)}h ${Math.round((abs % HOUR) / MIN)}m`.replace(/ 0m$/, '');
  else s = `${Math.round(abs / DAY)}d`;
  if (s === 'now') return 'due now';
  return ms > 0 ? `in ${s}` : `${s} overdue`;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

/* ---------- Repeat rules ---------- */

export const REPEAT_TYPES = [
  ['none', 'Never'],
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['weekly', 'Every week'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Every month'],
  ['yearly', 'Every year'],
  ['custom', 'Custom days'],
];

export function repeatLabel(rep) {
  if (!rep || rep.type === 'none') return '';
  if (rep.type === 'custom') {
    const days = (rep.days || []).slice().sort();
    if (!days.length) return 'Custom';
    if (days.length === 7) return 'Every day';
    return days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
  }
  if (rep.interval > 1) {
    const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[rep.type];
    if (unit) return `Every ${rep.interval} ${unit}`;
  }
  return (REPEAT_TYPES.find(([k]) => k === rep.type) || [, ''])[1];
}

function stepOnce(d, rep) {
  const n = Math.max(1, rep.interval || 1);
  switch (rep.type) {
    case 'daily':
      return addDays(d, n);
    case 'weekly':
      return addDays(d, 7 * n);
    case 'biweekly':
      return addDays(d, 14);
    case 'monthly':
      return addMonths(d, n);
    case 'yearly':
      return addMonths(d, 12 * n);
    case 'weekdays': {
      let x = addDays(d, 1);
      while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1);
      return x;
    }
    case 'custom': {
      const days = rep.days && rep.days.length ? rep.days : [d.getDay()];
      let x = addDays(d, 1);
      for (let i = 0; i < 8 && !days.includes(x.getDay()); i++) x = addDays(x, 1);
      return x;
    }
    default:
      return null;
  }
}

/** Next occurrence strictly after both the current due date and `now`. */
export function nextOccurrence(iso, rep, now = new Date()) {
  if (!rep || rep.type === 'none') return null;
  let d = new Date(iso);
  for (let i = 0; i < 2000; i++) {
    d = stepOnce(d, rep);
    if (!d) return null;
    if (d > now) return d.toISOString();
  }
  return d.toISOString();
}

/** All occurrences of a (possibly repeating) reminder within [from, to]. */
export function occurrences(iso, rep, from, to, max = 62) {
  const out = [];
  if (!iso) return out;
  let d = new Date(iso);
  if (d >= from && d <= to) out.push(d);
  if (!rep || rep.type === 'none') return out;
  for (let i = 0; i < 1500 && out.length < max; i++) {
    d = stepOnce(d, rep);
    if (!d || d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}
