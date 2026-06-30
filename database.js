/**
 * TheMall iCatalog — Global Data Sync Layer v3 (GitHub API)
 * ========================================================
 * Single source of truth. Used by admin, floor plans, and payment plans.
 *
 * DATA SOURCES:
 *  Online  → /data.json (Direct static fetch)
 *  Offline → localStorage cache
 *
 * SAVE (admin only, online):
 *  Uses GitHub API to directly commit changes to data.json
 *  Requires GitHub PAT and Repo Name in localStorage ('admin_profile')
 */

const ThaMallDB = (() => {
    const SEED_URL   = '/data.json';
    const LOCAL_KEY  = 'tha_mall_admin_data';
    const TS_KEY     = 'tha_mall_data_ts';
    const DATA_SCHEMA_VERSION = 2; 
    const SCHEMA_KEY = 'tha_mall_schema_v';

    let _lastSource = 'cache';
    let _isOnline   = null;
    let _connChecked = false;
    let _syncInProgress = false;
    let _lastSyncTime   = 0;

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

    function _cacheWrite(data) {
        try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
            localStorage.setItem(TS_KEY, data._savedAt || new Date().toISOString());
        } catch(e) { }
    }

    function _cacheRead() {
        try {
            const raw = localStorage.getItem(LOCAL_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
    }

    function _getAdminProfile() {
        try {
            return JSON.parse(localStorage.getItem('admin_profile') || '{}');
        } catch { return {}; }
    }

    function _notify(eventName, detail) {
        window.dispatchEvent(new CustomEvent('thaMallDataEvent', { detail: { event: eventName, ...detail } }));
    }

    async function load() {
        try {
            const storedSchemaV = parseInt(localStorage.getItem(SCHEMA_KEY) || '0', 10);
            if (storedSchemaV < DATA_SCHEMA_VERSION) {
                localStorage.removeItem(LOCAL_KEY);
                localStorage.removeItem(TS_KEY);
                localStorage.setItem(SCHEMA_KEY, String(DATA_SCHEMA_VERSION));
            }
        } catch(e) {}

        let cached = _cacheRead();

        if (!cached) {
            try {
                const res = await fetch(SEED_URL + '?_t=' + Date.now(), { cache: 'no-store' });
                if (res.ok) {
                    cached = await res.json();
                    _cacheWrite(cached);
                }
            } catch(e) {}
        }

        const initialData = cached || _defaults();
        _lastSource = cached ? 'cache' : 'default';

        setTimeout(() => {
            _notify('loaded', { source: _lastSource, data: initialData });
        }, 0);

        _backgroundSync();

        return { data: initialData, source: _lastSource };
    }

    async function _backgroundSync() {
        if (_syncInProgress) return;
        if (Date.now() - _lastSyncTime < 10000) return;
        _syncInProgress = true;

        try {
            const realOnline = await ping();
            _connChecked = true;
            _notify('networkStatus', { online: realOnline, checked: true });

            if (!realOnline) return;

            let newData = null;
            let newSource = 'seed';

            try {
                const res = await fetch(`${SEED_URL}?_t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`Seed ${res.status}`);
                newData = await res.json();
            } catch (se) {}

            if (newData) {
                const localData = _cacheRead();
                const oldSavedAt = localData ? (localData._savedAt || '') : '';
                const newSavedAt = newData._savedAt || '';

                _lastSource = newSource;
                _lastSyncTime = Date.now();

                if (newSavedAt !== oldSavedAt) {
                    _cacheWrite(newData);
                    _notify('loaded', { source: newSource, data: newData });
                    window.dispatchEvent(new CustomEvent('thaMallRemoteUpdate'));
                } else {
                    _notify('networkStatus', { online: true, checked: true });
                }
            }
        } catch (err) {} finally {
            _syncInProgress = false;
        }
    }

    async function save(data) {
        data._savedAt = new Date().toISOString();
        data._version = (data._version || 0) + 1;
        _cacheWrite(data);

        const realOnline = await ping();
        if (!realOnline) {
            _lastSource = 'cache';
            _notify('saveError', { error: 'offline' });
            return { ok: false, source: 'local', error: 'offline' };
        }

        const profile = _getAdminProfile();
        if (!profile.repo || !profile.token) {
            let err = 'بيانات GitHub غير مكتملة. يرجى إعدادها من صفحة الحساب.';
            _notify('saveError', { error: err });
            return { ok: false, source: 'local', error: err };
        }

        try {
            const url = `https://api.github.com/repos/${profile.repo}/contents/data.json`;
            
            // 1. Get SHA of the file
            const resGet = await fetch(url, { headers: { 'Authorization': `Bearer ${profile.token}`, 'Accept': 'application/vnd.github.v3+json' } });
            if (!resGet.ok && resGet.status !== 404) throw new Error('فشل قراءة الملف من GitHub');
            
            let sha = undefined;
            if (resGet.ok) {
                const fileData = await resGet.json();
                sha = fileData.sha;
            }

            // 2. Encode to Base64 (supporting Arabic)
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

            // 3. Put new content
            const resPut = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${profile.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'تحديث بيانات الكتالوج من لوحة التحكم',
                    content: content,
                    sha: sha
                })
            });

            if (!resPut.ok) {
                const msg = await resPut.json();
                throw new Error(msg.message || 'فشل الحفظ');
            }

            _lastSource = 'api';
            _notify('saved', { source: 'api', data });

            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CACHE_UPDATED' });
            }

            return { ok: true, source: 'api' };

        } catch(err) {
            console.error('[ThaMallDB] GitHub save failed:', err.message);
            _lastSource = 'cache';
            let userError = err.message;
            if (err.message.includes('Bad credentials')) userError = 'رمز GitHub (Token) غير صحيح.';
            if (err.message.includes('Not Found')) userError = 'اسم المستودع (Repo) غير صحيح أو لا تملك صلاحية الوصول.';
            _notify('saveError', { error: userError });
            return { ok: false, source: 'local', error: userError };
        }
    }

    function isOnline()     { return _isOnline; }
    function getSyncStatus() { return { online: _isOnline, checked: _connChecked, source: _lastSource }; }
    function getCacheTime() { return localStorage.getItem(TS_KEY); }

    async function ping() {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2500);
        try {
            const res = await fetch(`${SEED_URL}?ping=${Date.now()}-${Math.random()}`, { 
                method: 'GET', 
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(id);
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

    function _defaults() {
        return {
            plans: [], categories: [],
            positions: [ "بدروم / خارجي", "بدروم / داخلي", "ارضي / خارجي", "ارضي / داخلي", "اول علوي / خارجي", "اول علوي / داخلي", "ثاني علوي / خارجي", "ثاني علوي / داخلي", "ثالث علوي / خارجي", "ثالث علوي / داخلي" ],
            units: {}, prices: {},
            _savedAt: null, _version: 1
        };
    }

    function registerSW() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => {
                setInterval(() => { reg.update(); }, 1000 * 60 * 10);
            })
            .catch(err => {});
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data && e.data.type === 'DATA_UPDATED') {
                window.dispatchEvent(new CustomEvent('thaMallRemoteUpdate'));
            }
        });
    }

    if (document.currentScript) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', registerSW);
        } else {
            registerSW();
        }
    }

    return { 
        load, save, isOnline, getSyncStatus, getCacheTime, ping, LOCAL_KEY,
        on: (ev, cb) => { if (window._listeners && window._listeners[ev]) window._listeners[ev].push(cb); },
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
