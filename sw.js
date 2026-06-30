/**
 * HappyMall iCatalog — Service Worker v2
 * =========================================
 * Strategy:
 *  • data.json / API  : Network First → fallback to cache (always fresh data)
 *  • HTML pages       : Cache First   → fallback to network (never show black screen)
 *  • All other assets : Cache First   → fallback to network
 *
 * KEY FIX: All assets are cached under their CLEAN URL (no ?_cb= timestamps).
 * Cache-busting is done via fetch options only, not stored in the cache key.
 */

const CACHE_NAME    = 'happymall-v97';
const DATA_URL      = '/data.json';

// All catalog assets to pre-cache immediately on install
// Heavy files (SVGs and Video) are interleaved with lighter files 
// so the progress bar updates smoothly rather than stalling.
const PRECACHE_ASSETS = [
    './',
    'index.html',
    'assets/floor_plans/FloorPlan-G.svg',
    'cover.html',
    'developer.html',
    'assets/floor_plans/FloorPlan-1st.svg',
    'mall.html',
    'location.html',
    'plans.html',
    'assets/floor_plans/FloorPlan-B.svg',
    'contacts.html',
    'end.html',
    'global.css',
    'assets/floor_plans/FloorPlan-2nd.svg',
    'global.js',
    'nav.css',
    'nav.js',
    'developer.css',
    'database.js',
    'assets/floor_plans/FloorPlan-3rd.svg',
    'manifest.json',
    'g-floor.html',
    '1st-floor.html',
    'b-floor.html',
    'assets/HappyMallIntro.mp4',
    '2nd-floor.html',
    '3rd-floor.html',
    'floor.css',
    'floor-loader.js',
    'floor-page.js',
    'floor.js',
    '1st-floor.css',
    '1st-floor.js',
    'data.json',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'assets/images/MallLogo.webp',
    'assets/images/1.webp',
    'assets/images/DeveloperLogo.webp',
    'assets/images/DeveloperPageImage.webp',
    'assets/images/Developer-Icon-blue.webp',
    'assets/images/Mall-Location-Map.webp',
    'assets/images/Developer-Location-Map.webp',
    'assets/images/Mall_horizontal_Logo.webp',
    'assets/images/Mall_images/1.jpg',
    'assets/images/Mall_images/2.jpg',
    'assets/images/Mall_images/3.jpg',
    'assets/images/Mall_images/4.jpg',
    'assets/images/Mall_images/5.jpg',
    'assets/images/Mall_images/6.jpg'
];

// Helper: broadcast progress to all clients
async function broadcastProgress(progress, status) {
    try {
        const channel = new BroadcastChannel('pwa_precache_channel');
        channel.postMessage({ type: 'SW_PRECACHE_PROGRESS', progress, status });
        channel.close();
    } catch(e) {}

    try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clients) {
            client.postMessage({ type: 'SW_PRECACHE_PROGRESS', progress, status });
        }
    } catch(e) {}
}

// ── INSTALL: pre-cache all assets ────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        console.log('[SW] Pre-caching catalog assets...');

        let completed = 0;
        const total = PRECACHE_ASSETS.length;
        const concurrencyLimit = 3;
        const queue = [...PRECACHE_ASSETS];

        async function worker() {
            while (queue.length > 0) {
                const url = queue.shift();
                if (!url) continue;

                try {
                    // Fetch fresh from network (bypass browser cache using cache-buster)
                    // but store under the CLEAN URL (no timestamp in cache key)
                    const fetchUrl = `${url}?_cb=${Date.now()}`;
                    const res = await fetch(fetchUrl, {
                        cache: 'no-store'
                    });
                    if (res.ok) {
                        // Always store under the clean URL
                        await cache.put(url, res);
                    } else {
                        console.warn('[SW] Precache non-ok:', url, res.status);
                    }
                } catch(e) {
                    console.warn('[SW] Precache skip (network error):', url, e.message);
                } finally {
                    completed++;
                    const percentage = Math.round((completed / total) * 100);
                    await broadcastProgress(percentage, 'installing');
                }
            }
        }

        const workers = Array(concurrencyLimit).fill(null).map(() => worker());
        await Promise.all(workers);

        console.log('[SW] Pre-caching complete.');
        await broadcastProgress(100, 'complete');
        self.skipWaiting();
    })());
});

