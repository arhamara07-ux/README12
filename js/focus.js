// Focus sessions: a calm, full-screen timer with generative art and an optional
// soundscape. The session lives in state.meta.focus so it survives reloads, and
// time is always computed from timestamps (never by counting ticks), so it stays
// exact even when the phone throttles or sleeps the app.
import { state, setMeta, getReminder, logFocus, updateSettings } from './store.js';
import { fmtTime } from './dates.js';
import { mountArt } from './art.js';
import { sfx, ambient } from './sfx.js';
import { notify } from './notify.js';

const PRESETS = [5, 15, 25, 45, 60, 90];
const R = 96;
const C = 2 * Math.PI * R;
const RESTORE_WINDOW = 30 * 60_000;

let api = {};
let root;
let live;
let isOpen = false;
let setup = { rid: null, title: '', minutes: 25 };
let raf = 0;
let endTimer = 0;
let liveTimer = 0;
let wake = null;
let lastText = '';
let lastSub = '';

const session = () => state.meta.focus || null;
const pad = (n) => String(n).padStart(2, '0');
const $ = (sel) => root.querySelector(sel);
const soundOn = () => state.settings.focusSound !== false;

function save(f) {
  setMeta({ focus: f });
  api.onChange?.();
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function fmtMinutes(ms) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function remaining() {
  const f = session();
  if (!f) return setup.minutes * 60_000;
  if (f.done) return 0;
  return f.end ? Math.max(0, f.end - Date.now()) : f.left;
}

function phase() {
  const f = session();
  return !f ? 'setup' : f.done ? 'done' : f.end ? 'running' : 'paused';
}

/* ---------------- Public API ---------------- */

export function initFocus(helpers) {
  api = helpers;
  const icon = api.icon;
  root = document.createElement('div');
  root.className = 'focus';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Focus session');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <canvas data-art="breath" data-dpr="1.25"></canvas>
    <div class="focus-head">
      <button class="f-icon" data-f="min" aria-label="Minimize">${icon('chev-down')}</button>
      <span class="focus-eyebrow">Focus</span>
      <button class="f-icon" data-f="sound" aria-label="Soundscape"></button>
    </div>
    <div class="focus-main">
      <div class="focus-task"></div>
      <div class="focus-dial">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="track" cx="100" cy="100" r="${R}" />
          <circle class="bar" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" />
        </svg>
        <div class="focus-clock"><div class="focus-time">25:00</div><div class="focus-sub"></div></div>
      </div>
    </div>
    <div class="focus-foot">
      <div class="focus-panel focus-setup">
        <div class="focus-presets">${PRESETS.map((m) => `<button data-min="${m}">${m}<small>min</small></button>`).join('')}</div>
        <button class="f-start" data-f="start">${icon('play')}<span>Begin</span></button>
        <p class="focus-hint"></p>
      </div>
      <div class="focus-panel focus-run">
        <button class="f-btn" data-f="end" aria-label="End session">${icon('stop')}</button>
        <button class="f-main" data-f="toggle" aria-label="Pause"></button>
        <button class="f-btn f-text" data-f="plus" aria-label="Add 5 minutes">+5</button>
      </div>
      <div class="focus-panel focus-done">
        <div class="fd-title">Session complete</div>
        <div class="fd-sub"></div>
        <div class="fd-actions">
          <button class="f-pill solid" data-f="markdone">Mark as done</button>
          <button class="f-pill" data-f="more">+5 min</button>
          <button class="f-pill" data-f="close">Close</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  live = document.createElement('button');
  live.className = 'focus-live';
  live.setAttribute('aria-label', 'Open focus session');
  live.innerHTML = '<span class="dot"></span><span class="t"></span><span class="l">Focus</span>';
  document.body.appendChild(live);

  root.addEventListener('click', onClick);
  live.addEventListener('click', () => open());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkEnd();
    if (isOpen) requestWake();
  });
  restore();
}

/** Open the focus screen, optionally for a specific reminder. */
export function openFocus({ rid = null, title = '' } = {}) {
  const f = session();
  if (f && !f.done) {
    if (rid && f.rid !== rid) api.toast?.('A focus session is already running');
    return open();
  }
  if (f?.done) save(null);
  setup = { rid, title: title || (rid ? getReminder(rid)?.title : '') || '', minutes: state.settings.focusMinutes || 25 };
  open();
}

