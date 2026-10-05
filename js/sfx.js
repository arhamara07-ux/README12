// Interface sounds, synthesized live with WebAudio (no audio files).
// Soft sine/triangle tones through a gentle echo for a spacious, calm feel.
import { state } from './store.js';

let ctx = null;
let master = null;
let wet = null;

// Pentatonic notes (Hz). Tabs and actions pick from this so everything sounds in key.
const SCALE = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  // Feedback delay as a cheap, airy "space"
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.19;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  wet = ctx.createGain();
  wet.gain.value = 0.28;
  wet.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  lp.connect(master);
  return ctx;
}

const enabled = () => state.settings.uiSounds !== false;

// Browsers only allow audio after a user gesture; unlock on the first touch.
export function unlock() {
  const c = init();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, unlock, { once: false, passive: true }));

function tone(freq, { at = 0, dur = 0.18, gain = 0.08, type = 'sine', slide = 0, echo = true, attack = 0.006 } = {}) {
  const c = ctx;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  if (echo) g.connect(wet);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ at = 0, dur = 0.3, gain = 0.05, from = 400, to = 3000, q = 0.8 } = {}) {
  const c = ctx;
  const t = c.currentTime + at;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function play(fn) {
  if (!enabled()) return;
  const c = init();
  if (!c || c.state !== 'running') return;
  try {
    fn();
  } catch {}
}

export const sfx = {
  /** Barely-there click for generic taps */
  tap: () => play(() => tone(1400, { dur: 0.05, gain: 0.035, type: 'triangle', echo: false, attack: 0.002 })),
  /** Each tab has its own note, so moving across tabs plays a little melody */
  tab: (i) =>
    play(() => {
      tone(SCALE[(i * 2) % SCALE.length], { dur: 0.32, gain: 0.06 });
      tone(SCALE[(i * 2) % SCALE.length] * 2, { dur: 0.12, gain: 0.015, type: 'triangle' });
    }),
  toggle: (on) => play(() => tone(on ? 880 : 587, { dur: 0.09, gain: 0.05, type: 'triangle', slide: on ? 1.25 : 0.8, echo: false })),
  complete: () =>
    play(() => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.055, dur: 0.5, gain: 0.07 - i * 0.008 }));
    }),
  add: () =>
    play(() => {
      tone(587.33, { dur: 0.16, gain: 0.07 });
      tone(880, { at: 0.08, dur: 0.38, gain: 0.07 });
    }),
  remove: () =>
    play(() => {
      tone(330, { dur: 0.28, gain: 0.08, slide: 0.45, echo: false });
      noise({ dur: 0.22, gain: 0.02, from: 1600, to: 300 });
    }),
  open: () =>
    play(() => {
      noise({ dur: 0.34, gain: 0.03, from: 300, to: 2400 });
      tone(659.25, { at: 0.05, dur: 0.3, gain: 0.03 });
    }),
  close: () => play(() => noise({ dur: 0.26, gain: 0.022, from: 2000, to: 280 })),
  swipe: () => play(() => noise({ dur: 0.18, gain: 0.02, from: 800, to: 2600, q: 1.4 })),
  /** Soft swell when the app opens */
  intro: () =>
    play(() => {
      [261.63, 392.0, 523.25, 659.25].forEach((f, i) => tone(f, { at: i * 0.09, dur: 1.6, gain: 0.035, attack: 0.25 }));
    }),
  alert: () =>
    play(() => {
      [880, 1318.5, 1760].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.6, gain: 0.08 }));
    }),
};
