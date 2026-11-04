// Incrémentez VERSION à chaque déploiement pour forcer la mise à jour du cache.
const VERSION = 'v2';
const CACHE_NAME = 'bikerun-eps-' + VERSION;

// Fichiers de l'appli (même origine)
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Bibliothèques externes : DOIVENT être exactement les mêmes URLs/versions que dans index.html
const CDN = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Oswald:wght@500;600;700&family=JetBrains+Mono:wght@700;800&display=swap',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// Seuls ces domaines passent par le cache. Firestore, Google Sheets, etc. ne sont JAMAIS interceptés.
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'www.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // allSettled : un fichier manquant (ex. une icône) ne fait plus échouer toute l'installation
    const res = await Promise.allSettled([...CORE, ...CDN].map(url => cache.add(url)));
    res.forEach((r, i) => { if (r.status === 'rejected') console.warn('SW : non mis en cache →', [...CORE, ...CDN][i]); });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('bikerun-eps-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Pages : réseau d'abord (toujours la dernière version), repli sur le cache après 4 s ou hors-ligne
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match('./index.html');
    return cached || Response.error();
  }
}

// Ressources : cache d'abord, mise à jour en arrière-plan
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(network); return cached; }
  return (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(event));
});
