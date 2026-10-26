/*
 * Service worker da Pamonharia.
 * Estratégia: armazena em cache apenas arquivos estáticos (app, ícones, imagens do cardápio)
 * para carregamento rápido. A API NUNCA é atendida pelo cache e pedidos NÃO são enfileirados
 * offline: sem conexão, a confirmação falha de forma explícita e nada é duplicado.
 */
const CACHE = 'pamonharia-static-v1';
const PRECACHE = ['/', '/icon.svg', '/icon-192.png', '/images/fallback.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  // Navegação: rede primeiro (sempre a versão mais nova), cache como reserva.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Estáticos (JS/CSS com hash, imagens): cache primeiro, atualizando em segundo plano.
  if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
