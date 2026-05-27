/* ============================================================
   LMAeroFit · Service Worker
   Estratégia equilibrada:
   - Cache First   → assets estáticos (CSS, JS, fontes, ícones, logo)
   - Network First → HTML (sempre busca versão nova; cai no cache se offline)
   - Stale-While-Revalidate → APIs externas (Open-Meteo)
   - Fallback → /offline.html quando navegação falha sem cache
   ============================================================ */

/* IMPORTANTE: incremente CACHE_VERSION sempre que publicar mudanças
   significativas em CSS/JS/HTML para forçar atualização nos celulares
   dos usuários. Mudar a versão = invalidar caches antigos. */
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE  = `lmaerofit-static-${CACHE_VERSION}`;
const HTML_CACHE    = `lmaerofit-html-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lmaerofit-runtime-${CACHE_VERSION}`;

/* App shell — arquivos críticos pré-cacheados na instalação.
   Mantenha esta lista enxuta. Se um arquivo aqui não existir, a
   instalação inteira do SW falha. */
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/assets/lmaerofit-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

/* Páginas das ferramentas — cacheadas sob demanda (network-first).
   Listadas aqui só para referência; não pré-cacheamos para evitar
   estourar quota em iOS. */
const TOOL_PAGES = [
  '/gear-lab.html',
  '/aero-bike-v3.html',
  '/race-fueling.html',
  '/race-weather-briefing.html',
  '/session-debrief.html'
];

/* Domínios cujas respostas usam stale-while-revalidate */
const SWR_HOSTS = [
  'api.open-meteo.com',
  'archive-api.open-meteo.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* Domínios cujas respostas NUNCA são cacheadas (preserva privacidade
   e evita quota) */
const NEVER_CACHE_HOSTS = [
  'formspree.io',
  'plausible.io',
  'umami.is'
];

/* ============================================================
   INSTALL — pré-cacheia app shell
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        // Se algum arquivo do shell faltar, loga mas não trava o SW
        console.warn('[SW] App shell incomplete:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ============================================================
   ACTIVATE — limpa caches de versões antigas
   ============================================================ */
self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, HTML_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('lmaerofit-') && !validCaches.includes(key))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH — roteamento de estratégia por tipo de requisição
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Só interceptamos GET. POSTs (Formspree, etc) passam direto.
  if (request.method !== 'GET') return;

  // Nunca cacheamos hosts sensíveis
  if (NEVER_CACHE_HOSTS.some((host) => url.hostname.includes(host))) {
    return; // deixa o navegador lidar normalmente
  }

  // Navegação (HTML) → Network First com fallback para offline.html
  if (request.mode === 'navigate' || (request.destination === 'document')) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // APIs externas conhecidas → Stale-While-Revalidate
  if (SWR_HOSTS.some((host) => url.hostname.includes(host))) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Assets estáticos same-origin → Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Padrão para terceiros não listados → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

/* ============================================================
   ESTRATÉGIAS
   ============================================================ */

async function networkFirstHTML(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const fresh = await fetch(request);
    // Só cacheia respostas OK (200-299)
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Sem conexão: tenta cache da própria URL
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fallback final: página offline
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    // Último recurso
    return new Response('Sem conexão.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.status !== 206) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Sem cache e sem rede
    return new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((fresh) => {
    if (fresh && fresh.ok && fresh.status !== 206) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  }).catch(() => cached); // se rede falhar, usa o cache antigo
  return cached || fetchPromise;
}

/* ============================================================
   MENSAGENS — permite ao app forçar atualização do SW
   Útil quando você publicar uma nova versão e quiser que o
   usuário ative na hora sem fechar o app.
   ============================================================ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
