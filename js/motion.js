// Smooth DOM updates.
//
// morph(): patches a container to match new HTML instead of replacing it, so
// canvases keep animating, scroll positions/focus/input values survive, and
// running animations are never cut off. Elements are matched by `data-flip`
// or `data-key`, everything else by position.
//
// render(): morph + FLIP. Elements that moved glide to their new position,
// new ones fade up, and removed ones fade out in place ("ghosts") while the
// rest of the list closes the gap.

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-flip') || n.getAttribute('data-key') : null);
const isGhost = (n) => n && n.nodeType === 1 && n.hasAttribute('data-ghost');
const skipGhosts = (n) => {
  while (isGhost(n)) n = n.nextSibling;
  return n;
};

function same(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.tagName === b.tagName && keyOf(a) === keyOf(b);
}

// Attributes owned by code rather than markup.
const KEEP = { CANVAS: ['width', 'height'] };

function syncAttrs(a, b) {
  const keep = KEEP[a.tagName];
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !keep?.includes(name)) a.removeAttribute(name);
  for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

function patch(a, b, rm) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  syncAttrs(a, b);
  const focused = a === document.activeElement;
  switch (a.tagName) {
    case 'CANVAS':
      return;
    case 'INPUT':
      if (!focused && a.value !== b.value) a.value = b.value;
      if (a.checked !== b.checked) a.checked = b.checked;
      return;
    case 'TEXTAREA':
      if (!focused && a.value !== b.value) a.value = b.value;
      return;
  }
  patchChildren(a, b, rm);
  if (a.tagName === 'SELECT' && !focused && a.value !== b.value) a.value = b.value;
}

function patchChildren(a, b, rm) {
  const keyed = new Map();
  for (let n = a.firstChild; n; n = n.nextSibling) {
    const k = keyOf(n);
    if (k && !isGhost(n)) keyed.set(k, n);
  }
  let cur = skipGhosts(a.firstChild);
  for (const nb of [...b.childNodes]) {
    const k = keyOf(nb);
    let m = null;
    if (k) {
      const c = keyed.get(k);
      if (c && same(c, nb)) {
        m = c;
        keyed.delete(k);
      }
    } else if (cur && !keyOf(cur) && same(cur, nb)) m = cur;
    if (m) {
      if (m === cur) cur = skipGhosts(cur.nextSibling);
      else a.insertBefore(m, cur);
      patch(m, nb, rm);
    } else a.insertBefore(nb, cur);
  }
  while (cur) {
    const next = skipGhosts(cur.nextSibling);
    rm(cur);
    cur = next;
  }
}

/** Make `target`'s children match `html`, touching only what changed. */
export function morph(target, html, rm = (n) => n.remove()) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(target, tpl.content, rm);
}

/** Where exit ghosts are drawn: the nearest positioned scroll container. */
const hostOf = (el) => el.closest('.view, .page-scroll') || el.parentElement;

function ghost(el, rect, host) {
  const hr = host.getBoundingClientRect();
  el.getAnimations().forEach((a) => a.id === 'flip' && a.cancel());
  el.setAttribute('data-ghost', '');
  el.removeAttribute('data-flip');
  el.querySelectorAll('[data-flip]').forEach((x) => x.removeAttribute('data-flip'));
  el.inert = true;
  Object.assign(el.style, {
    position: 'absolute',
    top: `${rect.top - hr.top + host.scrollTop}px`,
    left: `${rect.left - hr.left + host.scrollLeft}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '1',
  });
  host.appendChild(el);
  const a = el.animate(
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.96)' },
    ],
    { duration: 300, easing: EASE, fill: 'forwards' },
  );
  a.onfinish = () => el.remove();
}

/** morph() with FLIP: moved elements glide, new ones fade up, removed ones fade out. */
export function render(target, html, { animate = true } = {}) {
  if (!animate || reduced() || !target.isConnected) return morph(target, html);
  const vh = innerHeight;
  const before = new Map();
  for (const el of target.querySelectorAll('[data-flip]')) {
    const r = el.getBoundingClientRect();
    if (r.height && r.bottom > -80 && r.top < vh + 80) before.set(el.dataset.flip, r);
  }
  // Hold the container's height while things leave, so a shrinking list can't
  // snap the scroll position; it's released smoothly once the exits are done.
  const h0 = target.offsetHeight;
  target._hold?.cancel();
  target.style.minHeight = `${h0}px`;
  const removed = [];
  morph(target, html, (n) => {
    removed.push(n);
    n.remove();
  });

  const after = [...target.querySelectorAll('[data-flip]')];
  const present = new Set(after.map((el) => el.dataset.flip));
  // Interrupted glides restart from where they visually are, not from scratch.
  after.forEach((el) => el.getAnimations().forEach((a) => a.id === 'flip' && a.cancel()));

  const entering = new Set();
  for (const el of after) {
    const b = before.get(el.dataset.flip);
    const a = el.getBoundingClientRect();
    if (!a.height || a.bottom < -80 || a.top > vh + 80) continue;
    if (b) {
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const an = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 500, easing: EASE });
        an.id = 'flip';
      }
    } else if (before.size) {
      entering.add(el);
      const parent = el.parentElement?.closest('[data-flip]');
      if (parent && entering.has(parent)) continue; // its parent already fades in
      const an = el.animate(
        [
          { opacity: 0, transform: 'translateY(10px) scale(0.985)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 420, easing: EASE, delay: 140, fill: 'backwards' },
      );
      an.id = 'flip';
    }
  }

  // Exits: outermost removed elements whose key no longer exists anywhere.
  const host = hostOf(target);
  const consider = (n) => {
    if (n.nodeType !== 1) return;
    const k = n.getAttribute('data-flip');
    if (k && !present.has(k)) {
      const r = before.get(k);
      if (r && host) ghost(n, r, host);
      return;
    }
    for (const c of [...n.children]) consider(c);
  };
  removed.forEach(consider);

  const last = target.lastElementChild;
  const h1 = last ? last.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(last).marginBottom) - target.offsetTop : 0;
  target.style.minHeight = '';
  if (h1 < h0 - 1) {
    target._hold = target.animate([{ minHeight: `${h0}px` }, { minHeight: `${h1}px` }], { duration: 520, delay: 160, easing: EASE, fill: 'backwards' });
  }
}
