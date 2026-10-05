import * as S from './store.js';
import { state, getList, getReminder, sortReminders, PRIORITIES } from './store.js';
import * as D from './dates.js';
import { parseQuick, QUICK_HINTS } from './parse.js';
import * as N from './notify.js';
import { mountArt, orb, glyphFor, GLYPH_NAMES } from './art.js';
import { sfx } from './sfx.js';

/* =========================================================
   Helpers
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const haptic = (p = 8) => state.settings.haptics && navigator.vibrate && navigator.vibrate(p);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const h24 = () => state.settings.h24;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const TABS = ['today', 'upcoming', 'calendar', 'lists', 'me'];
const TITLES = { today: 'Today', upcoming: 'Upcoming', calendar: 'Calendar', lists: 'Lists', me: 'Me' };

const ui = {
  tab: 'today',
  calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calSel: D.startOfDay(new Date()),
  page: null, // { type: 'list'|'smart'|'search', ... }
  showDoneToday: false,
  showDoneInList: false,
  lastMinute: -1,
  lastDay: D.dateKey(new Date()),
};

const viewsEl = $('#views');
const viewEl = (name) => $(`.view[data-view="${name}"]`);
const pageEl = $('#page');
const topbar = $('#topbar');
const fab = $('#fab');

/* =========================================================
   Theme
   ========================================================= */
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && darkMQ.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const a = state.settings.accent;
  const root = document.documentElement.style;
  if (!a || a === 'mono') {
    root.removeProperty('--accent');
    root.removeProperty('--accent-ink');
  } else {
    root.setProperty('--accent', a);
    root.setProperty('--accent-ink', '#fff');
  }
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#000000' : '#f4f4f2');
}
darkMQ.addEventListener?.('change', applyTheme);

/* =========================================================
   Reminder helpers
   ========================================================= */
const now = () => new Date();
const isSnoozed = (r) => r.snoozedUntil && new Date(r.snoozedUntil) > now();
const isRepeating = (r) => r.repeat && r.repeat.type !== 'none';
const open = () => state.reminders.filter((r) => !r.done);

function todayBuckets() {
  const n = now();
  const end = D.endOfDay(n);
  const o = open();
  const overdue = o.filter((r) => r.due && new Date(r.due) < D.startOfDay(n)).sort(sortReminders);
  const today = o.filter((r) => r.due && new Date(r.due) >= D.startOfDay(n) && new Date(r.due) <= end).sort(sortReminders);
  const pinned = o.filter((r) => r.pinned && !overdue.includes(r) && !today.includes(r)).sort(sortReminders);
  const anytime = o.filter((r) => !r.due && !r.pinned).sort(sortReminders);
  const doneToday = state.reminders.filter((r) => r.done && r.doneAt && D.sameDay(new Date(r.doneAt), n));
  const completedCount = state.log.filter((e) => D.sameDay(new Date(e.at), n)).length;
  return { overdue, today, pinned, anytime, doneToday, completedCount };
}

function badgeCount() {
  const end = D.endOfDay(now());
  return open().filter((r) => r.due && new Date(r.due) <= end).length;
}

/* =========================================================
   Item rendering
   ========================================================= */
function renderItem(r, opts = {}) {
  const list = getList(r.listId);
  const due = r.due ? new Date(r.due) : null;
  const n = now();
  const parts = [];
  const ghost = opts.ghostDate;

  if (ghost) {
    parts.push(`<span>${icon('clock')}${D.fmtTime(ghost, h24())}</span>`);
  } else if (due) {
    const late = !r.done && due < n && !isSnoozed(r);
    const soon = !r.done && !late && due - n < D.HOUR;
    const label = opts.timeOnly && D.sameDay(due, n) ? D.fmtTime(due, h24()) : D.fmtDue(r.due, h24());
    const cd = !r.done && Math.abs(due - n) < D.DAY && !isSnoozed(r) ? ` · ${D.fmtCountdown(r.due)}` : '';
    parts.push(`<span class="${late ? 'overdue' : soon ? 'soon' : ''}">${icon('clock')}${label}${cd}</span>`);
  }
  if (isSnoozed(r) && !r.done) parts.push(`<span class="snoozed">${icon('alarm')}Snoozed · ${D.fmtTime(new Date(r.snoozedUntil), h24())}</span>`);
  if (isRepeating(r)) parts.push(`<span>${icon('repeat')}${esc(D.repeatLabel(r.repeat))}</span>`);
  if (r.alertBefore > 0 && !r.done) parts.push(`<span>${icon('bell')}${alertLabel(r.alertBefore, true)}</span>`);
  if (!opts.hideList) parts.push(`<span>${orb(glyphFor(list), 14)}${esc(list.name)}</span>`);
  r.tags.forEach((t) => parts.push(`<span class="tag">#${esc(t)}</span>`));
  if (r.subtasks.length) parts.push(`<span>${icon('subtasks')}${r.subtasks.filter((s) => s.done).length}/${r.subtasks.length}</span>`);
  if (r.url) parts.push(`<span>${icon('link')}</span>`);

  const prio = PRIORITIES[r.priority] || PRIORITIES[0];
  const subPct = r.subtasks.length ? Math.round((r.subtasks.filter((s) => s.done).length / r.subtasks.length) * 100) : 0;
  const key = ghost ? `g:${r.id}:${ghost.getTime()}` : `r:${r.id}`;
  const side = [r.pinned ? icon('pin', 'pinned') : '', r.priority ? `<span title="${prio.label} priority">${'!'.repeat(r.priority)}</span>` : ''].join('');

  return `
  <div class="item-wrap" data-flip="${key}" ${ghost ? '' : `data-id="${r.id}"`}>
    ${
      ghost
        ? ''
        : `<div class="item-actions-bg right"><span>${icon('check')}${isRepeating(r) ? 'Done · next' : 'Complete'}</span></div>
    <div class="item-actions-bg left"><span>Delete${icon('trash')}</span></div>`
    }
    <div class="item ${r.done ? 'done' : ''} ${ghost ? 'ghost' : ''}" data-open="${r.id}" style="--prio-o:${[0, 0.3, 0.6, 1][r.priority] || 0}${ghost ? ';opacity:.5' : ''}">
      <button class="check ${r.done ? 'on' : ''}" ${ghost ? 'disabled tabindex="-1"' : `data-toggle="${r.id}"`} aria-label="${r.done ? 'Mark as not done' : 'Complete'}">${icon('check')}</button>
      <div class="item-main">
        <div class="item-title">${esc(r.title) || '<span style="color:var(--muted)">Untitled</span>'}</div>
        ${r.notes && !opts.compact ? `<div class="item-notes">${esc(r.notes)}</div>` : ''}
        ${parts.length ? `<div class="meta">${parts.join('')}</div>` : ''}
        ${r.subtasks.length && !r.done ? `<div class="subtask-bar"><i style="width:${subPct}%"></i></div>` : ''}
      </div>
      ${side ? `<div class="item-side">${side}</div>` : ''}
    </div>
  </div>`;
}

const items = (arr, opts) => `<div class="items">${arr.map((r) => renderItem(r, opts)).join('')}</div>`;
const sectionTitle = (title, count, extra = '', cls = '') =>
  `<div class="section-title ${cls}" data-flip="s:${esc(title)}">${esc(title)}${count != null ? `<span class="count">${count}</span>` : ''}${extra ? `<span class="spacer"></span>${extra}` : ''}</div>`;
const empty = (art, title, text) => `<div class="empty"><div class="art">${art}</div><h3>${title}</h3><p>${text}</p></div>`;

function alertLabel(min, short) {
  if (!min) return short ? '' : 'At time of reminder';
  const t = min >= 1440 ? `${min / 1440}d` : min >= 60 ? `${min / 60}h` : `${min}m`;
  return short ? `${t} before` : `${t.replace('d', ' day').replace('h', ' hour').replace('m', ' min')} before`;
}

/* =========================================================
   Views
   ========================================================= */
function phase(n) {
  const h = n.getHours();
  if (h < 5) return { name: 'Night Calm', icon: 'moon' };
  if (h < 9) return { name: 'Morning Rise', icon: 'arrow-ne' };
  if (h < 12) return { name: 'Clear Focus', icon: 'arrow-ne' };
  if (h < 17) return { name: 'Afternoon Flow', icon: 'arrow-ne' };
  if (h < 21) return { name: 'Evening Wind-down', icon: 'moon' };
  return { name: 'Night Calm', icon: 'moon' };
}

const STARTERS = [
  ['drop', 'Drink water', 'Drink water in 1 hour'],
  ['pill', 'Medicine', 'Take my medicine every day at 9am'],
  ['bolt', 'Workout', 'Workout tomorrow at 7am'],
  ['phone', 'Call someone', 'Call mom tonight'],
  ['card', 'Pay a bill', 'Pay rent every month on the 1st'],
  ['leaf', 'Meditate', 'Meditate every day at 8pm'],
  ['book', 'Read', 'Read 20 pages tonight'],
  ['moon', 'Sleep', 'Go to bed at 11pm'],
];

function artCard(art, seed, title, label, attrs) {
  return `<button class="art-card" ${attrs}><canvas data-art="${art}" data-seed="${seed}"></canvas>
    <div class="art-text"><h3>${esc(title)}</h3><span class="art-label">${esc(label)}</span></div></button>`;
}

function notificationNotice() {
  if (state.settings.notifications && N.permission() === 'granted') return '';
  if (state.meta.noticeDismissed || N.permission() === 'unsupported') return '';
  return `<div class="notice">
    <div class="n-ico">${icon('bell')}</div>
    <div class="n-main"><b>Turn on notifications</b><small>Get alerted the moment something is due.</small></div>
    <button class="btn primary" data-action="enable-notifs">Enable</button>
    <button class="x" data-action="dismiss-notice" aria-label="Dismiss">${icon('x')}</button>
  </div>`;
}

