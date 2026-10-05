// Remindly service worker: instant offline start + notification actions.
//
// Every release bumps VERSION. The new worker downloads the whole app into a
// fresh cache before it takes over (all-or-nothing), so the app always starts
// instantly from a complete, consistent copy, and never waits on the network.
const VERSION = 'v3';
const CACHE = `remindly-${VERSION}`;
const FONTS = 'remindly-fonts';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/dates.js',
  './js/parse.js',
  './js/notify.js',
  './js/art.js',
  './js/sfx.js',
  './js/motion.js',
  './js/focus.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/badge-96.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' skips the HTTP cache so a release is never mixed with older files
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache-first in a cache that survives app updates.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok || res.type === 'opaque') c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  if (url.origin !== location.origin) return;

  // App shell: cache-first (instant), network as a fallback for anything new.
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      if (req.mode === 'navigate') return (await c.match('./index.html')) || fetch(req);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return Response.error();
      }
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const data = n.data || {};
  const action = e.action || 'open';
  n.close();
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const msg = { type: 'notification-action', action, id: data.id, view: data.view };
      if (all.length) {
        const client = all[0];
        client.postMessage(msg);
        // Done / snooze can be handled silently; opening focuses the app.
        if (action === 'open' && 'focus' in client) await client.focus();
        return;
      }
      if (action === 'done' || action === 'snooze') {
        // App is closed: queue the action, it's applied the next time the app opens.
        await queueAction(msg);
        return;
      }
      const params = new URLSearchParams({ action });
      if (data.id) params.set('id', data.id);
      if (data.view) params.set('view', data.view);
      await self.clients.openWindow(`./?${params}`);
    })(),
  );
});

/* Tiny IndexedDB queue shared with the page (see drainQueue in js/app.js). */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('remindly-sw', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('queue', { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAction(msg) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add({ ...msg, at: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