export function minimizeFocus(fromPop = false) {
  if (!isOpen) return;
  isOpen = false;
  if (!fromPop) api.dropOverlay('focus');
  root.classList.remove('show');
  root.setAttribute('aria-hidden', 'true');
  cancelAnimationFrame(raf);
  raf = 0;
  releaseWake();
  sfx.close();
  updateLive();
  // A finished session that's dismissed is simply over.
  if (session()?.done) save(null);
}

export const isFocusOpen = () => isOpen;
export const focusSession = session;

/* ---------------- Internals ---------------- */

function open() {
  if (isOpen) return render();
  isOpen = true;
  api.pushOverlay('focus');
  root.classList.add('show');
  root.setAttribute('aria-hidden', 'false');
  mountArt(root);
  sfx.open();
  render();
  requestWake();
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.min) {
    setup.minutes = +b.dataset.min;
    updateSettings({ focusMinutes: setup.minutes });
    api.haptic?.(6);
    return render();
  }
  switch (b.dataset.f) {
    case 'min':
      return minimizeFocus();
    case 'sound':
      return toggleSound();
    case 'start':
      return start();
    case 'toggle':
      return session()?.end ? pause() : resume();
    case 'plus':
    case 'more':
      return addFive();
    case 'end':
      return endEarly();
    case 'markdone': {
      const rid = session()?.rid;
      finish();
      if (rid) api.complete?.(rid);
      return;
    }
    case 'close':
      return finish();
  }
}

function start() {
  const total = setup.minutes * 60_000;
  const now = Date.now();
  save({ rid: setup.rid, title: setup.title, total, end: now + total, left: null, started: now, done: false });
  sfx.focusStart();
  api.haptic?.(12);
  if (soundOn()) ambient.start();
  schedule();
  render();
  requestWake();
  media();
}

function pause() {
  const f = session();
  if (!f?.end) return;
  save({ ...f, left: Math.max(0, f.end - Date.now()), end: null });
  ambient.pause();
  clearTimeout(endTimer);
  releaseWake();
  api.haptic?.(8);
  render();
  media();
}

function resume() {
  const f = session();
  if (!f || f.end || f.done) return;
  save({ ...f, end: Date.now() + f.left, left: null });
  if (soundOn()) ambient.start();
  api.haptic?.(8);
  schedule();
  render();
  requestWake();
  media();
}

function addFive() {
  const f = session();
  if (!f) return;
  const add = 5 * 60_000;
  if (f.done) {
    const now = Date.now();
    save({ ...f, total: add, end: now + add, left: null, started: now, done: false, endedAt: null });
    sfx.focusStart();
    if (soundOn()) ambient.start();
  } else if (f.end) save({ ...f, total: f.total + add, end: f.end + add });
  else save({ ...f, total: f.total + add, left: f.left + add });
  api.haptic?.(6);
  schedule();
  render();
  requestWake();
  media();
}

function stopAll() {
  clearTimeout(endTimer);
  ambient.stop();
  releaseWake();
  media(true);
}

function endEarly() {
  const f = session();
  if (!f) return;
  const ms = f.total - remaining();
  stopAll();
  save(null);
  logFocus(ms, f.rid);
  minimizeFocus();
  api.toast?.(ms >= 60_000 ? `Focus ended · ${fmtMinutes(ms)}` : 'Focus ended');
}

function finish() {
  stopAll();
  save(null);
  minimizeFocus();
}

function complete() {
  const f = session();
  if (!f || f.done) return;
  save({ ...f, done: true, end: null, left: 0, endedAt: Date.now() });
  logFocus(f.total, f.rid);
  ambient.stop();
  releaseWake();
  media(true);
  sfx.focusEnd();
  api.haptic?.([90, 70, 90, 70, 200]);
  if (document.visibilityState !== 'visible' || !document.hasFocus()) {
    notify('Focus complete', { body: f.title ? `${f.title} · ${fmtMinutes(f.total)}` : `${fmtMinutes(f.total)} of focus`, tag: 'remindly-focus' });
  }
  if (isOpen) render();
  else open();
}

function schedule() {
  clearTimeout(endTimer);
  if (session()?.end) endTimer = setTimeout(checkEnd, Math.min(remaining() + 40, 2 ** 31 - 1));
}

function checkEnd() {
  const f = session();
  if (f?.end && Date.now() >= f.end) complete();
  else if (f?.end) schedule();
}

function toggleSound() {
  const on = !soundOn();
  updateSettings({ focusSound: on });
  if (session()?.end) on ? ambient.start() : ambient.stop();
  api.haptic?.(6);
  render();
  media();
}