const RENDER = {
  today() {
    const n = now();
    const b = todayBuckets();
    const st = S.stats();
    const ph = phase(n);
    const total = b.completedCount + b.today.length + b.overdue.length;
    const left = b.today.length + b.overdue.length;
    const next = open()
      .filter((r) => r.due && new Date(r.due) >= n)
      .sort((a, c) => new Date(a.due) - new Date(c.due))[0];
    const week = open().filter((r) => r.due && new Date(r.due) <= D.endOfDay(D.addDays(n, 6))).length;
    const first = state.settings.name ? state.settings.name.split(' ')[0] : '';

    let html = `<div class="phase-row">
        <div class="phase-icon">${icon(ph.icon)}</div>
        <div class="phase-text"><b>${ph.name}</b><small>${D.WEEKDAYS[n.getDay()]}, ${D.MONTHS[n.getMonth()]} ${n.getDate()}${first ? ` · Hi, ${esc(first)}` : ''}</small></div>
      </div>`;
    html += `<div class="carousel">
      ${
        next
          ? artCard('beams', 1, next.title, `Next · ${D.fmtDue(next.due, h24())}`, `data-open="${next.id}"`)
          : artCard('beams', 1, 'Clear Horizon', 'Nothing scheduled', 'data-action="compose"')
      }
      ${artCard('waves', 2, left ? `${left} left today` : 'Day in Flow', total ? `${Math.round((b.completedCount / total) * 100)}% complete today` : 'Nothing due today', 'data-smart="today"')}
      ${artCard('rings', 3, st.streak ? `${st.streak}-day streak` : 'Begin a Streak', `${st.weekTotal} done this week`, 'data-go="me"')}
      ${artCard('orbit', 4, week ? `${week} this week` : 'Open Week', "See what's ahead", 'data-go="upcoming"')}
    </div>
    <div class="carousel-dots"><i class="on"></i><i></i><i></i><i></i></div>`;
    html += `<button class="focus-pill" data-action="compose"><span>What should I remind you of?</span><span class="plus">${icon('plus')}</span></button>`;
    html += `<div class="starters">${STARTERS.map(([ic, label, text]) => `<button class="starter" data-starter="${esc(text)}">${icon(ic)}${label}</button>`).join('')}</div>`;
    html += notificationNotice();
    if (b.overdue.length) html += sectionTitle('Overdue', b.overdue.length, '', 'danger') + items(b.overdue);
    if (b.pinned.length) html += sectionTitle('Pinned', b.pinned.length) + items(b.pinned);
    if (b.today.length) html += sectionTitle('Today', b.today.length) + items(b.today, { timeOnly: true });
    if (!b.overdue.length && !b.today.length) {
      html += b.completedCount
        ? empty(orb('spark', 64), 'All done for today', `You completed ${plural(b.completedCount, 'reminder')} today. Enjoy the quiet.`)
        : empty(orb('sun', 64), 'Nothing due today', 'Tap a suggestion above, or type something like “Water plants tomorrow at 9am”.');
    }
    if (b.anytime.length) html += sectionTitle('Anytime', b.anytime.length) + items(b.anytime);
    if (b.doneToday.length) {
      html += sectionTitle(
        'Completed today',
        b.doneToday.length,
        `<button class="link" data-action="toggle-done-today">${ui.showDoneToday ? 'Hide' : 'Show'}</button>`,
      );
      if (ui.showDoneToday) html += items(b.doneToday, { compact: true });
    }
    return html;
  },

  upcoming() {
    const n = now();
    const start = D.startOfDay(n);
    const horizon = D.endOfDay(D.addDays(n, 30));
    const o = open().filter((r) => r.due);
    const byDay = new Map();
    const push = (k, entry) => (byDay.get(k) || byDay.set(k, []).get(k)).push(entry);
    const overdue = [];
    o.forEach((r) => {
      if (new Date(r.due) < start) overdue.push(r);
      D.occurrences(r.due, r.repeat, start, horizon, 40).forEach((d, i) => {
        const real = i === 0 && d.getTime() === new Date(r.due).getTime();
        push(D.dateKey(d), { r, d, ghost: !real });
      });
    });
    const later = o.filter((r) => new Date(r.due) > horizon).sort(sortReminders);
    const weekCount = [...Array(7)].reduce((a, _, i) => a + (byDay.get(D.dateKey(D.addDays(n, i))) || []).filter((e) => !e.ghost).length, 0);

    let html = `<div class="hero"><div class="hero-eyebrow">Next 30 days</div><h2>Upcoming</h2>
      <div class="hero-sub">${weekCount ? `${plural(weekCount, 'reminder')} this week` : 'Your week is clear'}</div></div>`;
    html += `<div class="week-strip h-scroll">${[...Array(7)]
      .map((_, i) => {
        const d = D.addDays(n, i);
        const has = (byDay.get(D.dateKey(d)) || []).length;
        return `<button class="${i === 0 ? 'today' : ''} ${has ? 'has' : ''}" data-jump="${D.dateKey(d)}"><small>${D.WEEKDAYS_SHORT[d.getDay()]}</small><b>${d.getDate()}</b><i></i></button>`;
      })
      .join('')}</div>`;
    if (overdue.length) html += sectionTitle('Overdue', overdue.length, '', 'danger') + items(overdue.sort(sortReminders));

    for (let i = 0; i <= 30; i++) {
      const d = D.addDays(n, i);
      const k = D.dateKey(d);
      const entries = (byDay.get(k) || []).sort((a, b) => a.d - b.d || b.r.priority - a.r.priority);
      if (!entries.length && i >= 7) continue;
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : D.WEEKDAYS[d.getDay()];
      html += `<div class="day-group" id="day-${k}" data-flip="d:${k}">
        <div class="day-head"><b>${label}</b><small>${D.MONTHS_SHORT[d.getMonth()]} ${d.getDate()}</small>
        <button class="add-to-day" data-add-day="${k}" aria-label="Add on ${label}">${icon('plus')}</button></div>
        ${entries.length ? `<div class="items">${entries.map((e) => renderItem(e.r, { ghostDate: e.ghost ? e.d : null, timeOnly: true, compact: true })).join('')}</div>` : `<div class="meta" style="margin:0 4px 6px">Nothing planned</div>`}
      </div>`;
    }
    if (later.length) html += sectionTitle('Later', later.length) + items(later, { compact: true });
    return html;
  },

  calendar() {
    return `<div class="hero"><div class="hero-eyebrow">Plan ahead</div><h2>Calendar</h2></div>
      <div class="cal">${calInner()}</div>
      <div id="calDay">${calDay()}</div>`;
  },

  lists() {
    const o = open();
    const b = todayBuckets();
    const smart = [
      ['today', 'Today', 'sun', 'var(--accent)', b.today.length + b.overdue.length],
      ['scheduled', 'Scheduled', 'calendar', '#ff6b6b', o.filter((r) => r.due).length],
      ['all', 'All', 'inbox', '#5c5f66', o.length],
      ['priority', 'Priority', 'flag', '#ffa94d', o.filter((r) => r.priority >= 2).length],
      ['pinned', 'Pinned', 'pin', '#cc5de8', o.filter((r) => r.pinned).length],
      ['completed', 'Completed', 'check', '#2fb36d', state.reminders.filter((r) => r.done).length],
    ];
    let html = `<div class="hero"><div class="hero-eyebrow">Organize</div><h2>Lists</h2></div>`;
    html += `<div class="orb-row">${state.lists
      .map((l) => {
        const openN = state.reminders.filter((r) => r.listId === l.id && !r.done).length;
        return `<button class="orb-tile" data-list="${l.id}" data-flip="l:${l.id}">
          <span class="orb-wrap">${orb(glyphFor(l), 74)}${openN ? `<span class="badge">${openN}</span>` : ''}</span>
          <span class="lbl">${esc(l.name)}</span></button>`;
      })
      .join('')}
      <button class="orb-tile add" data-action="new-list"><span class="orb-wrap"><span class="orb" style="--s:74px">${icon('plus')}</span></span><span class="lbl">New list</span></button>
    </div>`;
    html += sectionTitle('Smart lists');
    html += `<div class="smart-grid">${smart
      .map(
        ([k, label, ic, c, count]) =>
          `<button class="smart" data-smart="${k}" style="--c:${c}"><span class="ico">${icon(ic)}</span><b>${count}</b><span>${label}</span></button>`,
      )
      .join('')}</div>`;
    const tags = new Map();
    o.forEach((r) => r.tags.forEach((t) => tags.set(t, (tags.get(t) || 0) + 1)));
    if (tags.size) {
      html += sectionTitle('Tags', tags.size);
      html += `<div class="tag-cloud">${[...tags]
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `<button class="tag-chip" data-tag="${esc(t)}">#${esc(t)}<small>${c}</small></button>`)
        .join('')}</div>`;
    }
    return html;
  },

  me() {
    const st = S.stats();
    const s = state.settings;
    const perm = N.permission();
    const max = Math.max(1, ...st.week.map((w) => w.count));
    const initial = [...(s.name.trim() || '🙂')][0].toUpperCase();
    const sw = (key, on) => `<label class="switch"><input type="checkbox" data-setting="${key}" ${on ? 'checked' : ''}><span></span></label>`;
    const alertOpts = [0, 5, 10, 15, 30, 60, 120, 1440]
      .map((m) => `<option value="${m}" ${s.defaultAlert === m ? 'selected' : ''}>${m ? alertLabel(m) : 'At due time'}</option>`)
      .join('');
    const notifSub =
      perm === 'denied'
        ? 'Blocked in browser settings'
        : perm === 'unsupported'
          ? 'Not supported on this browser'
          : s.notifications && perm === 'granted'
            ? 'On'
            : 'Off';

    return `
    <div class="hero"><div class="profile">
      <div class="avatar">${esc(initial)}</div>
      <div><div class="hero-eyebrow">Your space</div><h2 style="font-size:28px">${esc(s.name || 'Hello there')}</h2>
      <div class="hero-sub" style="margin-top:2px">${plural(st.total, 'reminder')} completed all time</div></div>
    </div></div>

    <div class="stat-grid">
      <div class="stat flame"><small>${icon('flame')}Streak</small><b>${st.streak} <span style="font-size:15px;color:var(--muted)">day${st.streak === 1 ? '' : 's'}</span></b></div>
      <div class="stat"><small>${icon('check-circle')}This week</small><b>${st.weekTotal}</b></div>
      <div class="stat"><small>${icon('list')}Open</small><b>${st.open}</b></div>
      <div class="stat"><small style="${st.overdue ? 'color:var(--danger)' : ''}">${icon('clock')}Overdue</small><b>${st.overdue}</b></div>
    </div>

    <div class="section-title">Activity</div>
    <div class="chart">
      <div class="chart-head"><b>Completed · last 7 days</b><small>Best streak ${st.best}d</small></div>
      <div class="bars">${st.week
        .map(
          (
            w,
            i,
          ) => `<div class="bar-col ${i === 6 ? 'today' : ''}"><div class="bar" style="height:${(w.count / max) * 100}%;--i:${i}">${w.count ? `<em>${w.count}</em>` : ''}</div>
          <small>${i === 6 ? 'Today' : D.WEEKDAYS_SHORT[w.date.getDay()]}</small></div>`,
        )
        .join('')}</div>
    </div>

    <div class="section-title">Notifications</div>
    <div class="settings">
      <div class="row"><span class="ri" style="--c:#ff6b6b">${icon('bell')}</span><span class="rl">Notifications<small>${notifSub}</small></span>${sw('notifications', s.notifications && perm === 'granted')}</div>
      <button class="row" data-action="test-notif"><span class="ri" style="--c:#4dabf7">${icon('sparkles')}</span><span class="rl">Send a test notification</span>${icon('chev-right')}</button>
      <div class="row"><span class="ri" style="--c:#ffa94d">${icon('alarm')}</span><span class="rl">Default early alert</span><select data-setting="defaultAlert">${alertOpts}</select></div>
      <div class="row"><span class="ri" style="--c:#fab005">${icon('sun')}</span><span class="rl">Morning summary<small>A daily overview of what's due</small></span>${sw('digest', s.digest)}</div>
      <div class="row"><span class="ri" style="--c:#fab005">${icon('clock')}</span><span class="rl">Summary time</span><input type="time" data-setting="digestTime" value="${s.digestTime}"></div>
      <div class="row"><span class="ri">♪</span><span class="rl">Alert chime<small>Plays when a reminder is due</small></span>${sw('sound', s.sound)}</div>
      <div class="row"><span class="ri">◌</span><span class="rl">Interface sounds<small>Soft tones as you tap and swipe</small></span>${sw('uiSounds', s.uiSounds !== false)}</div>
      <div class="row"><span class="ri">〰</span><span class="rl">Vibration</span>${sw('haptics', s.haptics)}</div>
    </div>

    <div class="section-title">Appearance</div>
    <div class="settings">
      <div class="row"><span class="rl">Theme</span>
        <div class="segmented" data-seg="theme">${['auto', 'light', 'dark'].map((t) => `<button class="${s.theme === t ? 'on' : ''}" data-val="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
      <div class="row" style="padding-bottom:0"><span class="rl">Accent color</span></div>
      <div class="swatches">${['mono', '#8e8cff', '#5ac8fa', '#63e6be', '#ffd43b', '#ff8787', '#f783ac', '#d0bfff']
        .map(
          (c) =>
            `<button class="swatch ${c === 'mono' ? 'mono' : ''} ${(s.accent || 'mono') === c ? 'on' : ''}" style="--c:${c}" data-accent="${c}" aria-label="${c === 'mono' ? 'Monochrome' : 'Accent ' + c}"></button>`,
        )
        .join('')}</div>
      <div class="row"><span class="rl">24-hour time</span>${sw('h24', s.h24)}</div>
    </div>

    <div class="section-title">General</div>
    <div class="settings">
      <div class="row"><span class="rl">Your name</span><input type="text" data-setting="name" value="${esc(s.name)}" placeholder="Add name" maxlength="40"></div>
      <div class="row"><span class="rl">Default time<small>Used when you give a date without a time</small></span><input type="time" data-setting="defaultTime" value="${s.defaultTime}"></div>
    </div>

    <div class="section-title">Data</div>
    <div class="settings">
      <button class="row" data-action="export"><span class="ri" style="--c:#4dabf7">${icon('download')}</span><span class="rl">Export backup<small>Download all reminders as JSON</small></span></button>
      <button class="row" data-action="import"><span class="ri" style="--c:#51cf66">${icon('upload')}</span><span class="rl">Import backup</span></button>
      <button class="row" data-action="clear-completed"><span class="ri" style="--c:#868e96">${icon('check-circle')}</span><span class="rl">Clear completed</span></button>
      <button class="row danger" data-action="reset"><span class="ri" style="--c:var(--danger)">${icon('trash')}</span><span class="rl">Erase everything</span></button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <p class="footer-note">Remindly · Works offline · Your data stays on this device</p>`;
  },
};

/* ---------- Calendar parts ---------- */
function calendarCounts(from, to) {
  const map = new Map();
  open().forEach((r) =>
    D.occurrences(r.due, r.repeat, from, to, 45).forEach((d) => {
      const k = D.dateKey(d);
      const arr = map.get(k) || map.set(k, []).get(k);
      arr.push(getList(r.listId).color);
    }),
  );
  return map;
}

function calInner() {
  const m = ui.calMonth;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const gridStart = D.addDays(first, -first.getDay());
  const gridEnd = D.endOfDay(D.addDays(gridStart, 41));
  const counts = calendarCounts(gridStart, gridEnd);
  const today = now();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = D.addDays(gridStart, i);
    const k = D.dateKey(d);
    const dots = (counts.get(k) || []).slice(0, 3);
    const cls = [d.getMonth() !== m.getMonth() ? 'out' : '', D.sameDay(d, today) ? 'today' : '', D.sameDay(d, ui.calSel) ? 'sel' : ''].join(' ');
    cells += `<button class="${cls}" data-day="${k}"><span>${d.getDate()}</span><span class="dots">${dots.map((c) => `<i style="--c:${c}"></i>`).join('')}</span></button>`;
  }
  return `<div class="cal-head"><b>${D.MONTHS[m.getMonth()]} ${m.getFullYear()}</b>
      <div class="nav"><button class="today-btn" data-cal="today">Today</button>
      <button class="icon-btn" data-cal="-1" aria-label="Previous month">${icon('chev-left')}</button>
      <button class="icon-btn" data-cal="1" aria-label="Next month">${icon('chev-right')}</button></div></div>
    <div class="cal-dow">${D.WEEKDAYS_SHORT.map((d) => `<span>${d[0]}</span>`).join('')}</div>
    <div class="cal-grid-wrap"><div class="cal-grid">${cells}</div></div>`;
}

function calDay() {
  const d = ui.calSel;
  const from = D.startOfDay(d);
  const to = D.endOfDay(d);
  const entries = [];
  state.reminders.forEach((r) => {
    if (r.done) {
      if (r.due && D.sameDay(new Date(r.due), d)) entries.push({ r, d: new Date(r.due), ghost: false });
      return;
    }
    D.occurrences(r.due, r.repeat, from, to, 3).forEach((x) => entries.push({ r, d: x, ghost: x.getTime() !== new Date(r.due).getTime() }));
  });
  entries.sort((a, b) => a.r.done - b.r.done || a.d - b.d);
  const label = D.relDay(d);
  return `${sectionTitle(label === D.fmtDate(d) ? label : `${label} · ${D.MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`, entries.length, `<button class="link" data-add-day="${D.dateKey(d)}">+ Add</button>`)}
    ${entries.length ? `<div class="items">${entries.map((e) => renderItem(e.r, { ghostDate: e.ghost ? e.d : null, timeOnly: true, compact: true })).join('')}</div>` : empty(orb('moon', 64), 'Free day', 'No reminders on this day.')}`;
}

function shiftMonth(delta) {
  ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + delta, 1);
  const cal = $('.cal', viewEl('calendar'));
  if (!cal) return;
  cal.innerHTML = calInner();
  if (!reduced() && delta) {
    $('.cal-grid', cal).animate(
      [
        { transform: `translateX(${delta * 40}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 380, easing: EASE },
    );
    $('.cal-head b', cal).animate(
      [
        { transform: `translateY(${delta * 8}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 320, easing: EASE },
    );
  }
}

function selectDay(d) {
  ui.calSel = D.startOfDay(d);
  if (d.getMonth() !== ui.calMonth.getMonth() || d.getFullYear() !== ui.calMonth.getFullYear()) {
    const delta = Math.sign(d - ui.calMonth);
    ui.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    shiftMonth(0);
    if (!reduced())
      $('.cal-grid', viewEl('calendar')).animate(
        [
          { transform: `translateX(${delta * 40}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 380, easing: EASE },
      );
  } else {
    $$('.cal-grid button', viewEl('calendar')).forEach((b) => b.classList.toggle('sel', b.dataset.day === D.dateKey(d)));
  }
  const box = $('#calDay');
  box.innerHTML = calDay();
  if (!reduced())
    box.animate(
      [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 320, easing: EASE },
    );
}

/* =========================================================
   Rendering pipeline (with FLIP for smooth re-ordering)
   ========================================================= */
const dirty = new Set(TABS);

function flip(container, mutate) {
  if (reduced()) return mutate();
  const before = new Map();
  const vh = innerHeight;
  $$('[data-flip]', container).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > -100 && r.top < vh + 100) before.set(el.dataset.flip, r);
  });
  mutate();
  $$('[data-flip]', container).forEach((el) => {
    const a = el.getBoundingClientRect();
    if (a.bottom < -100 || a.top > vh + 100) return;
    const b = before.get(el.dataset.flip);
    if (b) {
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 460, easing: EASE });
    } else if (before.size) {
      el.animate(
        [
          { opacity: 0, transform: 'scale(0.97)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 360, easing: EASE },
      );
    }
  });
}

function stagger(root) {
  if (reduced()) return;
  root.classList.add('stagger');
  [...root.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
  setTimeout(() => root.classList.remove('stagger'), 900);
}

function renderView(name, { animate = false, enter = false } = {}) {
  const el = viewEl(name);
  const html = `<div class="view-inner">${RENDER[name]()}</div>`;
  // Keep horizontal scrollers (art carousel, chips) where the user left them.
  const keep = $$('.carousel, .starters, .orb-row', el).map((x) => x.scrollLeft);
  if (animate) flip(el, () => (el.innerHTML = html));
  else el.innerHTML = html;
  $$('.carousel, .starters, .orb-row', el).forEach((x, i) => keep[i] && (x.scrollLeft = keep[i]));
  if (enter) stagger(el.firstElementChild);
  mountArt(el);
  updateDots(el);
  dirty.delete(name);
}

function refresh() {
  TABS.forEach((t) => dirty.add(t));
  if (!gesture.active) renderView(ui.tab, { animate: true });
  if (ui.page) renderPage({ animate: true });
  updateBadges();
}

function updateBadges() {
  const n = badgeCount();
  const b = $('[data-badge="today"]');
  b.textContent = n > 99 ? '99+' : n;
  b.classList.toggle('show', n > 0);
  N.updateBadge();
}

/* =========================================================
   Tabs & transitions
   ========================================================= */
/** Slide the tab pill under a tab; `to` + `p` interpolate mid-swipe. */
function placeIndicator(name, to = null, p = 0) {
  const a = $(`.tab[data-tab="${name}"]`);
  const b = to ? $(`.tab[data-tab="${to}"]`) : a;
  const x = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p;
  const w = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p;
  const ind = $('#tabIndicator');
  ind.style.transform = `translateX(${x}px)`;
  ind.style.width = `${w}px`;
}
addEventListener('resize', () => placeIndicator(ui.tab));
document.fonts?.ready.then(() => placeIndicator(ui.tab));

/** Carousel page dots */
function updateDots(root) {
  const c = $('.carousel', root);
  const dots = $$('.carousel-dots i', root);
  if (!c || !dots.length) return;
  const card = c.firstElementChild;
  const i = Math.round(c.scrollLeft / ((card?.offsetWidth || 1) + 12));
  dots.forEach((d, k) => d.classList.toggle('on', k === Math.min(i, dots.length - 1)));
}

function syncChrome(name) {
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  placeIndicator(name);
  $('#topTitle').textContent = TITLES[name];
  topbar.classList.toggle('scrolled', viewEl(name).scrollTop > 40);
  fab.classList.toggle('hidden', name === 'me');
}

function settleViews(active) {
  $$('.view').forEach((v) => {
    v.getAnimations().forEach((a) => a.cancel());
    v.classList.toggle('active', v.dataset.view === active);
    v.classList.remove('animating');
    v.style.transform = '';
    v.style.opacity = '';
  });
}

function setTab(name, { instant = false } = {}) {
  const prev = ui.tab;
  if (name === prev && !instant) {
    viewEl(name).scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    return;
  }
  haptic(6);
  sfx.tab(TABS.indexOf(name));
  ui.tab = name;
  const wasDirty = dirty.has(name);
  if (wasDirty) renderView(name, { enter: !instant });
  syncChrome(name);
  if (instant || reduced() || name === prev) return settleViews(name);

  settleViews(prev);
  const from = viewEl(prev);
  const to = viewEl(name);
  const dir = TABS.indexOf(name) > TABS.indexOf(prev) ? 1 : -1;
  from.classList.add('animating');
  to.classList.add('active');
  from.classList.remove('active');
  from.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translateX(${-dir * 14}%)`, opacity: 0 },
    ],
    { duration: 300, easing: EASE, fill: 'forwards' },
  );
  const inn = to.animate(
    [
      { transform: `translateX(${dir * 14}%)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 420, easing: EASE },
  );
  inn.onfinish = () => {
    if (ui.tab === name) settleViews(name);
  };
}

/* Interactive swipe between tabs (touch) */
const gesture = { active: false };
let suppressClick = false;
function swallowNextClick() {
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 60);
}
window.addEventListener(
  'click',
  (e) => {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    }
  },
  true,
);

(function tabSwipe() {
  let s = null;
  viewsEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || ui.page) return;
    if (e.target.closest('.item-wrap, .cal-grid-wrap, input, select, textarea, .h-scroll, .segmented, .swatches')) return;
    s = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, active: false };
  });
  viewsEl.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (s = null);
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      s.active = gesture.active = true;
      settleViews(ui.tab);
      s.dir = dx < 0 ? 1 : -1;
      s.w = viewsEl.clientWidth;
      s.cur = viewEl(ui.tab);
      const idx = TABS.indexOf(ui.tab) + s.dir;
      s.nextName = TABS[idx];
      s.next = s.nextName ? viewEl(s.nextName) : null;
      if (s.next) {
        if (dirty.has(s.nextName)) renderView(s.nextName);
        s.next.classList.add('animating');
      }
      try {
        viewsEl.setPointerCapture(e.pointerId);
      } catch {}
    }
    let tx = s.dir === 1 ? Math.min(dx, 0) : Math.max(dx, 0);
    if (!s.next) tx *= 0.2;
    s.tx = tx;
    s.cur.style.transform = `translateX(${tx}px)`;
    if (s.next) s.next.style.transform = `translateX(${tx + s.dir * s.w}px)`;
    // indicator follows the finger
    const p = Math.abs(tx) / s.w;
    placeIndicator(ui.tab, s.nextName, s.next ? p : 0);
  });
  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const st = s;
    s = null;
    if (!st.active) return;
    swallowNextClick();
    gesture.active = false;
    const v = (st.tx || 0) / (performance.now() - st.t);
    const commit = st.next && (Math.abs(st.tx) > st.w * 0.28 || Math.abs(v) > 0.45);
    const dur = 340;
    if (commit) {
      const target = st.nextName;
      const a1 = st.cur.animate([{ transform: `translateX(${st.tx}px)` }, { transform: `translateX(${-st.dir * st.w}px)` }], {
        duration: dur,
        easing: EASE,
        fill: 'forwards',
      });
      st.next.animate([{ transform: `translateX(${st.tx + st.dir * st.w}px)` }, { transform: 'none' }], { duration: dur, easing: EASE, fill: 'forwards' });
      st.cur.style.transform = st.next.style.transform = '';
      ui.tab = target;
      syncChrome(target);
      haptic(6);
      sfx.tab(TABS.indexOf(target));
      a1.onfinish = () => settleViews(ui.tab);
    } else {
      st.cur.animate([{ transform: `translateX(${st.tx}px)` }, { transform: 'none' }], { duration: dur, easing: EASE });
      if (st.next) {
        const a = st.next.animate([{ transform: `translateX(${st.tx + st.dir * st.w}px)` }, { transform: `translateX(${st.dir * st.w}px)` }], {
          duration: dur,
          easing: EASE,
        });
        a.onfinish = () => settleViews(ui.tab);
      }
      st.cur.style.transform = '';
      if (st.next) st.next.style.transform = `translateX(${st.dir * st.w}px)`;
      syncChrome(ui.tab);
      if (!st.next) settleViews(ui.tab);
    }
    if (dirty.has(ui.tab)) renderView(ui.tab);
  };
  viewsEl.addEventListener('pointerup', end);
  viewsEl.addEventListener('pointercancel', end);
})();

/* Collapsing large title → compact topbar */
viewsEl.addEventListener(
  'scroll',
  (e) => {
    if (e.target.dataset?.view === ui.tab) topbar.classList.toggle('scrolled', e.target.scrollTop > 40);
    else if (e.target.classList?.contains('carousel')) {
      const before = $('.carousel-dots i.on', e.target.parentElement);
      updateDots(e.target.parentElement);
      if (before && before !== $('.carousel-dots i.on', e.target.parentElement)) sfx.tap();
    }
  },
  true,
);

/* =========================================================
   Overlays & history (Android back button support)
   ========================================================= */
const overlays = [];
let ignorePops = 0;
function pushOverlay(name) {
  overlays.push(name);
  history.pushState({ ov: overlays.length }, '');
}
function dropOverlay(name) {
  const i = overlays.lastIndexOf(name);
  if (i < 0) return;
  overlays.splice(i, 1);
  ignorePops++;
  history.back();
}
window.addEventListener('popstate', () => {
  if (ignorePops > 0) return void ignorePops--;
  const top = overlays.pop();
  if (top === 'page') closePage(true);
  else if (top === 'sheet') closeSheet(true);
  else if (top === 'composer') closeComposer(true);
});

/* =========================================================
   Sub-pages (list detail, smart lists, search)
   ========================================================= */
const SMART = {
  today: { title: 'Today', ico: 'sun', filter: (r) => !r.done && r.due && new Date(r.due) <= D.endOfDay(now()) },
  overdue: { title: 'Overdue', ico: 'bolt', filter: (r) => !r.done && r.due && new Date(r.due) < D.startOfDay(now()) },
  scheduled: { title: 'Scheduled', ico: 'grid', filter: (r) => !r.done && r.due },
  all: { title: 'All reminders', ico: 'cube', filter: (r) => !r.done },
  priority: { title: 'Priority', ico: 'peaks', filter: (r) => !r.done && r.priority >= 2 },
  pinned: { title: 'Pinned', ico: 'spark', filter: (r) => !r.done && r.pinned },
  completed: { title: 'Completed', ico: 'rings', filter: (r) => r.done, sort: (a, b) => (b.doneAt || 0) - (a.doneAt || 0) },
};

function pageContent() {
  const p = ui.page;
  if (p.type === 'search') return searchPage();
  let title;
  let glyph;
  let rs;
  let doneRs = [];
  let hideList = false;
  if (p.type === 'list') {
    const l = getList(p.id);
    title = l.name;
    glyph = glyphFor(l);
    hideList = true;
    const all = state.reminders.filter((r) => r.listId === l.id);
    rs = all.filter((r) => !r.done).sort(sortReminders);
    doneRs = all.filter((r) => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  } else {
    const sm = SMART[p.key];
    title = sm.title;
    glyph = sm.ico;
    rs = state.reminders.filter(sm.filter).sort(sm.sort || sortReminders);
  }
  const head = `<div class="page-head"><div class="page-head-inner">
      <button class="back-btn" data-action="back">${icon('chev-left')}Back</button>
      <div class="title">${esc(title)}</div>
      ${p.type === 'list' ? `<button class="icon-btn" data-action="edit-list" data-id="${p.id}" aria-label="Edit list">${icon('more')}</button>` : p.key === 'completed' && rs.length ? `<button class="icon-btn" data-action="clear-completed" aria-label="Clear completed">${icon('trash')}</button>` : '<span style="width:40px"></span>'}
    </div></div>`;
  let body = `<div class="hero" style="padding-top:4px"><div class="page-hero">${orb(glyph, 60)}<div>
      <h2>${esc(title)}</h2>
      <div class="hero-sub" style="margin-top:4px">${p.key === 'completed' ? plural(rs.length, 'completed reminder') : `${plural(rs.length, 'open reminder')}`}</div></div></div></div>`;
  if (p.type === 'list' || ['today', 'all', 'scheduled'].includes(p.key))
    body += `<button class="add-list-btn" style="margin:0 0 12px" data-action="add-here">${icon('plus')}New reminder</button>`;
  body += rs.length
    ? items(rs, { hideList })
    : empty(
        orb(p.key === 'completed' ? 'leaf' : 'spark', 64),
        p.key === 'completed' ? 'Nothing completed yet' : 'All clear',
        p.key === 'completed' ? 'Completed reminders will show up here.' : 'Nothing here right now.',
      );
  if (doneRs.length) {
    body += sectionTitle('Completed', doneRs.length, `<button class="link" data-action="toggle-done-list">${ui.showDoneInList ? 'Hide' : 'Show'}</button>`);
    if (ui.showDoneInList) body += items(doneRs, { hideList, compact: true });
  }
  return { head, body };
}

function searchPage() {
  const p = ui.page;
  const q = (p.q || '').trim().toLowerCase();
  const f = p.filter || 'open';
  let rs = state.reminders.filter((r) => {
    if (f === 'open' && r.done) return false;
    if (f === 'done' && !r.done) return false;
    if (f === 'high' && (r.done || r.priority < 2)) return false;
    if (f.startsWith('list:') && r.listId !== f.slice(5)) return false;
    if (!q) return true;
    if (q.startsWith('#')) return r.tags.some((t) => t.startsWith(q.slice(1)));
    return [r.title, r.notes, r.tags.join(' '), getList(r.listId).name, r.subtasks.map((s) => s.title).join(' ')].join(' ').toLowerCase().includes(q);
  });
  rs.sort(sortReminders);
  const filters = [['open', 'Open'], ['all', 'All'], ['done', 'Completed'], ['high', 'Priority'], ...state.lists.map((l) => [`list:${l.id}`, l.name])];
  const head = `<div class="page-head"><div class="page-head-inner">
      <button class="back-btn" data-action="back" aria-label="Back">${icon('chev-left')}</button>
      <label class="search-input">${icon('search')}<input id="searchInput" type="search" placeholder="Search reminders, notes, #tags" value="${esc(p.q || '')}" enterkeyhint="search"></label>
    </div></div>`;
  const body = `<div class="filter-row">${filters.map(([k, l]) => `<button class="chip-btn ${f === k ? 'on' : ''}" data-filter="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div id="searchResults">${searchResults(rs, q)}</div>`;
  return { head, body };
}

function searchResults(rs, q) {
  if (!rs.length) return empty(orb('rings', 64), q ? 'No matches' : 'Nothing here', q ? `Nothing found for “${esc(q)}”.` : 'Try a different filter.');
  return sectionTitle('Results', rs.length) + items(rs);
}

function renderPage({ animate = false, enter = false } = {}) {
  if (!ui.page) return;
  // Search keeps its input alive while typing; only the results re-render.
  if (ui.page.type === 'search' && $('#searchInput', pageEl) && !enter) {
    const { body } = searchPage();
    const tmp = document.createElement('div');
    tmp.innerHTML = body;
    $$('[data-filter]', pageEl).forEach((b) => b.classList.toggle('on', b.dataset.filter === (ui.page.filter || 'open')));
    const res = $('#searchResults', pageEl);
    flip(res, () => (res.innerHTML = $('#searchResults', tmp).innerHTML));
    return;
  }
  const { head, body } = pageContent();
  const scroll = $('.page-scroll', pageEl);
  if (scroll && animate) {
    $('.page-head', pageEl).outerHTML = head;
    flip(scroll, () => (scroll.innerHTML = body));
  } else {
    pageEl.innerHTML = `${head}<div class="page-scroll"><div class="page-inner">${body}</div></div>`;
    if (enter) stagger($('.page-inner', pageEl));
  }
}

let pageAnims = [];
const underlay = () => [viewsEl, topbar];

function openPage(p) {
  const wasOpen = !!ui.page;
  ui.page = p;
  renderPage({ enter: true });
  if (wasOpen) return;
  pushOverlay('page');
  sfx.open();
  pageAnims.forEach((a) => a.cancel());
  pageEl.classList.add('open');
  pageEl.setAttribute('aria-hidden', 'false');
  pageEl.style.transform = 'none';
  if (!reduced()) {
    pageAnims = [pageEl.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 480, easing: EASE })];
    underlay().forEach((el) =>
      pageAnims.push(
        el.animate(
          [
            { transform: 'none', filter: 'brightness(1)' },
            { transform: 'translateX(-22%)', filter: 'brightness(.85)' },
          ],
          { duration: 480, easing: EASE, fill: 'forwards' },
        ),
      ),
    );
  }
  if (p.type === 'search') setTimeout(() => $('#searchInput')?.focus(), reduced() ? 0 : 280);
}

function closePage(fromPop = false, fromX = 0) {
  if (!ui.page) return;
  if (!fromPop) dropOverlay('page');
  sfx.close();
  ui.page = null;
  const w = pageEl.clientWidth || innerWidth;
  const finish = () => {
    pageAnims.forEach((a) => a.cancel());
    pageAnims = [];
    pageEl.classList.remove('open');
    pageEl.setAttribute('aria-hidden', 'true');
    pageEl.style.transform = '';
    underlay().forEach((el) => (el.style.transform = el.style.filter = ''));
    pageEl.innerHTML = '';
  };
  document.activeElement?.blur?.();
  if (dirty.has(ui.tab)) renderView(ui.tab);
  if (reduced()) return finish();
  const p = fromX / w;
  pageAnims.forEach((a) => a.cancel());
  const dur = 380 * (1 - p * 0.6);
  const a = pageEl.animate([{ transform: `translateX(${fromX}px)` }, { transform: 'translateX(100%)' }], { duration: dur, easing: EASE, fill: 'forwards' });
  pageAnims = [a];
  underlay().forEach((el) =>
    pageAnims.push(
      el.animate(
        [
          { transform: `translateX(${-22 * (1 - p)}%)`, filter: `brightness(${0.85 + 0.15 * p})` },
          { transform: 'none', filter: 'brightness(1)' },
        ],
        { duration: dur, easing: EASE, fill: 'forwards' },
      ),
    ),
  );
  a.onfinish = finish;
}

/* Swipe right on a page to go back */
(function pageSwipe() {
  let s = null;
  pageEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !ui.page) return;
    if (e.clientX > 40 && e.target.closest('.item-wrap, input, .filter-row')) return;
    s = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, active: false };
  });
  pageEl.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (s = null);
      if (dx < 14 || dx < Math.abs(dy) * 1.3) return;
      s.active = true;
      s.w = pageEl.clientWidth;
      pageAnims.forEach((a) => a.cancel());
      pageAnims = [];
      try {
        pageEl.setPointerCapture(e.pointerId);
      } catch {}
    }
    s.dx = Math.max(0, dx);
    const p = s.dx / s.w;
    pageEl.style.transform = `translateX(${s.dx}px)`;
    underlay().forEach((el) => {
      el.style.transform = `translateX(${-22 * (1 - p)}%)`;
      el.style.filter = `brightness(${0.85 + 0.15 * p})`;
    });
  });
  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const st = s;
    s = null;
    if (!st.active) return;
    swallowNextClick();
    const v = st.dx / (performance.now() - st.t);
    if (st.dx > st.w * 0.33 || v > 0.5) {
      closePage(false, st.dx);
    } else {
      const p = st.dx / st.w;
      pageEl.animate([{ transform: `translateX(${st.dx}px)` }, { transform: 'none' }], { duration: 300, easing: EASE });
      pageEl.style.transform = 'none';
      underlay().forEach((el) => {
        el.animate([{ transform: `translateX(${-22 * (1 - p)}%)` }, { transform: 'translateX(-22%)' }], { duration: 300, easing: EASE });
        el.style.transform = 'translateX(-22%)';
        el.style.filter = 'brightness(.85)';
      });
    }
  };
  pageEl.addEventListener('pointerup', end);
  pageEl.addEventListener('pointercancel', end);
})();

