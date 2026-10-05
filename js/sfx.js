// Sound, synthesized live with WebAudio (no audio files):
//  - sfx: soft interface tones, all in one pentatonic key
//  - ambient: a generative focus soundscape (warm noise, breathing pad, rare bells)
import { state } from './store.js';

let ctx = null;
let master = null;
let wet = null;
let noiseBuf = null;

// Pentatonic notes (Hz). Tabs and actions pick from this so everything sounds in key.
const SCALE = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: 'interactive' });
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
  // One reusable second of white noise for whooshes
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// Browsers only allow audio after a user gesture; unlock on every touch until running.
export function unlock() {
  const c = init();
  if (c && c.state !== 'running') c.resume().catch(() => {});
}
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, unlock, { passive: true }));

function tone(freq, { at = 0, dur = 0.18, gain = 0.08, type = 'sine', slide = 0, echo = true, attack = 0.006, out = master } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  if (echo) g.connect(wet);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function whoosh({ at = 0, dur = 0.3, gain = 0.05, from = 400, to = 3000, q = 0.8 } = {}) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const uiOn = () => state.settings.uiSounds !== false;
const alertsOn = () => state.settings.sound !== false;

function play(fn, on = uiOn) {
  if (!on()) return;
  const c = init();
  if (!c || c.state !== 'running') return;
  try {
    fn();
  } catch {}
}

export const sfx = {
  /** Barely-there click for generic taps */
  tap: () => play(() => tone(1400, { dur: 0.05, gain: 0.032, type: 'triangle', echo: false, attack: 0.002 })),
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
      whoosh({ dur: 0.22, gain: 0.02, from: 1600, to: 300 });
    }),
  open: () =>
    play(() => {
      whoosh({ dur: 0.34, gain: 0.03, from: 300, to: 2400 });
      tone(659.25, { at: 0.05, dur: 0.3, gain: 0.03 });
    }),
  close: () => play(() => whoosh({ dur: 0.26, gain: 0.022, from: 2000, to: 280 })),
  /** Soft swell when the app opens (only audible once the user has touched the screen) */
  intro: () =>
    play(() => {
      [261.63, 392.0, 523.25, 659.25].forEach((f, i) => tone(f, { at: i * 0.09, dur: 1.6, gain: 0.035, attack: 0.25 }));
    }),
  /** A reminder is due */
  alert: () =>
    play(() => {
      [880, 1318.5, 1760].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.6, gain: 0.08 }));
    }, alertsOn),
  focusStart: () =>
    play(() => {
      tone(440, { dur: 1.4, gain: 0.05, attack: 0.08 });
      tone(659.25, { at: 0.18, dur: 1.8, gain: 0.045, attack: 0.1 });
    }),
  /** Session complete: three slow bells */
  focusEnd: () =>
    play(() => {
      [880, 659.25, 440].forEach((f, i) => {
        tone(f, { at: i * 0.42, dur: 2.6, gain: 0.08, attack: 0.004 });
        tone(f * 2.01, { at: i * 0.42, dur: 0.9, gain: 0.012, echo: false });
      });
    }, alertsOn),
};

/* =========================================================
   Ambient focus soundscape
   ========================================================= */
let amb = null;

function brownNoise(c, seconds = 6) {
  // Seamless loop: the first second crossfades from the "continuation" of the
  // end into the true start, so there's no click at the loop point.
  const sr = c.sampleRate;
  const len = Math.floor(sr * seconds);
  const fade = sr;
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const tmp = new Float32Array(len + fade);
    let last = 0;
    for (let i = 0; i < tmp.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      tmp[i] = last * 3.2;
    }
    for (let i = 0; i < len; i++) d[i] = tmp[i];
    for (let i = 0; i < fade; i++) {
      const x = i / fade;
      d[i] = tmp[len + i] * (1 - x) + tmp[i] * x;
    }
  }
  return buf;
}

