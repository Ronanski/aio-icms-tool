/* MT PLC Studio service worker: keeps the app for offline use. Stable (/mtps/) and Beta (/mtps/beta/) each have
   their own worker and cache. VER gets the build id added by scripts/copy-mtps.sh, so every build caches its files.
   Files are fetched network-first, so a restart after an update loads the new files. */
const VER = 'v0.5.0';
const SCOPE = new URL(self.registration ? self.registration.scope : './', self.location.href).pathname;
const CH = /\/beta\/$/.test(SCOPE) ? 'beta' : 'stable';
const CACHE = `mtps-${CH}-${VER}`;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/themes.css', 'css/tools.css', 'js/engine.js', 'js/ladder.js', 'js/update.js', 'js/help.js', 'js/help-ref.js', 'js/report.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'fonts/ibm-plex-sans-latin-400-normal.woff2', 'fonts/ibm-plex-sans-latin-600-normal.woff2', 'fonts/ibm-plex-sans-latin-700-normal.woff2', 'fonts/ibm-plex-mono-latin-400-normal.woff2', 'fonts/ibm-plex-mono-latin-600-normal.woff2',
  'fonts/roboto-latin-400-normal.woff2', 'fonts/roboto-latin-500-normal.woff2', 'fonts/roboto-latin-700-normal.woff2', 'fonts/roboto-mono-latin-400-normal.woff2', 'fonts/roboto-mono-latin-600-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(`mtps-${CH}-`) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || /version\.json$/.test(req.url)) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