/* =========================================================
   Bottom sheet
   ========================================================= */
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const sheetBackdrop = $('#sheetBackdrop');
let sheetOpen = false;
let sheetAnim = null;
let sheetOnClose = null;

function openSheet(mount, { onClose } = {}) {
  const was = sheetOpen;
  sheetOnClose = onClose || null;
  sheetBody.innerHTML = '';
  mount(sheetBody);
  sheetBody.scrollTop = 0;
  if (was) {
    if (!reduced())
      sheetBody.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 280, easing: EASE },
      );
    return;
  }
  sheetOpen = true;
  pushOverlay('sheet');
  sfx.open();
  sheet.classList.add('show');
  sheetBackdrop.classList.add('show');
  sheetAnim?.cancel();
  sheet.style.transform = 'translate(-50%, 0)';
  if (!reduced()) sheetAnim = sheet.animate([{ transform: 'translate(-50%, 105%)' }, { transform: 'translate(-50%, 0)' }], { duration: 480, easing: EASE });
}

function closeSheet(fromPop = false, fromY = 0) {
  if (!sheetOpen) return;
  if (!fromPop) dropOverlay('sheet');
  sfx.close();
  sheetOpen = false;
  document.activeElement?.blur?.();
  sheetBackdrop.classList.remove('show');
  const cb = sheetOnClose;
  sheetOnClose = null;
  const done = () => {
    sheet.getAnimations().forEach((x) => x.cancel());
    sheet.classList.remove('show');
    sheet.style.transform = '';
    sheetBody.innerHTML = '';
    sheetAnim = null;
  };
  sheetAnim?.cancel();
  if (reduced()) done();
  else {
    sheetAnim = sheet.animate([{ transform: `translate(-50%, ${fromY}px)` }, { transform: 'translate(-50%, 105%)' }], {
      duration: 340,
      easing: EASE,
      fill: 'forwards',
    });
    sheetAnim.onfinish = done;
  }
  cb?.();
}