function buildAmbient(c) {
  const out = c.createGain();
  out.gain.value = 0.0001;
  const nodes = [];

  // Warm air: brown noise through a slowly breathing low-pass
  const src = c.createBufferSource();
  src.buffer = brownNoise(c);
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  lp.Q.value = 0.3;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.031;
  const lfoAmt = c.createGain();
  lfoAmt.gain.value = 240;
  lfo.connect(lfoAmt).connect(lp.frequency);
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.38;
  src.connect(lp).connect(noiseGain).connect(out);
  nodes.push(src, lfo);

  // A low, breathing pad (A add9), slightly detuned pairs for width
  const pad = c.createGain();
  pad.gain.value = 0.055;
  const padLp = c.createBiquadFilter();
  padLp.type = 'lowpass';
  padLp.frequency.value = 820;
  [110, 164.81, 220, 246.94, 329.63].forEach((f, i) => {
    [0, 1].forEach((k) => {
      const o = c.createOscillator();
      o.type = k ? 'triangle' : 'sine';
      o.frequency.value = f * (k ? 1.004 : 0.998);
      const g = c.createGain();
      g.gain.value = (k ? 0.1 : 0.22) / (1 + i * 0.45);
      o.connect(g).connect(padLp);
      nodes.push(o);
    });
  });
  padLp.connect(pad).connect(out);
  const breath = c.createOscillator();
  breath.frequency.value = 1 / 13;
  const breathAmt = c.createGain();
  breathAmt.gain.value = 0.028;
  breath.connect(breathAmt).connect(pad.gain);
  nodes.push(breath);

  // Its own airy echo for the occasional bell
  const bells = c.createGain();
  const dl = c.createDelay(2);
  dl.delayTime.value = 0.43;
  const fb = c.createGain();
  fb.gain.value = 0.45;
  const dlp = c.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 1800;
  bells.connect(out);
  bells.connect(dl);
  dl.connect(dlp).connect(fb).connect(dl);
  dlp.connect(out);

  nodes.forEach((n) => n.start());
  return { out, nodes, bells };
}

function bell(a) {
  if (!a || a.paused) return;
  const notes = [440, 493.88, 554.37, 659.25, 739.99, 880, 987.77];
  const f = notes[Math.floor(Math.random() * notes.length)];
  tone(f, { dur: 3.2, gain: 0.022, attack: 0.01, echo: false, out: a.bells });
  if (Math.random() < 0.35) tone(f * 1.5, { at: 0.6 + Math.random(), dur: 2.6, gain: 0.012, echo: false, out: a.bells });
}

function scheduleBells(a) {
  clearTimeout(a.timer);
  a.timer = setTimeout(
    () => {
      bell(a);
      if (amb === a) scheduleBells(a);
    },
    7000 + Math.random() * 9000,
  );
}

export const ambient = {
  get playing() {
    return !!amb && !amb.paused;
  },
  /** Start (or resume) the soundscape. Must be called from a user gesture the first time. */
  start(volume = 0.5) {
    const c = init();
    if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    if (amb) return ambient.resume();
    const a = buildAmbient(c);
    amb = a;
    a.paused = false;
    // Route through a media element so the sound (and the focus timer) keeps
    // going with the screen off, and lock-screen media controls appear.
    try {
      const dest = c.createMediaStreamDestination();
      a.out.connect(dest);
      a.el = new Audio();
      a.el.srcObject = dest.stream;
      a.el.play().catch(() => {
        a.out.disconnect();
        a.out.connect(c.destination);
        a.el = null;
      });
    } catch {
      a.out.connect(c.destination);
      a.el = null;
    }
    a.volume = volume;
    a.out.gain.setTargetAtTime(volume, c.currentTime, 1.4);
    scheduleBells(a);
  },
  pause() {
    const a = amb;
    if (!a || a.paused) return;
    a.paused = true;
    a.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    clearTimeout(a.timer);
    setTimeout(() => a.paused && a.el?.pause(), 1200);
  },
  resume() {
    const a = amb;
    if (!a || !a.paused) return;
    a.paused = false;
    a.el?.play().catch(() => {});
    a.out.gain.setTargetAtTime(a.volume, ctx.currentTime, 0.8);
    scheduleBells(a);
  },
  stop() {
    const a = amb;
    if (!a) return;
    amb = null;
    clearTimeout(a.timer);
    a.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.45);
    setTimeout(() => {
      a.nodes.forEach((n) => {
        try {
          n.stop();
        } catch {}
      });
      a.el?.pause();
      a.out.disconnect();
    }, 2600);
  },
};