// ── ACTIVATE: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => {
                    console.log('[SW] Deleting old cache:', k);
                    return caches.delete(k);
                })
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH: intercept all requests ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    // Skip non-http(s) requests (chrome-extension, etc.)
    if (!url.protocol.startsWith('http')) return;
    // Skip ping requests (connectivity checks)
    if (url.searchParams.has('ping')) return;
    // Skip admin panel — always fresh
    if (url.pathname === '/admin.html') return;
    // Skip external origins (Google Maps, fonts, etc.)
    if (url.origin !== self.location.origin) return;

    // Handle Video Files specifically for Safari iOS (requires 206 Partial Content)
    if (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm')) {
        event.respondWith(serveVideoFromCache(event.request));
        return;
    }

    // Media assets (Images, Videos, SVGs, Fonts) — Cache First (Load instantly, fallback to network)
    const isMedia = url.pathname.match(/\.(webp|jpg|jpeg|png|gif|svg|mp4|webm|woff|woff2|ttf|otf)$/i);
    if (isMedia) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // Code & Content (HTML, CSS, JS, JSON, API) — Network First
    // This forces the app to ALWAYS fetch the latest updates from the server when online,
    // solving the issue of users seeing old cached pages.
    event.respondWith(networkFirst(event.request));
});

// ── STRATEGIES ────────────────────────────────────────────────────────────────

/**
 * Network First: try network, update cache on success, fall back to cache.
 * Used for data.json and API endpoints.
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cleanKey = stripCacheBuster(request.url);

    // Try network with cache bypass
    try {
        const bustUrl = new URL(request.url);
        bustUrl.searchParams.set('_t', Date.now());
        const networkRes = await fetch(new Request(bustUrl.toString(), {
            cache: 'no-store',
            credentials: 'same-origin'
        }));

        if (networkRes.ok) {
            // Store under clean URL (no timestamp)
            cache.put(cleanKey, networkRes.clone());
        }
        return networkRes;
    } catch {
        // Network failed — serve from cache
        const cached = await findInCache(cache, cleanKey);
        if (cached) {
            console.log('[SW] Offline fallback (networkFirst):', cleanKey);
            return cached;
        }
        return new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Cache First: serve from cache immediately, fetch from network if missing.
 * Used for all static assets (HTML, CSS, JS, images, SVGs).
 * Never returns a black/white screen — always falls back gracefully.
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cleanKey = stripCacheBuster(request.url);

    // Try cache first
    const cached = await findInCache(cache, cleanKey);
    if (cached) {
        return cached;
    }

    // Not in cache — try network
    try {
        const networkRes = await fetch(request, { credentials: 'same-origin' });
        if (networkRes.ok) {
            cache.put(cleanKey, networkRes.clone());
        }
        return networkRes;
    } catch(e) {
        console.warn('[SW] Offline, no cache for:', cleanKey);

        // For navigation requests, return index.html as fallback (prevents black screen)
        if (request.mode === 'navigate') {
            const indexFallback = await cache.match('index.html') ||
                                  await cache.match('/index.html') ||
                                  await cache.match('./');
            if (indexFallback) {
                console.log('[SW] Returning index.html as navigation fallback');
                return indexFallback;
            }
        }

        return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Strip cache-buster query params from a URL string.
 * Returns the clean URL as a string.
 */
function stripCacheBuster(urlStr) {
    try {
        const u = new URL(urlStr);
        u.searchParams.delete('_t');
        u.searchParams.delete('_cb');
        u.searchParams.delete('v');
        return u.toString();
    } catch {
        return urlStr;
    }
}

/**
 * Find a cached response by exact clean URL, then by pathname match as fallback.
 */
async function findInCache(cache, cleanUrl) {
    // Try exact match first (ignoring search params)
    let res = await cache.match(cleanUrl, { ignoreSearch: true });
    if (res) return res;

    // Try pathname-only match (handles relative vs absolute URL differences)
    try {
        const targetPath = new URL(cleanUrl).pathname;
        const keys = await cache.keys();
        for (const key of keys) {
            const cachedPath = new URL(key.url).pathname;
            if (cachedPath === targetPath) {
                res = await cache.match(key);
                if (res) return res;
            }
        }
    } catch(e) {
        console.warn('[SW] findInCache pathname fallback error:', e);
    }

    return null;
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CACHE_UPDATED') {
        self.clients.matchAll().then(clients => {
            clients.forEach(c => c.postMessage({ type: 'DATA_UPDATED' }));
        });
    }
});

// ── VIDEO RANGE REQUEST HANDLER ───────────────────────────────────────────────
async function serveVideoFromCache(request) {
    const cache = await caches.open(CACHE_NAME);
    const cleanUrl = stripCacheBuster(request.url);
    const cachedResponse = await findInCache(cache, cleanUrl);
    
    if (!cachedResponse) {
        // If not in cache yet, try fetching from network
        return fetch(request);
    }

    const videoBuffer = await cachedResponse.arrayBuffer();
    const rangeHeader = request.headers.get('Range');
    
    if (!rangeHeader) {
        return new Response(videoBuffer, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': videoBuffer.byteLength
            }
        });
    }

    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : videoBuffer.byteLength - 1;
    const chunksize = (end - start) + 1;
    
    const slicedBuffer = videoBuffer.slice(start, end + 1);

    return new Response(slicedBuffer, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Range': `bytes ${start}-${end}/${videoBuffer.byteLength}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4'
        }
    });
}