sheetBackdrop.addEventListener('click', () => closeSheet());

/* Drag the sheet down to dismiss */
(function sheetDrag() {
  let s = null;
  sheet.addEventListener('pointerdown', (e) => {
    const onGrab = e.target.closest('.sheet-grabber') || (e.target.closest('.sheet-top') && !e.target.closest('button'));
    if (!onGrab && (sheetBody.scrollTop > 0 || e.target.closest('input, textarea, select, button, .list-picker, .quick-dates'))) return;
    s = { y: e.clientY, x: e.clientX, t: performance.now(), id: e.pointerId, active: false, grab: !!onGrab };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dy = e.clientY - s.y;
    if (!s.active) {
      if (dy < -6 || Math.abs(e.clientX - s.x) > Math.abs(dy)) return void (s = null);
      if (dy < (s.grab ? 4 : 12)) return;
      s.active = true;
      sheetAnim?.cancel();
      try {
        sheet.setPointerCapture(e.pointerId);
      } catch {}
    }
    s.dy = Math.max(0, dy);
    sheet.style.transform = `translate(-50%, ${s.dy}px)`;
    sheetBackdrop.style.opacity = String(1 - Math.min(1, s.dy / 500));
  });
  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const st = s;
    s = null;
    if (!st.active) return;
    swallowNextClick();
    sheetBackdrop.style.opacity = '';
    const v = st.dy / (performance.now() - st.t);
    if (st.dy > 140 || v > 0.6) closeSheet(false, st.dy);
    else {
      sheet.animate([{ transform: `translate(-50%, ${st.dy}px)` }, { transform: 'translate(-50%, 0)' }], { duration: 360, easing: SPRING });
      sheet.style.transform = 'translate(-50%, 0)';
    }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
})();