function restore() {
  const f = session();
  if (!f) return;
  const now = Date.now();
  if (f.done) {
    if (now - (f.endedAt || 0) > RESTORE_WINDOW) save(null);
    else open();
    return;
  }
  if (f.end && now >= f.end) {
    // Finished while the app was closed
    if (now - f.end > RESTORE_WINDOW) {
      save(null);
      logFocus(f.total, f.rid);
      return;
    }
    return complete();
  }
  schedule();
  updateLive();
  media();
  // Audio can only restart after a touch, so pick the soundscape back up then.
  if (f.end && soundOn()) addEventListener('pointerdown', () => session()?.end && soundOn() && ambient.start(), { once: true });
}

/* ---------------- Drawing ---------------- */

function render() {
  const f = session();
  const st = phase();
  root.dataset.state = st;
  $('.focus-task').textContent = (f ? f.title : setup.title) || 'Deep Focus';
  root.querySelectorAll('[data-min]').forEach((b) => b.classList.toggle('on', +b.dataset.min === setup.minutes));

  const main = $('[data-f="toggle"]');
  const running = st === 'running';
  main.innerHTML = api.icon(running ? 'pause' : 'play');
  main.setAttribute('aria-label', running ? 'Pause' : 'Resume');

  const sb = $('[data-f="sound"]');
  sb.innerHTML = api.icon(soundOn() ? 'volume' : 'volume-x');
  sb.classList.toggle('off', !soundOn());
  sb.setAttribute('aria-pressed', String(soundOn()));
  $('.focus-hint').textContent = soundOn()
    ? 'Soundscape on. It also keeps the timer alive with the screen off.'
    : 'Sound is off. With the screen off, the end chime may wait until you return.';

  if (st === 'done') {
    $('.fd-sub').textContent = f.title ? `${fmtMinutes(f.total)} on ${f.title}` : `${fmtMinutes(f.total)} of deep focus`;
    const r = f.rid && getReminder(f.rid);
    $('[data-f="markdone"]').hidden = !r || r.done;
  }
  draw(true);
  updateLive();
  if (isOpen && running && !raf) loop();
}

function draw(force) {
  const f = session();
  const st = phase();
  const rem = remaining();
  const total = f ? f.total : setup.minutes * 60_000;
  const p = !f ? 0 : f.done ? 1 : 1 - rem / total;
  $('.bar').style.strokeDashoffset = String(C * (1 - p));
  const text = st === 'done' ? '0:00' : fmtClock(rem);
  if (force || text !== lastText) {
    $('.focus-time').textContent = text;
    lastText = text;
  }
  const sub =
    st === 'running'
      ? `Ends at ${fmtTime(new Date(f.end), state.settings.h24)}`
      : st === 'paused'
        ? 'Paused'
        : st === 'done'
          ? 'Well done'
          : `${setup.minutes} minute session`;
  if (sub !== lastSub) {
    $('.focus-sub').textContent = sub;
    lastSub = sub;
  }
}

function loop() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!isOpen || phase() !== 'running') return void (raf = 0);
    draw(false);
    if (remaining() <= 0) checkEnd();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/* The small "live" pill shown while a session runs in the background */
function updateLive() {
  const f = session();
  const show = !!f && !f.done && !isOpen;
  live.classList.toggle('show', show);
  live.classList.toggle('paused', !!f && !f.end);
  clearInterval(liveTimer);
  if (show) {
    tickLive();
    liveTimer = setInterval(tickLive, 1000);
  }
}

function tickLive() {
  live.querySelector('.t').textContent = fmtClock(remaining());
  checkEnd();
}

/* Keep the screen awake while a session is visible and running */
async function requestWake() {
  if (!('wakeLock' in navigator) || !isOpen || !session()?.end || document.visibilityState !== 'visible' || wake) return;
  try {
    wake = await navigator.wakeLock.request('screen');
    wake.addEventListener('release', () => (wake = null));
  } catch {}
}

function releaseWake() {
  wake?.release().catch(() => {});
  wake = null;
}

/* Lock-screen / notification-shade media controls while the soundscape plays */
let mediaBound = false;
function media(clear = false) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const f = session();
  try {
    if (clear || !f || f.done) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }
    ms.metadata = new MediaMetadata({
      title: f.title || 'Deep Focus',
      artist: 'Remindly · Focus',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    ms.playbackState = f.end ? 'playing' : 'paused';
    if (!mediaBound) {
      mediaBound = true;
      ms.setActionHandler('play', () => resume());
      ms.setActionHandler('pause', () => pause());
      try {
        ms.setActionHandler('stop', () => endEarly());
      } catch {}
    }
  } catch {}
}
