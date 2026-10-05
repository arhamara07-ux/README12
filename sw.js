// Remindly service worker: offline cache + notification actions.
const CACHE = 'remindly-v2';
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
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first for app files so updates land quickly, cache fallback offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google Fonts: cache-first so the typeface works offline too.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
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