/* =========================================================
   Toasts & in-app banner
   ========================================================= */
function toast(msg, { action, onAction, ms = 4200 } = {}) {
  const host = $('#toasts');
  while (host.children.length >= 2) host.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="msg"></span>${action ? `<button>${action === 'Undo' ? icon('undo') : ''}${esc(action)}</button>` : ''}`;
  $('.msg', el).textContent = msg;
  host.appendChild(el);
  const anim = (k) =>
    el.animate(
      k
        ? [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(16px) scale(.96)' },
          ]
        : [
            { opacity: 0, transform: 'translateY(24px) scale(.94)' },
            { opacity: 1, transform: 'none' },
          ],
      { duration: k ? 220 : 420, easing: k ? EASE : SPRING, fill: 'forwards' },
    );
  anim(0);
  let t;
  const remove = () => {
    clearTimeout(t);
    anim(1).onfinish = () => el.remove();
  };
  t = setTimeout(remove, ms);
  if (action)
    $('button', el).addEventListener('click', () => {
      onAction?.();
      remove();
    });
  return remove;
}

const undoToast = (msg) => toast(msg, { action: 'Undo', onAction: () => S.undo() && haptic(10) });

const banner = $('#banner');
let bannerTimer;
let bannerQueue = [];
function showBanner(r, kind) {
  if (banner.classList.contains('show')) {
    bannerQueue.push([r, kind]);
    return;
  }
  const list = getList(r.listId);
  banner.innerHTML = `<div class="b-ico">${orb(glyphFor(list), 42)}</div>
    <div class="b-main"><b></b><small>${kind === 'pre' ? 'Coming up at ' : 'Due '}${D.fmtTime(new Date(r.due), h24())}</small></div>
    <div class="b-act"><button data-b="snooze">Snooze</button><button class="primary" data-b="done">Done</button></div>`;
  $('b', banner).textContent = r.title;
  banner.dataset.id = r.id;
  banner.classList.add('show');
  N.chime();
  haptic([60, 40, 60]);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, 8000);
}
function hideBanner() {
  banner.classList.remove('show');
  clearTimeout(bannerTimer);
  setTimeout(() => {
    const next = bannerQueue.shift();
    if (next) showBanner(...next);
  }, 600);
}
banner.addEventListener('click', (e) => {
  const id = banner.dataset.id;
  const b = e.target.closest('[data-b]');
  if (b?.dataset.b === 'done') completeWithFeedback(id);
  else if (b?.dataset.b === 'snooze') snoozeMenu(id);
  else openEditor(getReminder(id));
  hideBanner();
});
(function bannerSwipe() {
  let y0 = null;
  banner.addEventListener('pointerdown', (e) => (y0 = e.clientY));
  banner.addEventListener('pointermove', (e) => {
    if (y0 != null && e.clientY - y0 < -25) {
      y0 = null;
      swallowNextClick();
      hideBanner();
    }
  });
  banner.addEventListener('pointerup', () => (y0 = null));
})();

/* =========================================================
   Actions
   ========================================================= */
function collapse(wrap, dir = 0) {
  return new Promise((resolve) => {
    if (!wrap || reduced()) return resolve();
    const h = wrap.offsetHeight;
    const item = $('.item', wrap);
    if (dir)
      item.animate([{ transform: item.style.transform || 'none' }, { transform: `translateX(${dir * 110}%)` }], {
        duration: 260,
        easing: EASE,
        fill: 'forwards',
      });
    const a = wrap.animate(
      [
        { height: `${h}px`, opacity: 1, marginBottom: '0px' },
        { height: '0px', opacity: 0, marginBottom: '-8px' },
      ],
      { duration: 340, delay: dir ? 140 : 260, easing: EASE, fill: 'forwards' },
    );
    a.onfinish = resolve;
  });
}

async function completeWithFeedback(id, wrap) {
  const r = getReminder(id);
  if (!r) return;
  if (r.done) {
    sfx.toggle(false);
    S.uncompleteReminder(id);
    return;
  }
  haptic(12);
  sfx.complete();
  $$(`[data-toggle="${id}"]`).forEach((c) => c.classList.add('on'));
  const rolling = isRepeating(r) && r.due;
  if (!rolling) await collapse(wrap || $(`.view.active .item-wrap[data-id="${id}"], #page .item-wrap[data-id="${id}"]`));
  else await new Promise((res) => setTimeout(res, reduced() ? 0 : 380));
  const res = S.completeReminder(id);
  const after = getReminder(id);
  if (res === 'rolled') undoToast(`Done! Next: ${D.fmtDue(after.due, h24())}`);
  else undoToast(`Completed “${r.title.slice(0, 40)}”`);
  if (S.stats().streak > 0 && state.log.filter((e) => D.sameDay(new Date(e.at), now())).length === 1) {
    setTimeout(() => toast(`🔥 ${S.stats().streak}-day streak! Keep it going.`), 700);
  }
}

async function deleteWithFeedback(id, wrap, dir = -1) {
  const r = getReminder(id);
  if (!r) return;
  haptic(16);
  sfx.remove();
  await collapse(wrap || $(`.view.active .item-wrap[data-id="${id}"], #page .item-wrap[data-id="${id}"]`), dir);
  S.deleteReminder(id);
  undoToast('Reminder deleted');
}

function snoozeMenu(id) {
  const r = getReminder(id);
  if (!r) return;
  const evening = D.withTime(now(), 18, 0);
  const [dh, dm] = D.parseTimeStr(state.settings.defaultTime);
  const tomorrow = D.withTime(D.addDays(now(), 1), dh, dm);
  const opts = [
    ['10 minutes', 10],
    ['30 minutes', 30],
    ['1 hour', 60],
    ['3 hours', 180],
    ...(evening > now() ? [[`This evening · ${D.fmtTime(evening, h24())}`, Math.round((evening - now()) / 60000)]] : []),
  ];
  openSheet((root) => {
    root.innerHTML = `<div class="sheet-top"><span></span><h3>Snooze</h3><button class="text-btn" data-x="close">Close</button></div>
      <div class="settings menu-list">${opts.map(([l, m]) => `<button class="row" data-min="${m}"><span class="ri" style="--c:var(--accent)">${icon('alarm')}</span><span class="rl">${l}</span></button>`).join('')}
      <button class="row" data-tomorrow><span class="ri" style="--c:#4dabf7">${icon('calendar')}</span><span class="rl">Move to tomorrow · ${D.fmtTime(tomorrow, h24())}</span></button></div>`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.x) return closeSheet();
      if (b.dataset.min) {
        S.snoozeReminder(id, +b.dataset.min);
        toast(`Snoozed until ${D.fmtTime(new Date(getReminder(id).snoozedUntil), h24())}`);
      } else if ('tomorrow' in b.dataset) {
        const d = r.due ? new Date(r.due) : tomorrow;
        const nd = D.withTime(D.addDays(now(), 1), d.getHours(), d.getMinutes());
        S.saveReminder({ ...r, due: nd.toISOString() });
        undoToast(`Moved to ${D.fmtDue(nd.toISOString(), h24())}`);
      }
      closeSheet();
    });
  });
}

function contextMenu(id) {
  const r = getReminder(id);
  if (!r) return;
  haptic(20);
  openSheet((root) => {
    root.innerHTML = `<div class="sheet-top"><span></span><h3></h3><button class="text-btn" data-x="close">Close</button></div>
      <div class="settings menu-list">
        <button class="row" data-m="done"><span class="ri" style="--c:var(--success)">${icon('check')}</span><span class="rl">${r.done ? 'Mark as not done' : 'Complete'}</span></button>
        <button class="row" data-m="edit"><span class="ri" style="--c:var(--accent)">${icon('edit')}</span><span class="rl">Edit</span></button>
        ${r.done ? '' : `<button class="row" data-m="snooze"><span class="ri" style="--c:#ffa94d">${icon('alarm')}</span><span class="rl">Snooze / postpone</span></button>`}
        <button class="row" data-m="pin"><span class="ri" style="--c:#cc5de8">${icon('pin')}</span><span class="rl">${r.pinned ? 'Unpin' : 'Pin to top'}</span></button>
        <button class="row" data-m="dup"><span class="ri" style="--c:#4dabf7">${icon('copy')}</span><span class="rl">Duplicate</span></button>
        ${r.url ? `<button class="row" data-m="link"><span class="ri" style="--c:#20c997">${icon('link')}</span><span class="rl">Open link</span></button>` : ''}
        <button class="row danger" data-m="del"><span class="ri" style="--c:var(--danger)">${icon('trash')}</span><span class="rl">Delete</span></button>
      </div>`;
    $('h3', root).textContent = r.title.length > 28 ? r.title.slice(0, 28) + '…' : r.title;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const m = b.dataset.m;
      if (b.dataset.x) return closeSheet();
      if (m === 'edit') return openEditor(r);
      if (m === 'snooze') return snoozeMenu(id);
      closeSheet();
      if (m === 'done') completeWithFeedback(id);
      if (m === 'pin') S.togglePin(id);
      if (m === 'dup') {
        S.duplicateReminder(id);
        undoToast('Duplicated');
      }
      if (m === 'link') window.open(r.url, '_blank', 'noopener');
      if (m === 'del') deleteWithFeedback(id);
    });
  });
}

