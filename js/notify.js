// Notification engine. Checks due reminders on a timer and shows system
// notifications through the service worker (with Done / Snooze actions),
// plus in-app banners and a chime while the app is open.
import { state, markFired, setMeta, getList } from './store.js';
import { fmtTime, toDateInput, parseTimeStr, withTime, HOUR, MIN } from './dates.js';

let swReg = null;
let onInApp = () => {};
let timer = null;

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    swReg = (await navigator.serviceWorker.getRegistration()) || swReg;
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
  return swReg;
}

export async function requestPermission() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function show(title, opts) {
  if (!state.settings.notifications || permission() !== 'granted') return false;
  const full = {
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    vibrate: state.settings.haptics ? [120, 60, 120] : undefined,
    timestamp: Date.now(),
    ...opts,
  };
  try {
    if (swReg && swReg.showNotification) {
      await swReg.showNotification(title, full);
    } else {
      const rest = { ...full };
      delete rest.actions; // actions are SW-only
      new Notification(title, rest);
    }
    return true;
  } catch (e) {
    console.warn('Notification failed', e);
    return false;
  }
}

export function notifyReminder(r, kind) {
  const list = getList(r.listId);
  const due = new Date(r.due);
  const when =
    kind === 'pre' ? `Coming up at ${fmtTime(due, state.settings.h24)}` : kind === 'snooze' ? 'Snoozed reminder' : `Due ${fmtTime(due, state.settings.h24)}`;
  const body = [when, r.notes ? r.notes.slice(0, 120) : '', `${list.icon} ${list.name}`].filter(Boolean).join('\n');
  // While the app is open and focused, the in-app banner is enough.
  const inApp = document.visibilityState === 'visible' && document.hasFocus();
  if (!inApp)
    show(r.title, {
      body,
      tag: `rem-${r.id}`,
      renotify: true,
      requireInteraction: r.priority >= 3,
      data: { id: r.id },
      actions: [
        { action: 'done', title: '✓ Done' },
        { action: 'snooze', title: '⏰ Snooze 10 min' },
      ],
    });
  onInApp({ type: 'reminder', reminder: r, kind });
}

export function testNotification() {
  return show('Notifications are on 🎉', {
    body: "You'll get a heads-up like this whenever a reminder is due.",
    tag: 'remindly-test',
  });
}

function alertsFor(r) {
  if (r.done || !r.due) return [];
  const due = new Date(r.due).getTime();
  const out = [];
  if (r.alertBefore > 0) out.push({ key: `pre@${r.due}`, at: due - r.alertBefore * MIN, kind: 'pre' });
  out.push({ key: `due@${r.due}`, at: due, kind: 'due' });
  if (r.snoozedUntil) out.push({ key: `snz@${r.snoozedUntil}`, at: new Date(r.snoozedUntil).getTime(), kind: 'snooze' });
  return out;
}

export function check() {
  const now = Date.now();
  for (const r of state.reminders) {
    for (const a of alertsFor(r)) {
      if (a.at > now || r.fired.includes(a.key)) continue;
      markFired(r.id, a.key);
      // Don't spam alerts that were missed long ago (e.g. phone was off for a day)
      if (now - a.at < 6 * HOUR) notifyReminder(r, a.kind);
    }
  }
  digest(now);
  updateBadge();
}

function digest(now) {
  const s = state.settings;
  if (!s.digest) return;
  const today = toDateInput(new Date(now));
  if (state.meta.lastDigest === today) return;
  const [h, m] = parseTimeStr(s.digestTime);
  const at = withTime(new Date(now), h, m).getTime();
  if (now < at || now - at > 4 * HOUR) return;
  setMeta({ lastDigest: today });
  const end = withTime(new Date(now), 23, 59).getTime();
  const todays = state.reminders.filter((r) => !r.done && r.due && new Date(r.due).getTime() <= end);
  if (!todays.length) return;
  const overdue = todays.filter((r) => new Date(r.due).getTime() < now).length;
  const titles = todays
    .slice(0, 4)
    .map((r) => '• ' + r.title)
    .join('\n');
  show(`☀️ You have ${todays.length} reminder${todays.length > 1 ? 's' : ''} today`, {
    body: (overdue ? `${overdue} overdue\n` : '') + titles,
    tag: 'remindly-digest',
    data: { view: 'today' },
  });
}

export function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const end = withTime(new Date(), 23, 59).getTime();
  const n = state.reminders.filter((r) => !r.done && r.due && new Date(r.due).getTime() <= end).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/**
 * Where the browser supports Notification Triggers, hand upcoming alerts to
 * the OS so they fire even if the app is closed. Elsewhere this is a no-op.
 */
export async function scheduleAhead() {
  if (!swReg || !('showTrigger' in Notification.prototype) || typeof TimestampTrigger === 'undefined') return;
  if (!state.settings.notifications || permission() !== 'granted') return;
  const horizon = Date.now() + 7 * 24 * HOUR;
  for (const r of state.reminders) {
    for (const a of alertsFor(r)) {
      if (a.at <= Date.now() || a.at > horizon) continue;
      try {
        await swReg.showNotification(r.title, {
          tag: `rem-${r.id}`,
          body: getList(r.listId).name,
          data: { id: r.id },
          showTrigger: new TimestampTrigger(a.at),
        });
      } catch {}
    }
  }
}

export function start(inAppHandler) {
  onInApp = inAppHandler;
  clearInterval(timer);
  check();
  // Align to the start of each minute-ish, but poll often so alerts feel instant.
  timer = setInterval(check, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

/* ---------- Chime (WebAudio, no assets needed) ---------- */
let audioCtx;
export function chime() {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 0.55);
    });
  } catch {}
}
