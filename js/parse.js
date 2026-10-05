// Natural-language quick add:
//   "Call mom tomorrow at 6pm #family !!"
//   "Pay rent every month on the 1st"  → repeat monthly
//   "Stretch in 20 min"
import { addDays, withTime, parseTimeStr, nextOccurrence, WEEKDAYS } from './dates.js';

const DAY_NAMES = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tues: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thurs: 4,
  thur: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_IDX = (m) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase());
const FULL_DAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
const ANY_DAY_RE = '(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)';

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseQuick(input, { lists = [], defaultTime = '09:00', now = new Date() } = {}) {
  let s = ` ${input} `;
  const out = { title: '', due: null, priority: 0, listId: null, tags: [], repeat: null, chips: [] };
  let day = null; // Date (midnight-ish)
  let time = null; // [h, m]
  let exact = null; // Date (for "in 20 min")

  const take = (re, fn) => {
    const m = s.match(re);
    if (!m) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    fn(m);
    return true;
  };

  // Priority: "!!", "!high"
  take(/\s!(high|med|medium|low)(?=\s)/i, (m) => {
    out.priority = { low: 1, med: 2, medium: 2, high: 3 }[m[1].toLowerCase()];
  }) ||
    take(/\s(!{1,3})(?=\s)/, (m) => {
      out.priority = m[1].length;
    });

  // #list or #tag
  let m;
  while ((m = s.match(/\s#([\p{L}\p{N}_-]+)(?=\s)/u))) {
    const word = m[1];
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    const list = lists.find((l) => normalize(l.name) === normalize(word));
    if (list && !out.listId) out.listId = list.id;
    else out.tags.push(word.toLowerCase());
  }

  // Repeat
  take(new RegExp(`\\s(?:every\\s+${FULL_DAY_RE}|every\\s+${ANY_DAY_RE})(?=\\s)`, 'i'), (m) => {
    const d = DAY_NAMES[(m[1] || m[2]).toLowerCase()];
    out.repeat = { type: 'custom', days: [d], interval: 1 };
    day = nextWeekday(now, d, true);
  }) ||
    take(/\severy\s+(\d+)\s+(day|week|month|year)s?(?=\s)/i, (m) => {
      const map = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };
      out.repeat = { type: map[m[2].toLowerCase()], interval: +m[1] };
    }) ||
    take(/\s(?:every\s+(day|weekday|week|month|year|morning|evening|night)|(daily|weekly|monthly|yearly|annually))(?=\s)/i, (m) => {
      const w = (m[1] || m[2]).toLowerCase();
      const map = {
        day: 'daily',
        daily: 'daily',
        morning: 'daily',
        evening: 'daily',
        night: 'daily',
        weekday: 'weekdays',
        week: 'weekly',
        weekly: 'weekly',
        month: 'monthly',
        monthly: 'monthly',
        year: 'yearly',
        yearly: 'yearly',
        annually: 'yearly',
      };
      out.repeat = { type: map[w], interval: 1 };
      if (w === 'morning') time = [9, 0];
      if (w === 'evening') time = [18, 0];
      if (w === 'night') time = [21, 0];
    });

  // Relative: "in 20 min", "in 2 hours", "in 3 days"
  take(/\sin\s+(\d+|an?|half an?)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)(?=\s)/i, (m) => {
    const raw = m[1].toLowerCase();
    let n = raw.startsWith('half') ? 0.5 : raw === 'a' || raw === 'an' ? 1 : +raw;
    const u = m[2].toLowerCase()[0];
    if (u === 'm') exact = new Date(now.getTime() + n * 60_000);
    else if (u === 'h') exact = new Date(now.getTime() + n * 3_600_000);
    else if (u === 'd') day = addDays(now, n);
    else if (u === 'w') day = addDays(now, n * 7);
  });

  // Day words
  take(/\s(day after tomorrow)(?=\s)/i, () => (day = addDays(now, 2))) ||
    take(/\s(today|tonight|tomorrow|tmrw?|tmr|next week|this weekend|weekend|next month)(?=\s)/i, (m) => {
      const w = m[1].toLowerCase();
      if (w === 'today') day = now;
      else if (w === 'tonight') {
        day = now;
        time = time || [20, 0];
      } else if (w.startsWith('tm') || w === 'tomorrow') day = addDays(now, 1);
      else if (w === 'next week') day = nextWeekday(now, 1, false);
      else if (w === 'next month') day = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      else day = nextWeekday(now, 6, false);
    });

  // Weekday: "monday", "next fri", "on tue"
  if (!day)
    take(new RegExp(`\\s(?:(?:next|on|this)\\s+${ANY_DAY_RE}|${FULL_DAY_RE})(?=\\s)`, 'i'), (m) => {
      const w = (m[1] || m[2]).toLowerCase();
      day = nextWeekday(now, DAY_NAMES[w], false);
    });

  // Month dates: "dec 25", "25 dec", "on the 1st"
  if (!day)
    take(new RegExp(`\\s(?:on\\s+)?${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s|,)`, 'i'), (m) => {
      day = futureDate(now, MONTH_IDX(m[1]), +m[2]);
    }) ||
      take(new RegExp(`\\s(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?=\\s)`, 'i'), (m) => {
        day = futureDate(now, MONTH_IDX(m[2]), +m[1]);
      }) ||
      take(/\son\s+the\s+(\d{1,2})(?:st|nd|rd|th)(?=\s)/i, (m) => {
        const d = +m[1];
        let x = new Date(now.getFullYear(), now.getMonth(), d);
        if (x < withTime(now, 0, 0)) x = new Date(now.getFullYear(), now.getMonth() + 1, d);
        day = x;
      });

  // Time: "at 5pm", "5:30 pm", "at 17:30", "noon", "morning"
  take(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i, (m) => {
    let h = +m[1] % 12;
    if (m[3].toLowerCase().startsWith('p')) h += 12;
    time = [h, +(m[2] || 0)];
  }) ||
    take(/\s(?:at\s+|@\s*)(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m) => {
      let h = +m[1];
      // "at 5" most likely means 5pm for a personal app
      if (!m[2] && h >= 1 && h <= 7) h += 12;
      time = [h % 24, +(m[2] || 0)];
    }) ||
    take(/\s(\d{1,2}):(\d{2})(?=\s)/, (m) => {
      time = [+m[1] % 24, +m[2]];
    }) ||
    take(/\s(?:at\s+|in\s+the\s+)?(noon|midday|midnight|morning|afternoon|evening|night)(?=\s)/i, (m) => {
      time = { noon: [12, 0], midday: [12, 0], midnight: [23, 59], morning: [9, 0], afternoon: [15, 0], evening: [18, 0], night: [21, 0] }[m[1].toLowerCase()];
    });

  if (exact) {
    out.due = exact;
  } else if (day || time) {
    const [dh, dm] = parseTimeStr(defaultTime);
    const [h, mi] = time || [dh, dm];
    let d = withTime(day || now, h, mi);
    if (!day && d <= now) d = addDays(d, 1); // time only, already passed → tomorrow
    out.due = d;
  } else if (out.repeat) {
    const [dh, dm] = parseTimeStr(defaultTime);
    let d = withTime(now, dh, dm);
    if (d <= now) d = addDays(d, 1);
    out.due = d;
  }
  if (out.repeat && out.due && out.due <= now) out.due = new Date(nextOccurrence(out.due.toISOString(), out.repeat, now));

  out.title = s
    .replace(/\s+/g, ' ')
    .replace(/\s(at|on|by|in|every)\s*$/i, '')
    .trim()
    .replace(/^(remind me to|remind me|remember to|don't forget to)\s+/i, '');
  if (out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);

  // Chips for the live preview
  if (out.due) out.chips.push({ kind: 'date', due: out.due });
  if (out.repeat) out.chips.push({ kind: 'repeat', repeat: out.repeat });
  if (out.priority) out.chips.push({ kind: 'priority', priority: out.priority });
  if (out.listId) out.chips.push({ kind: 'list', listId: out.listId });
  out.tags.forEach((t) => out.chips.push({ kind: 'tag', tag: t }));
  return out;
}

// The upcoming occurrence of a weekday. "next fri" and "fri" both mean the
// nearest Friday after today; `allowToday` lets "every mon" start today.
function nextWeekday(now, target, allowToday) {
  let diff = (target - now.getDay() + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  return addDays(now, diff);
}

function futureDate(now, month, date) {
  let d = new Date(now.getFullYear(), month, date);
  if (d < withTime(now, 0, 0)) d = new Date(now.getFullYear() + 1, month, date);
  return d;
}

export const QUICK_HINTS = [
  'Call mom tomorrow at 6pm',
  'Pay rent every month on the 1st #bills',
  'Take vitamins every morning #health',
  'Stand up and stretch in 45 min',
  'Dentist appointment next tue at 10am !!',
  'Buy milk tonight #shopping',
  `Team sync every ${WEEKDAYS[1].toLowerCase()} at 9:30am #work`,
];