/* Item gestures: tap to open, swipe right to complete, left to delete, long-press for menu */
(function itemGestures() {
  let g = null;
  document.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.item');
    if (!item || e.target.closest('.check') || e.button > 0) return;
    const wrap = item.closest('.item-wrap');
    const id = wrap?.dataset.id;
    if (!id) return;
    g = { item, wrap, id, x: e.clientX, y: e.clientY, pid: e.pointerId, active: false, long: false };
    item.classList.add('pressed');
    g.lp = setTimeout(() => {
      if (!g || g.active) return;
      g.long = true;
      item.classList.remove('pressed');
      swallowNextClick();
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 700);
      contextMenu(id);
    }, 520);
  });
  document.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.pid) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        clearTimeout(g.lp);
        g.item.classList.remove('pressed');
      }
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (g = null);
      if (Math.abs(dx) < 12 || e.pointerType === 'mouse') return;
      g.active = true;
      try {
        g.item.setPointerCapture(e.pointerId);
      } catch {}
      g.bgR = $('.item-actions-bg.right', g.wrap);
      g.bgL = $('.item-actions-bg.left', g.wrap);
    }
    const resist = (v) => (Math.abs(v) > 120 ? Math.sign(v) * (120 + (Math.abs(v) - 120) * 0.35) : v);
    g.dx = resist(dx);
    g.item.style.transform = `translateX(${g.dx}px)`;
    g.bgR.style.opacity = clamp(g.dx / 80, 0, 1);
    g.bgL.style.opacity = clamp(-g.dx / 80, 0, 1);
    const over = Math.abs(g.dx) > 90;
    if (over !== g.over) {
      g.over = over;
      if (over) haptic(10);
      (g.dx > 0 ? g.bgR : g.bgL).animate([{ filter: 'brightness(1)' }, { filter: `brightness(${over ? 1.15 : 1})` }], { duration: 150, fill: 'forwards' });
    }
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.pid) return;
    const st = g;
    g = null;
    clearTimeout(st.lp);
    st.item.classList.remove('pressed');
    if (!st.active) return;
    swallowNextClick();
    const dx = st.dx || 0;
    const reset = () => {
      st.item.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 420, easing: SPRING });
      st.item.style.transform = '';
      [st.bgR, st.bgL].forEach((b) => b.animate([{ opacity: b.style.opacity }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    };
    if (dx > 90) {
      reset();
      completeWithFeedback(st.id, st.wrap);
    } else if (dx < -90) {
      deleteWithFeedback(st.id, st.wrap, -1);
    } else reset();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('contextmenu', (e) => {
    const wrap = e.target.closest('.item-wrap[data-id]');
    if (wrap && e.pointerType !== 'touch') {
      e.preventDefault();
      contextMenu(wrap.dataset.id);
    } else if (wrap) e.preventDefault();
  });
})();

/* =========================================================
   Editor
   ========================================================= */
const ALERTS = [0, 5, 10, 15, 30, 60, 120, 1440];

function openEditor(existing, preset = {}) {
  const isNew = !existing || !getReminder(existing.id);
  const draft = JSON.parse(
    JSON.stringify(
      existing || { ...S.blankReminder(), alertBefore: state.settings.defaultAlert, listId: ui.page?.type === 'list' ? ui.page.id : state.lists[0]?.id },
    ),
  );
  Object.assign(draft, preset);
  if (!draft.repeat) draft.repeat = { type: 'none', interval: 1 };
  const [dh, dm] = D.parseTimeStr(state.settings.defaultTime);

  openSheet((root) => {
    const dueD = () => (draft.due ? new Date(draft.due) : null);
    const quick = [
      [
        'Today',
        () => {
          const d = dueD();
          const t = d && D.withTime(now(), d.getHours(), d.getMinutes());
          return t && t > now() ? t : D.withTime(now(), Math.min(23, now().getHours() + 1), 0);
        },
      ],
      ['Tonight', () => D.withTime(now(), 20, 0)],
      ['Tomorrow', () => D.withTime(D.addDays(now(), 1), ...(dueD() ? [dueD().getHours(), dueD().getMinutes()] : [dh, dm]))],
      ['Weekend', () => D.withTime(D.addDays(now(), (6 - now().getDay() + 7) % 7 || 7), 10, 0)],
      ['Next week', () => D.withTime(D.addDays(now(), (8 - now().getDay()) % 7 || 7), dh, dm)],
      ['In 1 hour', () => new Date(Date.now() + D.HOUR)],
      ['In 3 hours', () => new Date(Date.now() + 3 * D.HOUR)],
    ];
    root.innerHTML = `
      <div class="sheet-top"><button class="text-btn" data-x="cancel">Cancel</button><h3>${isNew ? 'New reminder' : 'Details'}</h3><button class="text-btn strong" data-x="save">${isNew ? 'Add' : 'Save'}</button></div>
      <div class="field-card">
        <input class="title-input" id="edTitle" placeholder="What do you need to remember?" maxlength="200">
        <textarea id="edNotes" placeholder="Notes" rows="2"></textarea>
      </div>
      <div class="field-card">
        <div class="field"><span class="ri" style="--c:#ff6b6b">${icon('calendar')}</span><span class="fl">Date & time<small id="edDueLabel" style="display:block;color:var(--accent);font-size:13px;font-weight:600"></small></span>
          <label class="switch"><input type="checkbox" id="edHasDate"><span></span></label></div>
        <div class="collapse" id="edDateBox"><div>
          <div class="quick-dates">${quick.map(([l], i) => `<button type="button" class="chip-btn" data-quick="${i}">${l}</button>`).join('')}</div>
          <div class="field"><span class="fl">Day</span><input type="date" id="edDate"></div>
          <div class="field"><span class="fl">Time</span><input type="time" id="edTime"></div>
          <div class="field"><span class="ri" style="--c:#ffa94d">${icon('bell')}</span><span class="fl">Early alert</span>
            <select id="edAlert">${ALERTS.map((m) => `<option value="${m}">${m ? alertLabel(m) : 'None'}</option>`).join('')}</select></div>
          <div class="field"><span class="ri" style="--c:#20c997">${icon('repeat')}</span><span class="fl">Repeat</span>
            <select id="edRepeat">${D.REPEAT_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="collapse" id="edIntervalBox"><div><div class="field"><span class="fl">Every</span>
            <select id="edInterval">${[...Array(12)].map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select><span id="edIntervalUnit" style="color:var(--muted);min-width:56px"></span></div></div></div>
          <div class="collapse" id="edDowBox"><div><div class="dow-picker">${D.WEEKDAYS_SHORT.map((d, i) => `<button type="button" data-dow="${i}">${d.slice(0, 2)}</button>`).join('')}</div></div></div>
        </div></div>
      </div>
      <div class="field-card">
        <div class="field"><span class="ri" style="--c:var(--accent)">${icon('list')}</span><span class="fl">List</span></div>
        <div class="list-picker">${state.lists.map((l) => `<button type="button" data-lid="${l.id}">${orb(glyphFor(l), 26)}${esc(l.name)}</button>`).join('')}</div>
        <div class="field"><span class="ri" style="--c:#ffa94d">${icon('flag')}</span><span class="fl">Priority</span>
          <div class="prio-picker">${PRIORITIES.map((p) => `<button type="button" data-prio="${p.v}" style="--pc:${p.v ? p.color : 'var(--text-2)'}">${p.v ? p.label : 'None'}</button>`).join('')}</div></div>
        <div class="field"><span class="ri" style="--c:#cc5de8">${icon('pin')}</span><span class="fl">Pin to top</span><label class="switch"><input type="checkbox" id="edPin"><span></span></label></div>
        <div class="field"><span class="ri" style="--c:#4dabf7">${icon('tag')}</span><div class="tags-edit" id="edTags"></div></div>
        <div class="field"><span class="ri" style="--c:#20c997">${icon('link')}</span><input type="url" id="edUrl" placeholder="Add a link (optional)" inputmode="url"></div>
      </div>
      <div class="field-card">
        <div class="field"><span class="ri" style="--c:#845ef7">${icon('subtasks')}</span><span class="fl">Subtasks</span><small id="edSubCount" style="color:var(--muted);font-weight:600"></small></div>
        <div class="subtasks" id="edSubs"></div>
      </div>
      ${
        isNew
          ? ''
          : `<div class="sheet-actions">
        <button class="btn" data-x="dup">${icon('copy')}Duplicate</button>
        <button class="btn danger" data-x="del">${icon('trash')}Delete</button>
      </div>`
      }`;

    const el = (id) => $('#' + id, root);
    el('edTitle').value = draft.title;
    el('edNotes').value = draft.notes;
    el('edUrl').value = draft.url || '';
    el('edPin').checked = draft.pinned;

    const autosize = () => {
      const t = el('edNotes');
      t.style.height = 'auto';
      t.style.height = Math.min(220, t.scrollHeight) + 'px';
    };
    autosize();

    const syncDate = () => {
      const has = !!draft.due;
      el('edHasDate').checked = has;
      el('edDateBox').classList.toggle('open', has);
      if (has) {
        const d = new Date(draft.due);
        el('edDate').value = D.toDateInput(d);
        el('edTime').value = D.toTimeInput(d);
        el('edDueLabel').textContent = D.fmtDue(draft.due, h24()) + (isRepeating(draft) ? ` · ${D.repeatLabel(draft.repeat)}` : '');
      } else el('edDueLabel').textContent = '';
      el('edAlert').value = String(ALERTS.includes(draft.alertBefore) ? draft.alertBefore : 0);
      el('edRepeat').value = draft.repeat.type;
      el('edInterval').value = String(draft.repeat.interval || 1);
      const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[draft.repeat.type];
      el('edIntervalBox').classList.toggle('open', !!unit);
      if (unit) el('edIntervalUnit').textContent = draft.repeat.interval > 1 ? unit + 's' : unit;
      el('edDowBox').classList.toggle('open', draft.repeat.type === 'custom');
      $$('[data-dow]', root).forEach((b) => b.classList.toggle('on', (draft.repeat.days || []).includes(+b.dataset.dow)));
    };
    const syncPickers = () => {
      $$('[data-lid]', root).forEach((b) => b.classList.toggle('on', b.dataset.lid === draft.listId));
      $$('[data-prio]', root).forEach((b) => b.classList.toggle('on', +b.dataset.prio === draft.priority));
    };
    const renderTags = () => {
      el('edTags').innerHTML =
        draft.tags
          .map((t, i) => `<span class="t">#${esc(t)}<button type="button" data-rmtag="${i}" aria-label="Remove tag">${icon('x')}</button></span>`)
          .join('') + `<input id="edTagInput" placeholder="${draft.tags.length ? 'Add tag' : 'Add tags'}" enterkeyhint="done">`;
    };
    const renderSubs = () => {
      const done = draft.subtasks.filter((s) => s.done).length;
      el('edSubCount').textContent = draft.subtasks.length ? `${done}/${draft.subtasks.length}` : '';
      el('edSubs').innerHTML =
        draft.subtasks
          .map(
            (s, i) => `<div class="subtask ${s.done ? 'done' : ''}" style="--list-color:${getList(draft.listId).color}">
          <button type="button" class="check ${s.done ? 'on' : ''}" data-subcheck="${i}" aria-label="Toggle subtask">${icon('check')}</button>
          <input value="${esc(s.title)}" data-subinput="${i}" placeholder="Subtask" enterkeyhint="next">
          <button type="button" class="rm" data-subrm="${i}" aria-label="Remove subtask">${icon('x')}</button></div>`,
          )
          .join('') + `<button type="button" class="add-sub" data-addsub>${icon('plus')}Add subtask</button>`;
    };
    const updateSave = () => ($('[data-x="save"]', root).disabled = !draft.title.trim());

    syncDate();
    syncPickers();
    renderTags();
    renderSubs();
    updateSave();
    if (isNew && !draft.title) setTimeout(() => el('edTitle').focus(), reduced() ? 0 : 350);

    const setDue = (d) => {
      draft.due = d ? d.toISOString() : null;
      syncDate();
    };

    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'edTitle') {
        draft.title = t.value;
        updateSave();
      } else if (t.id === 'edNotes') {
        draft.notes = t.value;
        autosize();
      } else if (t.id === 'edUrl') draft.url = t.value.trim();
      else if (t.dataset.subinput) draft.subtasks[+t.dataset.subinput].title = t.value;
    });

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'edHasDate') {
        setDue(
          t.checked
            ? (() => {
                const d = D.withTime(now(), dh, dm);
                return d > now() ? d : D.addDays(d, 1);
              })()
            : null,
        );
        if (!t.checked) draft.repeat = { type: 'none', interval: 1 };
        syncDate();
      } else if (t.id === 'edDate' || t.id === 'edTime') {
        const [y, mo, da] = (el('edDate').value || D.toDateInput(now())).split('-').map(Number);
        const [hh, mm] = D.parseTimeStr(el('edTime').value || state.settings.defaultTime);
        setDue(new Date(y, mo - 1, da, hh, mm));
      } else if (t.id === 'edAlert') draft.alertBefore = +t.value;
      else if (t.id === 'edRepeat') {
        draft.repeat = { type: t.value, interval: 1, days: t.value === 'custom' ? [new Date(draft.due || now()).getDay()] : [] };
        syncDate();
      } else if (t.id === 'edInterval') {
        draft.repeat.interval = +t.value;
        syncDate();
      } else if (t.id === 'edPin') draft.pinned = t.checked;
    });

    const addTagFromInput = () => {
      const inp = el('edTagInput');
      const v = inp.value.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
      if (v && !draft.tags.includes(v)) draft.tags.push(v);
      renderTags();
      el('edTagInput').focus();
    };

    root.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.id === 'edTagInput' && (e.key === 'Enter' || e.key === ',' || e.key === ' ')) {
        e.preventDefault();
        addTagFromInput();
      } else if (t.id === 'edTagInput' && e.key === 'Backspace' && !t.value && draft.tags.length) {
        draft.tags.pop();
        renderTags();
        el('edTagInput').focus();
      } else if (t.dataset.subinput && e.key === 'Enter') {
        e.preventDefault();
        draft.subtasks.splice(+t.dataset.subinput + 1, 0, { id: S.uid(), title: '', done: false });
        renderSubs();
        $(`[data-subinput="${+t.dataset.subinput + 1}"]`, root)?.focus();
      } else if (t.dataset.subinput && e.key === 'Backspace' && !t.value) {
        e.preventDefault();
        const i = +t.dataset.subinput;
        draft.subtasks.splice(i, 1);
        renderSubs();
        $(`[data-subinput="${Math.max(0, i - 1)}"]`, root)?.focus();
      } else if (t.id === 'edTitle' && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
    root.addEventListener('focusout', (e) => {
      if (e.target.id === 'edTagInput' && e.target.value.trim()) addTagFromInput();
    });

    const save = () => {
      if (!draft.title.trim()) return;
      draft.title = draft.title.trim();
      draft.subtasks = draft.subtasks.filter((s) => s.title.trim());
      if (draft.repeat.type === 'custom' && !(draft.repeat.days || []).length) draft.repeat = { type: 'none', interval: 1 };
      if (draft.url && !/^https?:\/\//i.test(draft.url)) draft.url = 'https://' + draft.url;
      if (isNew) {
        sfx.add();
        S.addReminder(draft);
        toast(draft.due ? `Reminder set for ${D.fmtDue(draft.due, h24())}` : 'Reminder added');
      } else {
        S.saveReminder(draft);
      }
      haptic(10);
      closeSheet();
      maybeAskNotifications();
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const x = b.dataset.x;
      if (x === 'cancel') return closeSheet();
      if (x === 'save') return save();
      if (x === 'del') {
        closeSheet();
        return deleteWithFeedback(draft.id);
      }
      if (x === 'dup') {
        closeSheet();
        S.duplicateReminder(draft.id);
        return undoToast('Duplicated');
      }
      if (b.dataset.quick) {
        setDue(quick[+b.dataset.quick][1]());
        b.animate([{ transform: 'scale(.9)' }, { transform: 'none' }], { duration: 300, easing: SPRING });
      } else if (b.dataset.dow) {
        const d = +b.dataset.dow;
        const days = new Set(draft.repeat.days || []);
        days.has(d) ? days.delete(d) : days.add(d);
        draft.repeat.days = [...days].sort();
        syncDate();
      } else if (b.dataset.lid) {
        draft.listId = b.dataset.lid;
        syncPickers();
        renderSubs();
      } else if (b.dataset.prio != null) {
        draft.priority = +b.dataset.prio;
        syncPickers();
      } else if (b.dataset.rmtag) {
        draft.tags.splice(+b.dataset.rmtag, 1);
        renderTags();
      } else if (b.dataset.subcheck) {
        const s = draft.subtasks[+b.dataset.subcheck];
        s.done = !s.done;
        renderSubs();
        haptic(6);
      } else if (b.dataset.subrm) {
        draft.subtasks.splice(+b.dataset.subrm, 1);
        renderSubs();
      } else if ('addsub' in b.dataset) {
        draft.subtasks.push({ id: S.uid(), title: '', done: false });
        renderSubs();
        $(`[data-subinput="${draft.subtasks.length - 1}"]`, root)?.focus();
      }
    });
  });
}

