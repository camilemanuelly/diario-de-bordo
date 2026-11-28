const CACHE_NAME = 'diario-bordo-shell-v3';

const SUPABASE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const ASSETS_ESTATICOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/escalaEngine.js',
  './js/storageCache.js',
  './js/indexedDB.js',
  './js/migracao.js',
  './js/syncEngine.js',
  './js/supabaseClient.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  SUPABASE_SDK_URL
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        ASSETS_ESTATICOS.map(async (url) => {
          const req = url.startsWith('http')
            ? new Request(url, { mode: 'cors', credentials: 'omit' })
            : url;
          const resp = await fetch(req);
          if (resp && resp.ok) {
            await cache.put(req, resp);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const ehSdkSupabase = request.url.startsWith(SUPABASE_SDK_URL);

  // Nunca intercepta chamadas de dados/auth do Supabase nem outras origens não cacheadas
  if (url.hostname.endsWith('.supabase.co') || (url.origin !== self.location.origin && !ehSdkSupabase)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const redePromise = fetch(request)
        .then((resposta) => {
          if (resposta && resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
          }
          return resposta;
        })
        .catch(() => cached);

      return cached || redePromise;
    })
  );
});