/**
 * TheMall iCatalog — Global Data Sync Layer v2
 * =============================================
 * Single source of truth. Used by admin, floor plans, and payment plans.
 *
 * DATA SOURCES (priority order):
 *  Online  → /api/data  (Netlify Function → Netlify Blob)
 *  Offline → localStorage cache (updated every time online data loads)
 *  First   → /data.json (static file, seed data, fallback if API fails first time)
 *
 * SAVE (admin only, online):
 *  POST /api/data with X-Admin-Key header
 *  Also updates localStorage cache
 *
 * STATUS:
 *  Fires 'thaMallDataEvent' custom event on window with { event, data, source }
 */

const ThaMallDB = (() => {
    const API_URL    = '/api/data';
    const SEED_URL   = '/data.json';
    const LOCAL_KEY  = 'tha_mall_admin_data';
    const TS_KEY     = 'tha_mall_data_ts';
    // Bump this when unit IDs change — forces stale localStorage to be cleared
    const DATA_SCHEMA_VERSION = 2; // v2: new SVG unit IDs (G-6, F-1, S-6 etc.)
    const SCHEMA_KEY = 'tha_mall_schema_v';

    let _lastSource = 'cache';
    let _isOnline   = null;
    let _connChecked = false;
    let _syncInProgress = false;
    let _lastSyncTime   = 0;

    // Listen to browser events as hints, but verify actively to handle iOS Safari peculiarities
    window.addEventListener('online',  () => {
        ping().then(online => {
            _connChecked = true;
            _notify('networkStatus', { online, checked: true });
        });
    });
    window.addEventListener('offline', () => {
        _isOnline = false;
        _connChecked = true;
        _notify('networkStatus', { online: false, checked: true });
    });

    // ── INTERNAL HELPERS ────────────────────────────────────────────────────

    function _cacheWrite(data) {
        try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
            localStorage.setItem(TS_KEY, data._savedAt || new Date().toISOString());
        } catch(e) { /* storage full or private mode */ }
    }

    function _cacheRead() {
        try {
            const raw = localStorage.getItem(LOCAL_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
    }

    function _getAdminPassword() {
        try {
            const p = JSON.parse(localStorage.getItem('admin_profile') || '{}');
            return p.password || 'admin';
        } catch { return 'admin'; }
    }

    function _notify(eventName, detail) {
        window.dispatchEvent(new CustomEvent('thaMallDataEvent', { detail: { event: eventName, ...detail } }));
    }

    // ── LOAD ────────────────────────────────────────────────────────────────
    /**
     * Load catalog data.
     * Instantly returns local cache (0ms delay) and silently syncs with Netlify Blobs in background.
     * Returns Promise<{ data: object, source: 'api'|'cache'|'seed'|'default' }>
     */
    async function load() {
        // Wipe stale localStorage if schema version changed
        try {
            const storedSchemaV = parseInt(localStorage.getItem(SCHEMA_KEY) || '0', 10);
            if (storedSchemaV < DATA_SCHEMA_VERSION) {
                localStorage.removeItem(LOCAL_KEY);
                localStorage.removeItem(TS_KEY);
                localStorage.setItem(SCHEMA_KEY, String(DATA_SCHEMA_VERSION));
                console.log('[ThaMallDB] Schema updated — stale cache cleared.');
            }
        } catch(e) {}

        // Read local cache instantly
        let cached = _cacheRead();

        // If no localStorage cache, try to load from data.json via SW cache (offline-safe)
        if (!cached) {
            try {
                const res = await fetch(SEED_URL);
                if (res.ok) {
                    cached = await res.json();
                    _cacheWrite(cached);
                    console.log('[ThaMallDB] Loaded seed data from SW cache / network.');
                }
            } catch(e) {
                console.warn('[ThaMallDB] Could not load seed data:', e.message);
            }
        }

        const initialData = cached || _defaults();
        if (cached && initialData && initialData.units) {
            const defUnits = _defaults().units;
            let merged = false;
            for (let k in defUnits) {
                if (!initialData.units[k]) {
                    initialData.units[k] = defUnits[k];
                    merged = true;
                }
            }
            if (merged) _cacheWrite(initialData);
        }
        _lastSource = cached ? 'cache' : 'default';

        // Notify client pages so they render immediately with available data
        setTimeout(() => {
            _notify('loaded', { source: _lastSource, data: initialData });
        }, 0);

        // Background sync (only if likely online — non-blocking)
        _backgroundSync();

        return { data: initialData, source: _lastSource };
    }

    /**
     * Silent, non-blocking background sync with the Netlify Blobs Cloud Storage.
     * Only runs when online. Falls back gracefully without throwing.
     */
    async function _backgroundSync() {
        if (_syncInProgress) return;

        // Rate limit: once every 10 seconds
        if (Date.now() - _lastSyncTime < 10000) return;

        _syncInProgress = true;

        try {
            const realOnline = await ping();
            _connChecked = true;
            _notify('networkStatus', { online: realOnline, checked: true });

            if (!realOnline) {
                // Offline: serve from localStorage (already done in load())
                console.log('[ThaMallDB] Offline — using local cache.');
                return;
            }

            let newData = null;
            let newSource = 'api';

            // Try the API endpoint first
            try {
                const res = await fetch(`${API_URL}?_t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`API ${res.status}`);
                newData = await res.json();
                newSource = 'api';
            } catch (e) {
                // Fall back to data.json seed file
                try {
                    const res = await fetch(`${SEED_URL}?_t=${Date.now()}`, { cache: 'no-store' });
                    if (!res.ok) throw new Error(`Seed ${res.status}`);
                    newData = await res.json();
                    newSource = 'seed';
                } catch (se) {
                    console.log('[ThaMallDB] BG sync fetch failed (both API and seed):', se.message);
                }
            }

            if (newData) {
                const localData = _cacheRead();
                const oldSavedAt = localData ? (localData._savedAt || '') : '';
                const newSavedAt = newData._savedAt || '';

                _lastSource = newSource;
                _lastSyncTime = Date.now();

                if (newSavedAt !== oldSavedAt) {
                    _cacheWrite(newData);
                    console.log(`[ThaMallDB] Remote update received (${newSource})`);
                    _notify('loaded', { source: newSource, data: newData });
                    window.dispatchEvent(new CustomEvent('thaMallRemoteUpdate'));
                } else {
                    _notify('networkStatus', { online: true, checked: true });
                }
            }
        } catch (err) {
            console.error('[ThaMallDB] Background sync error:', err);
        } finally {
            _syncInProgress = false;
        }
    }

    // ── SAVE ────────────────────────────────────────────────────────────────
    /**
     * Save catalog data (admin only).
     * Always updates localStorage. Also POSTs to API when online.
     * Returns Promise<{ ok: boolean, source: 'api'|'local', error?: string }>
     */
    async function save(data) {
        data._savedAt = new Date().toISOString();
        data._version = (data._version || 0) + 1;

        // Always write to local cache
        _cacheWrite(data);

        const realOnline = await ping();
        if (!realOnline) {
            _lastSource = 'cache';
            _notify('saveError', { error: 'offline' });
            return { ok: false, source: 'local', error: 'offline' };
        }

        try {
            const res = await fetch(API_URL, {
                method:  'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key':  _getAdminPassword()
                },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                const msg = await res.text();
                throw new Error(`HTTP ${res.status}: ${msg}`);
            }

            _lastSource = 'api';
            _notify('saved', { source: 'api', data });

            // Tell SW to broadcast to all open tabs
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CACHE_UPDATED' });
            }

            return { ok: true, source: 'api' };

        } catch(err) {
            console.error('[ThaMallDB] Cloud save failed:', err.message);
            _lastSource = 'cache';
            let userError = err.message;
            if (err.message === 'Load failed' || err.name === 'TypeError') {
                userError = 'فشل الاتصال بالخادم (تأكد من تشغيل netlify dev أو الاتصال بالإنترنت)';
            }
            _notify('saveError', { error: userError });
            return { ok: false, source: 'local', error: userError };
        }
    }

    // ── STATUS HELPERS ──────────────────────────────────────────────────────
    function isOnline()     { return _isOnline; }
    function getSyncStatus() { return { online: _isOnline, checked: _connChecked, source: _lastSource }; }
    function getCacheTime() { return localStorage.getItem(TS_KEY); }

    /**
     * Actively verify connection to the server
     */
    async function ping() {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

        try {
            // Fetch the API endpoint with a unique ping parameter using GET
            // The Service Worker will ignore this because of url.searchParams.has('ping')
            const res = await fetch(`${API_URL}?ping=${Date.now()}-${Math.random()}`, { 
                method: 'GET', 
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(id);
            // Any response code under 500 (e.g. 200, 304, 404 fallback) means the server is running and accessible
            const online = res.status < 500;
            _isOnline = online;
            _connChecked = true;
            return online;
        } catch {
            clearTimeout(id);
            _isOnline = false;
            _connChecked = true;
            return false;
        }
    }

    // ── DEFAULT DATA ────────────────────────────────────────────────────────
    function _defaults() {
        return {
            plans: [
                { id: 'p1', name: 'نظام قسط ٣ سنوات', years: 3, months: 1, down: 20, downType: 'percent', periodicAmount: 0, periodicType: 'percent', periodicInterval: 12 },
                { id: 'p2', name: 'نظام قسط ٤ سنوات', years: 4, months: 1, down: 25, downType: 'percent', periodicAmount: 6, periodicType: 'percent', periodicInterval: 12 }
            ],
            categories: ['محل', 'مكتب'],
            settings: { showUnitStatus: true },
            positions: [
                'بدروم / خارجي', 'بدروم / داخلي',
                'ارضي / خارجي', 'ارضي / داخلي',
                'اول علوي / خارجي', 'اول علوي / داخلي',
                'ثاني علوي / خارجي', 'ثاني علوي / داخلي',
                'ثالث علوي / خارجي', 'ثالث علوي / داخلي'
            ],
            units: {
                'G-6':  { code: 'G-6',  area: 99.02, position: 'ارضي / خارجي',      categories: ['محل'],   status: 'متاح' },
                'G-8':  { code: 'G-8',  area: 54.61, position: 'ارضي / داخلي',      categories: ['محل'],   status: 'متاح' },
                'G-10': { code: 'G-10', area: 35.78, position: 'ارضي / داخلي',      categories: ['محل'],   status: 'متاح' },
                'G-14': { code: 'G-14', area: 47.97, position: 'ارضي / خارجي',      categories: ['محل'],   status: 'متاح' },
                'G-16': { code: 'G-16', area: 49.01, position: 'ارضي / داخلي',      categories: ['محل'],   status: 'متاح' },
                'G-17': { code: 'G-17', area: 75.91, position: 'ارضي / داخلي',      categories: ['محل'],   status: 'متاح' },
                'G-13': { code: 'G-13', area: 53.03, position: 'ارضي / جانبي',      categories: ['محل'],   status: 'متاح' },
                'G-11A':{ code: 'G-11A',area: 38.81, position: 'ارضي / داخلي',      categories: ['محل'],   status: 'متاح' },
                'G-11B':{ code: 'G-11B',area: 35.95, position: 'ارضي / داخلي',      categories: ['محل'],   status: 'متاح' },
                'F-1':  { code: 'F-1',  area: 92.1,  position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-2':  { code: 'F-2',  area: 76.21, position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-3':  { code: 'F-3',  area: 60.95, position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-5':  { code: 'F-5',  area: 45.97, position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-6':  { code: 'F-6',  area: 57.82, position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-10': { code: 'F-10', area: 35.92, position: 'اول علوي / داخلي',  categories: ['محل'],   status: 'متاح' },
                'F-11': { code: 'F-11', area: 48.8,  position: 'اول علوي / داخلي',  categories: ['محل'],   status: 'متاح' },
                'F-12': { code: 'F-12', area: 29.89, position: 'اول علوي / داخلي',  categories: ['محل'],   status: 'متاح' },
                'F-15': { code: 'F-15', area: 38.72, position: 'اول علوي / داخلي',  categories: ['محل'],   status: 'متاح' },
                'F-16': { code: 'F-16', area: 51.35, position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-17': { code: 'F-17', area: 36.19, position: 'اول علوي / خارجي',  categories: ['محل'],   status: 'متاح' },
                'F-18': { code: 'F-18', area: 52.96, position: 'اول علوي / داخلي',  categories: ['محل'],   status: 'متاح' },
                'S-6':  { code: 'S-6',  area: 71.17, position: 'ثاني علوي / خارجي', categories: ['مكتب'],  status: 'متاح' },
                'S-7':  { code: 'S-7',  area: 98.82, position: 'ثاني علوي / خارجي', categories: ['مكتب'],  status: 'متاح' },
                'S-8':  { code: 'S-8',  area: 90.15, position: 'ثاني علوي / داخلي', categories: ['مكتب'],  status: 'متاح' },
                'S-9':  { code: 'S-9',  area: 57.09, position: 'ثاني علوي / داخلي', categories: ['مكتب'],  status: 'متاح' }
            },
            prices: {
                'بدروم / خارجي':     { p1: 0,      p2: 0,      p3: 110000 },
                'بدروم / داخلي':     { p1: 0,      p2: 0,      p3: 110000 },
                'ارضي / خارجي':      { p1: 115000, p2: 120000, p3: 125000 },
                'ارضي / داخلي':      { p1: 100000, p2: 105000, p3: 125000 },
                'اول علوي / خارجي':  { p1: 65000,  p2: 70000,  p3: 125000 },
                'اول علوي / داخلي':  { p1: 55000,  p2: 60000,  p3: 125000 },
                'ثاني علوي / خارجي': { p1: 50000,  p2: 55000,  p3: 120000 },
                'ثاني علوي / داخلي': { p1: 45000,  p2: 50000,  p3: 120000 },
                'ثالث علوي / خارجي': { p1: 0,      p2: 0,      p3: 115000 },
                'ثالث علوي / داخلي': { p1: 0,      p2: 0,      p3: 115000 }
            },
            _savedAt: null, _version: 1
        };
    }

    // ── REGISTER SERVICE WORKER ─────────────────────────────────────────────
    function registerSW() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => {
                console.log('[SW] Registered:', reg.scope);

                // Check for updates every 10 minutes
                setInterval(() => { reg.update(); }, 1000 * 60 * 10);

                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                // New update available! 
                                // We use skipWaiting() in sw.js, so it will activate soon.
                                console.log('[SW] New version installed. Activating...');
                            }
                        }
                    };
                };
            })
            .catch(err => console.warn('[SW] Registration failed:', err));

        // Reload the page when a new Service Worker takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            console.log('[SW] Controller changed. Reloading page...');
            window.location.reload();
        });

        // Listen for data updates from SW (another tab saved)
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data && e.data.type === 'DATA_UPDATED') {
                window.dispatchEvent(new CustomEvent('thaMallRemoteUpdate'));
            }
        });
    }

    // Auto-register SW when this script loads (non-admin pages)
    if (document.currentScript) {
        // Defer until DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', registerSW);
        } else {
            registerSW();
        }
    }

    return { 
        load, save, isOnline, getSyncStatus, getCacheTime, ping,
        LOCAL_KEY, on: (ev, cb) => {
            if (window._listeners && window._listeners[ev]) window._listeners[ev].push(cb);
        },
        
        sortUnits: (codeA, codeB) => {
            if(!codeA) return -1;
            if(!codeB) return 1;
            const aStr = typeof codeA === 'string' ? codeA : codeA.code || codeA.id || codeA.unitCode || '';
            const bStr = typeof codeB === 'string' ? codeB : codeB.code || codeB.id || codeB.unitCode || '';
            
            const parseCode = (code) => {
                const parts = code.split('-');
                let floorWeight = 6;
                const prefix = parts[0] ? parts[0].toUpperCase() : '';
                if (prefix === 'B') floorWeight = 1;
                else if (prefix === 'G') floorWeight = 2;
                else if (prefix === 'F' || prefix === '1') floorWeight = 3;
                else if (prefix === 'S' || prefix === '2') floorWeight = 4;
                else if (prefix === 'T' || prefix === '3') floorWeight = 5;
                
                let num = 0;
                let suffix = '';
                if (parts.length > 1) {
                    const numMatch = parts[1].match(/\d+/);
                    num = numMatch ? parseInt(numMatch[0]) : 0;
                    suffix = parts[1].replace(/\d+/, '');
                }
                return { floorWeight, prefix, num, suffix };
            };

            const pA = parseCode(aStr);
            const pB = parseCode(bStr);

            if (pA.floorWeight !== pB.floorWeight) return pA.floorWeight - pB.floorWeight;
            if (pA.prefix !== pB.prefix) return pA.prefix.localeCompare(pB.prefix);
            if (pA.num !== pB.num) return pA.num - pB.num;
            return pA.suffix.localeCompare(pB.suffix);
        }
    };
})();

window.ThaMallDB = ThaMallDB;