/* =========================================================
   List editor
   ========================================================= */
function openListEditor(existing) {
  const isNew = !existing;
  const draft = existing ? { ...existing, glyph: glyphFor(existing) } : { name: '', glyph: GLYPH_NAMES[Math.floor(Math.random() * GLYPH_NAMES.length)] };
  openSheet((root) => {
    root.innerHTML = `<div class="sheet-top"><button class="text-btn" data-x="cancel">Cancel</button><h3>${isNew ? 'New list' : 'Edit list'}</h3><button class="text-btn strong" data-x="save">Done</button></div>
      <div class="field-card">
        <div class="list-preview"><div class="big"></div><input id="lsName" placeholder="List name" maxlength="40"></div>
      </div>
      <div class="field-card"><div class="glyph-grid">${GLYPH_NAMES.map((g) => `<button type="button" data-glyph="${g}" aria-label="${g}">${orb(g, 50)}</button>`).join('')}</div></div>
      ${isNew ? '' : `<button class="btn danger block" data-x="del">${icon('trash')}Delete list</button>`}`;
    const name = $('#lsName', root);
    name.value = draft.name;
    const sync = () => {
      $('.big', root).innerHTML = orb(draft.glyph, 96);
      $$('[data-glyph]', root).forEach((b) => b.classList.toggle('on', b.dataset.glyph === draft.glyph));
      $('[data-x="save"]', root).disabled = !draft.name.trim();
    };
    sync();
    if (isNew) setTimeout(() => name.focus(), 350);
    name.addEventListener('input', () => {
      draft.name = name.value;
      $('[data-x="save"]', root).disabled = !draft.name.trim();
    });
    name.addEventListener('keydown', (e) => e.key === 'Enter' && $('[data-x="save"]', root).click());
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.x === 'cancel') return closeSheet();
      if (b.dataset.x === 'save') {
        if (!draft.name.trim()) return;
        S.saveList({ ...draft, name: draft.name.trim() });
        sfx.add();
        closeSheet();
        return;
      }
      if (b.dataset.x === 'del') {
        const n = state.reminders.filter((r) => r.listId === draft.id).length;
        if (!S.deleteList(draft.id)) return toast('You need at least one list');
        closeSheet();
        if (ui.page?.type === 'list') closePage();
        undoToast(n ? `List deleted · ${plural(n, 'reminder')} moved to ${state.lists[0].name}` : 'List deleted');
        return;
      }
      if (b.dataset.glyph) {
        draft.glyph = b.dataset.glyph;
        sync();
        $('.big .orb', root).animate(
          [
            { transform: 'scale(.7) rotate(-20deg)', opacity: 0.4 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 520, easing: SPRING },
        );
      }
    });
  });
}

/* =========================================================
   Quick-add composer (natural language)
   ========================================================= */
const composer = $('#composer');
const cInput = $('#composerInput');
const cBackdrop = $('#composerBackdrop');
let composerCtx = {};
let composerOpen = false;

function openComposer(ctx = {}) {
  composerCtx = ctx;
  cInput.value = ctx.text || '';
  cInput.placeholder = 'e.g. ' + QUICK_HINTS[Math.floor(Math.random() * QUICK_HINTS.length)];
  updateComposer();
  cInput.focus({ preventScroll: true }); // focus synchronously so mobile keyboards open
  if (ctx.text) cInput.setSelectionRange(cInput.value.length, cInput.value.length);
  if (composerOpen) return;
  composerOpen = true;
  pushOverlay('composer');
  sfx.open();
  composer.classList.add('show');
  cBackdrop.classList.add('show');
  fab.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(45deg) scale(.6)', opacity: 0 }], { duration: 260, easing: EASE, fill: 'forwards' });
}

function closeComposer(fromPop = false) {
  if (!composerOpen) return;
  if (!fromPop) dropOverlay('composer');
  sfx.close();
  composerOpen = false;
  cInput.blur();
  composer.classList.remove('show');
  cBackdrop.classList.remove('show');
  fab.getAnimations().forEach((a) => a.cancel());
  fab.animate(
    [
      { transform: 'scale(.6)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 420, easing: SPRING },
  );
}

function parseComposer() {
  const p = parseQuick(cInput.value, { lists: state.lists, defaultTime: state.settings.defaultTime });
  if (!p.listId && composerCtx.listId) p.listId = composerCtx.listId;
  if (!p.due && composerCtx.date) {
    const [h, m] = D.parseTimeStr(state.settings.defaultTime);
    p.due = D.withTime(composerCtx.date, h, m);
  }
  return p;
}

function updateComposer() {
  const p = parseComposer();
  $('#composerSend').disabled = !p.title;
  const chips = [];
  if (p.due) chips.push(`<span class="parsed">${icon('clock')}${D.fmtDue(p.due.toISOString(), h24())}</span>`);
  if (p.repeat) chips.push(`<span class="parsed">${icon('repeat')}${esc(D.repeatLabel(p.repeat))}</span>`);
  if (p.priority) chips.push(`<span class="parsed" style="color:${PRIORITIES[p.priority].color}">${icon('flag')}${PRIORITIES[p.priority].label}</span>`);
  if (p.listId) {
    const l = getList(p.listId);
    chips.push(`<span class="parsed">${orb(glyphFor(l), 14)}${esc(l.name)}</span>`);
  }
  p.tags.forEach((t) => chips.push(`<span class="parsed">#${esc(t)}</span>`));
  const box = $('#composerChips');
  const html = chips.join('');
  if (box.dataset.html !== html) {
    box.innerHTML = html;
    box.dataset.html = html;
  }
}

cInput.addEventListener('input', updateComposer);
cBackdrop.addEventListener('click', () => closeComposer());
composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const p = parseComposer();
  if (!p.title) return;
  sfx.add();
  const r = S.addReminder({
    title: p.title,
    due: p.due ? p.due.toISOString() : null,
    priority: p.priority,
    listId: p.listId || state.lists[0]?.id,
    tags: p.tags,
    repeat: p.repeat || { type: 'none', interval: 1 },
  });
  haptic(10);
  closeComposer();
  toast(r.due ? `Added for ${D.fmtDue(r.due, h24())}` : 'Reminder added', { action: 'Edit', onAction: () => openEditor(getReminder(r.id)) });
  maybeAskNotifications();
  requestAnimationFrame(() => {
    const el = $(`.view.active .item-wrap[data-id="${r.id}"] .item, #page .item-wrap[data-id="${r.id}"] .item`);
    el?.classList.add('flash');
  });
});
composer.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-q]');
  if (b) {
    const q = b.dataset.q;
    cInput.value = (cInput.value.trim() + ' ' + q).trim() + ' ';
    updateComposer();
    cInput.focus();
    b.animate([{ transform: 'scale(.9)' }, { transform: 'none' }], { duration: 300, easing: SPRING });
  }
  if (e.target.closest('#composerMore')) {
    const p = parseComposer();
    closeComposer();
    openEditor(null, {
      title: p.title,
      due: p.due ? p.due.toISOString() : null,
      priority: p.priority,
      listId: p.listId || composerCtx.listId || state.lists[0]?.id,
      tags: p.tags,
      repeat: p.repeat || { type: 'none', interval: 1 },
    });
  }
});

// Keep the composer above the on-screen keyboard (iOS Safari).
if (window.visualViewport) {
  const vv = window.visualViewport;
  const place = () => {
    const off = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    composer.style.bottom = off ? `${off}px` : '';
  };
  vv.addEventListener('resize', place);
  vv.addEventListener('scroll', place);
}

