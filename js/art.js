// Generative monochrome art: animated canvases for hero cards, and a set of
// line-art glyphs used as list icons.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Canvas scenes ---------------- */

function beams(g, w, h, t) {
  // Perspective light planes converging on a glowing doorway
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.52;
  const n = 5;
  for (let side of [-1, 1]) {
    for (let i = n - 1; i >= 0; i--) {
      const k = i / n;
      const sway = Math.sin(t * 0.35 + i * 0.9 + (side > 0 ? 1.3 : 0)) * 0.04;
      const xOuter = cx + side * w * (0.18 + k * 0.42 + sway);
      const xInner = cx + side * w * (0.07 + k * 0.3 + sway * 0.5);
      const topOuter = cy - h * (0.36 - k * 0.12);
      const topInner = cy - h * (0.28 - k * 0.1);
      const bot = h * 1.02;
      const grad = g.createLinearGradient(xInner, 0, xOuter, 0);
      const a = 0.55 - k * 0.38 + Math.sin(t * 0.6 + i) * 0.06;
      grad.addColorStop(0, `rgba(255,255,255,${Math.max(0.04, a)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0.02)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(xInner, topInner);
      g.lineTo(xOuter, topOuter);
      g.lineTo(xOuter, bot);
      g.lineTo(xInner, bot);
      g.closePath();
      g.fill();
    }
  }
  // floor fade
  const fade = g.createLinearGradient(0, h * 0.55, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.95)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  // doorway
  const dw = w * 0.085;
  const dh = h * 0.24;
  const pulse = 0.55 + Math.sin(t * 1.1) * 0.2;
  g.shadowColor = `rgba(255,255,255,${pulse})`;
  g.shadowBlur = 24;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2;
  g.strokeRect(cx - dw / 2, cy - dh * 0.55, dw, dh);
  g.shadowBlur = 0;
}

function waves(g, w, h, t) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const lines = 26;
  g.lineWidth = 1.2;
  for (let i = 0; i < lines; i++) {
    const k = i / (lines - 1);
    const y0 = h * (0.22 + k * 0.6);
    const amp = h * (0.05 + 0.1 * Math.sin(k * Math.PI));
    g.strokeStyle = `rgba(255,255,255,${0.12 + 0.6 * Math.sin(k * Math.PI) ** 2})`;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const u = x / w;
      const y = y0 + Math.sin(u * 6.2 + t * 0.8 + k * 2.4) * amp * Math.sin(u * Math.PI) + Math.sin(u * 13 - t * 0.5 + k * 5) * amp * 0.18;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

function rings(g, w, h, t) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.46;
  const max = Math.hypot(w, h) * 0.6;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const p = (i / n + t * 0.045) % 1;
    const r = p * max;
    g.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.55})`;
    g.lineWidth = 1 + (1 - p) * 1.5;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.22);
  const pulse = 0.75 + Math.sin(t * 1.4) * 0.15;
  core.addColorStop(0, `rgba(255,255,255,${pulse})`);
  core.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(cx, cy, h * 0.22, 0, Math.PI * 2);
  g.fill();
}

function orbit(g, w, h, t) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.34;
  for (let i = 0; i < 9; i++) {
    const tilt = 0.25 + i * 0.08;
    const rot = t * 0.12 + i * 0.35;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(1, tilt);
    g.strokeStyle = `rgba(255,255,255,${0.12 + i * 0.05})`;
    g.lineWidth = 1.2 / tilt;
    g.beginPath();
    g.arc(0, 0, R * (0.6 + i * 0.06), 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.4, 'rgba(255,255,255,0.2)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
}

const SCENES = { beams, waves, rings, orbit };

/* One shared animation loop for every mounted canvas; each pauses when off-screen. */
const mounted = new Set();
let raf = 0;
let last = 0;
const io =
  'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => (e.target._artVisible = e.isIntersecting)), { threshold: 0.01 }) : null;

function size(c) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < 33) return; // ~30fps is plenty for slow ambient motion
  last = now;
  const t = now / 1000;
  for (const c of mounted) {
    if (!c.isConnected) {
      mounted.delete(c);
      io?.unobserve(c);
      continue;
    }
    if (c._artVisible === false || !c.offsetParent || c.closest('.view:not(.active):not(.animating)')) continue;
    size(c);
    SCENES[c.dataset.art]?.(c._g, c.width, c.height, t + c._seed);
  }
  if (!mounted.size) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

/** Find all <canvas data-art="..."> under root and start animating them. */
export function mountArt(root) {
  root.querySelectorAll('canvas[data-art]').forEach((c) => {
    if (mounted.has(c)) return;
    c._g = c.getContext('2d');
    c._seed = (+c.dataset.seed || 0) * 7.3;
    mounted.add(c);
    io?.observe(c);
    requestAnimationFrame(() => {
      size(c);
      SCENES[c.dataset.art]?.(c._g, c.width, c.height, 1 + c._seed);
    });
  });
  if (!reduced() && !raf && mounted.size) raf = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else if (!document.hidden && !raf && mounted.size && !reduced()) raf = requestAnimationFrame(frame);
});

/* ---------------- Line-art glyphs (list icons) ---------------- */
// Drawn in a 48×48 box, clipped to a circle by CSS.
export const GLYPHS = {
  loop: '<path d="M17 10c9 0 12 7 7 12s-4 13 6 15"/><path d="M4 30c6-2 10-1 13 2M31 37c5 1 9 0 13-3"/>',
  wave: '<path d="M0 24c4-9 8-9 12 0s8 9 12 0 8-9 12 0 8 9 12 0"/>',
  grid: '<path d="M12 0v48M20 0v48M28 0v48M36 0v48M0 12h48M0 20h48M0 28h48M0 36h48"/>',
  moon: '<path d="M27 11a13 13 0 1 0 10 21 11 11 0 0 1-10-21z"/><circle cx="34" cy="16" r=".9"/><circle cx="38" cy="22" r=".9"/><circle cx="31" cy="21" r=".9"/><circle cx="36" cy="28" r=".9"/>',
  rings: '<circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="12"/><circle cx="24" cy="24" r="18"/>',
  sun: '<circle cx="24" cy="24" r="7"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/>',
  peaks: '<path d="M2 34l11-14 8 9 7-8 18 13"/><path d="M2 40h44"/>',
  dots: '<g fill="currentColor" stroke="none"><circle cx="12" cy="12" r="2"/><circle cx="24" cy="12" r="2"/><circle cx="36" cy="12" r="2"/><circle cx="12" cy="24" r="2"/><circle cx="24" cy="24" r="2"/><circle cx="36" cy="24" r="2"/><circle cx="12" cy="36" r="2"/><circle cx="24" cy="36" r="2"/><circle cx="36" cy="36" r="2"/></g>',
  slash: '<path d="M-4 20L20-4M-4 32L32-4M-4 44L44-4M4 52L52 4M16 52L52 16M28 52L52 28"/>',
  spark: '<path d="M24 6c2 12 6 16 18 18-12 2-16 6-18 18-2-12-6-16-18-18 12-2 16-6 18-18z"/>',
  heart: '<path d="M24 37s-13-8-13-17a7 7 0 0 1 13-4 7 7 0 0 1 13 4c0 9-13 17-13 17z"/>',
  drop: '<path d="M24 8s11 12 11 20a11 11 0 0 1-22 0c0-8 11-20 11-20z"/><path d="M19 29a5 5 0 0 0 5 5"/>',
  bolt: '<path d="M27 6L13 27h10l-3 15 15-22H25z"/>',
  cube: '<path d="M24 8l14 8v16l-14 8-14-8V16z"/><path d="M10 16l14 8 14-8M24 24v16"/>',
  leaf: '<path d="M12 36c0-16 10-24 26-24 0 16-8 26-24 26"/><path d="M12 36l14-14"/>',
  bag: '<path d="M12 18h24l-2 22H14z"/><path d="M19 18v-3a5 5 0 0 1 10 0v3"/>',
};
export const GLYPH_NAMES = Object.keys(GLYPHS);

const DEFAULT_GLYPH = { personal: 'loop', work: 'grid', shopping: 'bag', health: 'wave', bills: 'rings' };

export function glyphFor(list) {
  if (list.glyph && GLYPHS[list.glyph]) return list.glyph;
  if (DEFAULT_GLYPH[list.id]) return DEFAULT_GLYPH[list.id];
  let h = 0;
  for (const ch of String(list.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GLYPH_NAMES[h % GLYPH_NAMES.length];
}

/** Circular line-art icon. size in px. */
export function orb(name, size = 44, cls = '') {
  return `<span class="orb ${cls}" style="--s:${size}px"><svg viewBox="0 0 48 48" aria-hidden="true">${GLYPHS[name] || GLYPHS.loop}</svg></span>`;
}
