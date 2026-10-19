/* Service worker: caches the app so the trainer works offline once it has been opened.
   The Stable copy (site root) and the Beta copy (/beta/) each have their own worker and cache.
   VER is the app version; hosted builds get a build id added (scripts/copy-web.sh), so every new build caches its files. */
const VER = 'v1.4.1';
const SCOPE = new URL(self.registration ? self.registration.scope : './', self.location.href).pathname;
const CH = /\/beta\/$/.test(SCOPE) ? 'beta' : 'stable';
const CACHE = `plc-trainer-${CH}-${VER}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/ui.js', 'js/store.js', 'js/plc.js', 'js/ladder.js', 'js/circuit.js', 'js/workspace.js',
  'js/hmi.js', 'js/schematic.js', 'js/examples.js', 'js/update.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser HTTP cache (GitHub Pages sends max-age=600), so a new version caches new files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // drop older caches of this channel only (and the caches of versions before the channels existed)
  const mine = k => k.startsWith(`plc-trainer-${CH}-`) || (CH === 'stable' && /^plc-trainer-v/.test(k));
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => mine(k) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google Fonts: serve from cache, refresh in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // the Stable worker leaves the Beta copy to its own worker
  if (CH === 'stable' && url.pathname.startsWith(SCOPE + 'beta/')) return;
  // version.json is always asked fresh by the updater
  if (url.pathname.endsWith('/version.json')) return;
  // app files: network first so updates arrive, cache when offline
  // no-cache: revalidate with the server instead of using the browser HTTP cache (a navigation request takes no options, so use its URL)
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