/* =========================================================
   Notifications UX
   ========================================================= */
async function enableNotifications() {
  const p = await N.requestPermission();
  if (p === 'granted') {
    S.updateSettings({ notifications: true });
    N.testNotification();
    N.scheduleAhead();
    toast('Notifications enabled 🔔');
  } else if (p === 'denied') {
    S.updateSettings({ notifications: false });
    toast('Notifications are blocked. Allow them in your browser/site settings.', { ms: 6000 });
  } else if (p === 'unsupported') {
    toast('This browser does not support notifications. Try adding the app to your home screen.', { ms: 6000 });
  }
  refresh();
}

function maybeAskNotifications() {
  if (state.settings.notifications || state.meta.askedNotifs || N.permission() === 'denied' || N.permission() === 'unsupported') return;
  S.setMeta({ askedNotifs: true });
  setTimeout(
    () =>
      toast('Want an alert when this is due?', {
        action: 'Enable',
        onAction: enableNotifications,
        ms: 7000,
      }),
    900,
  );
}

/* =========================================================
   Global click / change delegation
   ========================================================= */
document.addEventListener('click', (e) => {
  const t = e.target;
  const tab = t.closest('.tab');
  if (tab) return setTab(tab.dataset.tab);

  const toggle = t.closest('[data-toggle]');
  if (toggle) {
    e.stopPropagation();
    return completeWithFeedback(toggle.dataset.toggle, toggle.closest('.item-wrap'));
  }

  const openEl = t.closest('[data-open]');
  if (openEl && !t.closest('#sheet')) return openEditor(getReminder(openEl.dataset.open));

  const smart = t.closest('[data-smart]');
  if (smart) return openPage({ type: 'smart', key: smart.dataset.smart });

  const list = t.closest('[data-list]');
  if (list) return openPage({ type: 'list', id: list.dataset.list });

  const tag = t.closest('[data-tag]');
  if (tag) return openPage({ type: 'search', q: '#' + tag.dataset.tag, filter: 'open' });

  const jump = t.closest('[data-jump]');
  if (jump) {
    const target = $(`#day-${jump.dataset.jump}`);
    const v = viewEl('upcoming');
    if (target) v.scrollTo({ top: target.offsetTop - 70, behavior: reduced() ? 'auto' : 'smooth' });
    return;
  }

  const addDay = t.closest('[data-add-day]');
  if (addDay) {
    const [y, m, d] = addDay.dataset.addDay.split('-').map(Number);
    return openComposer({ date: new Date(y, m - 1, d) });
  }

  const day = t.closest('[data-day]');
  if (day) {
    const [y, m, d] = day.dataset.day.split('-').map(Number);
    haptic(5);
    return selectDay(new Date(y, m - 1, d));
  }

  const cal = t.closest('[data-cal]');
  if (cal) {
    if (cal.dataset.cal === 'today') return selectDay(now());
    return shiftMonth(+cal.dataset.cal);
  }

  const filter = t.closest('[data-filter]');
  if (filter && ui.page?.type === 'search') {
    ui.page.filter = filter.dataset.filter;
    return renderPage();
  }

  const accent = t.closest('[data-accent]');
  if (accent) {
    S.updateSettings({ accent: accent.dataset.accent });
    applyTheme();
    $$('.swatch[data-accent]').forEach((s) => s.classList.toggle('on', s.dataset.accent === accent.dataset.accent));
    return;
  }

  const seg = t.closest('[data-seg] button');
  if (seg) {
    const key = seg.parentElement.dataset.seg;
    S.updateSettings({ [key]: seg.dataset.val });
    $$('button', seg.parentElement).forEach((b) => b.classList.toggle('on', b === seg));
    if (key === 'theme') {
      // Cross-fade the theme change when supported
      if (document.startViewTransition && !reduced()) document.startViewTransition(applyTheme);
      else applyTheme();
    }
    return;
  }

  const go = t.closest('[data-go]');
  if (go) return setTab(go.dataset.go);

  const starter = t.closest('[data-starter]');
  if (starter) return openComposer({ text: starter.dataset.starter });

  const act = t.closest('[data-action]');
  if (!act) return;
  switch (act.dataset.action) {
    case 'back':
      return closePage();
    case 'compose':
      return openComposer();
    case 'enable-notifs':
      return enableNotifications();
    case 'dismiss-notice':
      S.setMeta({ noticeDismissed: true });
      return refresh();
    case 'toggle-done-today':
      ui.showDoneToday = !ui.showDoneToday;
      return renderView('today', { animate: true });
    case 'toggle-done-list':
      ui.showDoneInList = !ui.showDoneInList;
      return renderPage({ animate: true });
    case 'new-list':
      return openListEditor();
    case 'edit-list':
      return openListEditor(getList(act.dataset.id));
    case 'add-here':
      return openComposer(ui.page?.type === 'list' ? { listId: ui.page.id } : ui.page?.key === 'today' ? { date: now() } : {});
    case 'test-notif':
      if (!(state.settings.notifications && N.permission() === 'granted')) return enableNotifications();
      N.testNotification();
      return toast('Test notification sent');
    case 'export':
      S.exportData();
      return toast('Backup downloaded');
    case 'import':
      return $('#importFile').click();
    case 'clear-completed': {
      const n = S.clearCompleted();
      return n ? undoToast(`Cleared ${plural(n, 'completed reminder')}`) : toast('Nothing to clear');
    }
    case 'reset':
      return confirmSheet('Erase everything?', 'All reminders, lists and settings on this device will be permanently deleted.', 'Erase', S.resetAll);
  }
});

function confirmSheet(title, text, cta, onYes) {
  openSheet((root) => {
    root.innerHTML = `<div style="text-align:center;padding:10px 6px 4px"><div style="font-size:42px">⚠️</div><h3 style="margin:8px 0 6px"></h3><p style="color:var(--text-2);margin:0 0 18px"></p></div>
      <div class="sheet-actions"><button class="btn" data-c="no">Cancel</button><button class="btn primary" style="background:var(--danger)" data-c="yes"></button></div>`;
    $('h3', root).textContent = title;
    $('p', root).textContent = text;
    $('[data-c="yes"]', root).textContent = cta;
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (!c) return;
      closeSheet();
      if (c === 'yes') onYes();
    });
  });
}

// A soft tick for every tap that doesn't already have its own sound
document.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest('button, .switch');
    if (!b || b.disabled) return;
    if (b.closest('.check, .tab, #composerSend, [data-x="save"], [data-x="cancel"], [data-action="back"], .art-card, [data-glyph], .switch')) return;
    sfx.tap();
  },
  true,
);

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.type === 'checkbox') sfx.toggle(t.checked);
  if (t.id === 'importFile' && t.files[0]) {
    try {
      S.importData(await t.files[0].text());
      applyTheme();
      undoToast('Backup imported');
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
    t.value = '';
    return;
  }
  const key = t.dataset.setting;
  if (!key) return;
  if (key === 'notifications') {
    if (t.checked) return enableNotifications();
    S.updateSettings({ notifications: false });
    return toast('Notifications turned off');
  }
  let val = t.type === 'checkbox' ? t.checked : t.value;
  if (key === 'defaultAlert') val = +val;
  if (key === 'name') val = val.trim();
  S.updateSettings({ [key]: val });
  if (key === 'h24') refresh();
});

// Live search
document.addEventListener('input', (e) => {
  if (e.target.id === 'searchInput' && ui.page?.type === 'search') {
    ui.page.q = e.target.value;
    renderPage();
  }
});

$('#searchBtn').addEventListener('click', () => openPage({ type: 'search', q: '', filter: 'open' }));
fab.addEventListener('click', () => {
  haptic(8);
  openComposer(ui.tab === 'calendar' ? { date: ui.calSel } : {});
});

// Swipe left/right on the calendar grid to change months
(function calSwipe() {
  let s = null;
  viewsEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cal-grid-wrap')) s = { x: e.clientX, y: e.clientY };
  });
  viewsEl.addEventListener('pointerup', (e) => {
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    s = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swallowNextClick();
      haptic(5);
      shiftMonth(dx < 0 ? 1 : -1);
    }
  });
})();

// Keyboard shortcuts (desktop)
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if (composerOpen) return closeComposer();
    if (sheetOpen) return closeSheet();
    if (ui.page) return closePage();
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n' || e.key === '+') {
    e.preventDefault();
    openComposer();
  } else if (e.key === '/') {
    e.preventDefault();
    openPage({ type: 'search', q: '', filter: 'open' });
  } else if (/^[1-5]$/.test(e.key) && !sheetOpen && !ui.page) setTab(TABS[+e.key - 1]);
});

/* =========================================================
   Notification actions (from service worker / URL / queue)
   ========================================================= */
function handleAction({ action, id, view, at }) {
  const r = id && getReminder(id);
  if (action === 'done' && r && !r.done) {
    S.completeReminder(id);
    toast(`Completed “${r.title.slice(0, 40)}”`, { action: 'Undo', onAction: S.undo });
  } else if (action === 'snooze' && r) {
    S.snoozeReminder(id, 10, at || Date.now());
    toast(`Snoozed until ${D.fmtTime(new Date(getReminder(id).snoozedUntil), h24())}`);
  } else if (action === 'open') {
    if (r) openEditor(r);
    else if (view && TABS.includes(view)) setTab(view);
  }
}

async function drainQueue() {
  if (!('indexedDB' in window)) return;
  try {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('remindly-sw', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('queue', { autoIncrement: true });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const msgs = await new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      const all = store.getAll();
      all.onsuccess = () => {
        store.clear();
        res(all.result);
      };
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    msgs.forEach(handleAction);
  } catch (e) {
    console.warn('Could not read queued notification actions', e);
  }
}

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'notification-action') handleAction(e.data);
});

/* =========================================================
   Boot
   ========================================================= */
function tick() {
  const n = now();
  const k = D.dateKey(n);
  if (k !== ui.lastDay) {
    ui.lastDay = k;
    ui.calSel = D.startOfDay(n);
    return refresh();
  }
  if (n.getMinutes() !== ui.lastMinute) {
    ui.lastMinute = n.getMinutes();
    // Refresh countdowns / overdue states without disturbing interactions
    if (!gesture.active && !sheetOpen && !composerOpen && document.visibilityState === 'visible') {
      TABS.forEach((t) => dirty.add(t));
      renderView(ui.tab, { animate: true });
      if (ui.page && ui.page.type !== 'search') renderPage({ animate: true });
      updateBadges();
    }
  }
}

function boot() {
  applyTheme();
  S.subscribe((reason) => {
    if (reason === 'settings') {
      // The settings screen is live; other views pick up changes when shown.
      TABS.forEach((t) => t !== ui.tab && dirty.add(t));
      return;
    }
    refresh();
    N.scheduleAhead();
  });
  setTab('today', { instant: true });
  updateBadges();

  // Opening sequence: the splash orb draws itself, then dissolves as the app
  // un-blurs and the content rises in. Tap to skip.
  const reveal = () => {
    if (document.body.classList.contains('ready')) return;
    document.body.classList.add('ready');
    placeIndicator(ui.tab);
    stagger(viewEl(ui.tab).firstElementChild);
    sfx.intro();
    setTimeout(() => $('#splash')?.remove(), 1200);
  };
  $('#splash').addEventListener('pointerdown', reveal);
  setTimeout(reveal, reduced() ? 0 : 1300);
  ui.lastMinute = now().getMinutes();
  setInterval(tick, 10_000);

  // Start the alert engine once the service worker is ready (needed for
  // notifications on Android), but never wait on it for more than a few seconds.
  const swReady = Promise.race([N.registerSW(), new Promise((r) => setTimeout(r, 4000))]);
  swReady.then(() => {
    N.start((ev) => {
      if (ev.type === 'reminder' && document.visibilityState === 'visible') showBanner(ev.reminder, ev.kind);
    });
    N.scheduleAhead();
    drainQueue();
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && drainQueue());
  addEventListener('pagehide', S.flush);

  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length) history.replaceState(null, '', location.pathname);
  if (params.has('action') || params.has('view')) {
    setTimeout(() => handleAction({ action: params.get('action') || 'open', id: params.get('id'), view: params.get('view') }), 300);
  }
  if (params.get('new') === '1') setTimeout(() => openComposer(), 300);
}

boot();
