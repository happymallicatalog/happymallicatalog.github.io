/**
 * floor-page.js  — shared logic for ALL floor pages (G, 1st, B, 2nd, 3rd).
 * Each floor's HTML sets:
 *   <body data-floor-prefix="G-"  data-svg-path="assets/floor_plans/FloorPlan-G.svg">
 */
document.addEventListener('DOMContentLoaded', async () => {
    const CACHE_KEY = (typeof ThaMallDB !== 'undefined') ? ThaMallDB.LOCAL_KEY : 'tha_mall_admin_data';

    // Read floor prefix from body attribute
    const FLOOR_PREFIX = document.body.dataset.floorPrefix || 'G-';

    // UI refs
    const tableBody        = document.getElementById('table-body');
    const categoriesFilter = document.getElementById('categories-filter');
    const detailsPanel     = document.getElementById('selected-unit-details');
    const detailId         = document.getElementById('detail-id');
    const detailArea       = document.getElementById('detail-area');
    const detailCategories = document.getElementById('detail-categories');
    const detailPosition   = document.getElementById('detail-position');
    const plansModal       = document.getElementById('plans-modal');
    const modalUnitId      = document.getElementById('modal-unit-id');
    const modalPlansGrid   = document.getElementById('modal-plans-grid');
    const showPriceBtn     = document.getElementById('show-price-trigger');

    // State
    let catalogData    = { units: {}, prices: {}, plans: [], categories: [] };
    let allCategories  = new Set();
    let selectedUnitId = null;
    let currentFilter  = null;
    let svgEl          = null;

    // ── BOOT ─────────────────────────────────────────────────────────────────
    async function init() {
        // SVG is already inline in HTML — just find it in the DOM
        const svgContainer = document.getElementById('svg-container');
        svgEl = svgContainer ? svgContainer.querySelector('svg') : null;

        await loadData();
        renderTable();
        renderChips();
        if (svgEl) setupSVG();
        setupModal();
        updateStatus();
        window.addEventListener('online',  updateStatus);
        window.addEventListener('offline', updateStatus);



        const mainInd = document.getElementById('online-indicator');
        if (mainInd) mainInd.addEventListener('click', () => mainInd.classList.toggle('expanded'));
        const modInd  = document.getElementById('modalStatusIndicator');
        if (modInd)  modInd.addEventListener('click',  () => modInd.classList.toggle('expanded'));

        initDragScroll(document.querySelector('.table-scroll-area'));
        initDragScroll(document.querySelector('.detail-scroll-area'));
        initDragScroll(document.getElementById('svg-container'));
        initDragScroll(document.querySelector('.modal-content'));
    }

    // ── ONLINE/OFFLINE INDICATOR ─────────────────────────────────────────────
    function updateStatus() {
        const indicator      = document.getElementById('online-indicator');
        const modalIndicator = document.getElementById('modalStatusIndicator');
        if (!indicator) return;

        let statusText = indicator.querySelector('.status-text');
        if (!statusText) {
            statusText = document.createElement('span');
            statusText.className = 'status-text';
            indicator.appendChild(statusText);
        }

        const status      = (typeof ThaMallDB !== 'undefined') ? ThaMallDB.getSyncStatus() : { online: navigator.onLine, checked: true, source: 'cache' };
        const onlineMsg   = 'اونلاين - البيانات محدثة';
        const offlineMsg  = 'اوفلاين - البيانات غير محدثة';
        const checkingMsg = 'جاري اختبار الاتصال...';

        function applyToIndicator(el, online, checked) {
            if (!el) return;
            const dot  = el.querySelector('.status-dot') || el.querySelector('.dot');
            let mText  = el.querySelector('.status-text');
            if (!mText) {
                mText = document.createElement('span');
                mText.className = 'status-text';
                el.appendChild(mText);
            }
            if (!checked) {
                el.classList.remove('online','offline');
                if (dot) dot.className = (dot.classList.contains('dot') ? 'dot' : 'status-dot');
                mText.textContent = checkingMsg;
            } else if (online) {
                el.classList.remove('offline'); el.classList.add('online');
                if (dot) dot.className = (dot.classList.contains('dot') ? 'dot online' : 'status-dot online');
                mText.textContent = onlineMsg;
            } else {
                el.classList.remove('online'); el.classList.add('offline');
                if (dot) dot.className = (dot.classList.contains('dot') ? 'dot offline' : 'status-dot offline');
                mText.textContent = offlineMsg;
            }
        }

        applyToIndicator(indicator,      status.online, status.checked);
        applyToIndicator(modalIndicator, status.online, status.checked);
    }

    // ── DRAG SCROLL ───────────────────────────────────────────────────────────
    function initDragScroll(el) {
        if (!el) return;
        let isDown = false, startX, startY, scrollLeft, scrollTop;
        const handleStart = (e) => {
            isDown = true;
            const px = e.pageX || (e.touches && e.touches[0].pageX);
            const py = e.pageY || (e.touches && e.touches[0].pageY);
            startX = px - el.offsetLeft; startY = py - el.offsetTop;
            scrollLeft = el.scrollLeft; scrollTop = el.scrollTop;
            el.style.cursor = 'grabbing'; el.style.userSelect = 'none';
        };
        const handleEnd = () => { isDown = false; el.classList.remove('dragging'); el.style.cursor = ''; el.style.userSelect = ''; };
        const handleMove = (e) => {
            if (!isDown || document.body.classList.contains('swipe-confirmed')) return;
            const px = e.pageX || (e.touches && e.touches[0].pageX);
            const py = e.pageY || (e.touches && e.touches[0].pageY);
            const x = px - el.offsetLeft, y = py - el.offsetTop;
            if (!el.classList.contains('dragging') && (Math.abs(x-startX) > 5 || Math.abs(y-startY) > 5)) el.classList.add('dragging');
            if (el.classList.contains('dragging')) { el.scrollLeft = scrollLeft - (x-startX)*2; el.scrollTop = scrollTop - (y-startY)*2; }
        };
        el.addEventListener('mousedown', handleStart);
        el.addEventListener('mousemove', (e) => { if (isDown) { e.preventDefault(); handleMove(e); } });
        el.addEventListener('mouseup', handleEnd);
        el.addEventListener('mouseleave', handleEnd);
    }

    // ── DATA ──────────────────────────────────────────────────────────────────
    async function loadData() {
        try {
            let data;
            if (typeof ThaMallDB !== 'undefined') {
                const result = await ThaMallDB.load();
                data = result.data;
                updateStatus();
            } else {
                const raw = localStorage.getItem(CACHE_KEY);
                data = raw ? JSON.parse(raw) : null;
            }
            if (!data) return;
            catalogData = data;
            allCategories.clear();

            Object.values(catalogData.units || {}).forEach(u => {
                if (u.code && u.code.startsWith(FLOOR_PREFIX)) cats(u).forEach(c => allCategories.add(c.trim()));
            });

            // Apply dynamic layout overrides based on database settings
            if (catalogData.settings) {
                let dynamicCss = '.status-indicators { display: none !important; }\n';
                if (catalogData.settings.showCategories === false) {
                    dynamicCss += '.categories-slider-section { display: none !important; }\n';
                }
                if (catalogData.settings.showTable === false) {
                    dynamicCss += '.table-container { display: none !important; }\n.units-sidebar { width: var(--details-width) !important; }\n';
                }

                let styleEl = document.getElementById('dynamic-layout-style');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'dynamic-layout-style';
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = dynamicCss;
            }

        } catch (e) { console.error('[floor-page.js] Data error', e); }
    }


    function cats(unit) {
        if (!unit || !unit.categories) return [];
        return Array.isArray(unit.categories) ? unit.categories : unit.categories.split(',').map(c => c.trim()).filter(Boolean);
    }

    // ── SVG SETUP ─────────────────────────────────────────────────────────────
    function setupSVG() {
        if (!svgEl) return;

        let defs = svgEl.querySelector('defs');
        if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg','defs'); svgEl.prepend(defs); }


        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#dfa843';

        const filters = [
            ['green-tint', '#28a745'], ['gray-tint', '#888888'], ['red-tint', '#dc3545'], ['accent-tint', accentColor]
        ];
        filters.forEach(([id, color]) => {
            if (!svgEl.getElementById(id)) {
                defs.insertAdjacentHTML('beforeend', `
                    <filter id="${id}">
                        <feFlood flood-color="${color}" flood-opacity="0.6" result="flood"></feFlood>
                        <feComposite in="flood" in2="SourceAlpha" operator="in" result="composite"></feComposite>
                        <feMerge><feMergeNode in="SourceGraphic"></feMergeNode><feMergeNode in="composite"></feMergeNode></feMerge>
                    </filter>`);
            }
        });

        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = `
            [id^="${FLOOR_PREFIX}"] { transition:opacity 0.25s ease; pointer-events:none; }
            .has-active-filters [id^="${FLOOR_PREFIX}"]:not(.filter-highlight) { opacity:0.15; }
            [id^="${FLOOR_PREFIX}"].active { opacity:1 !important; filter:url(#green-tint); }
            [id^="${FLOOR_PREFIX}"].generic-unit { filter:url(#green-tint) !important; opacity: 0.3 !important; }
            [id^="${FLOOR_PREFIX}"].generic-unit.js-hover { opacity: 0.5 !important; }
            [id^="${FLOOR_PREFIX}"].generic-unit.active, 
            [id^="${FLOOR_PREFIX}"].generic-unit.filter-highlight { opacity: 0.85 !important; }
            [id^="${FLOOR_PREFIX}"].filter-highlight { opacity:1 !important; }
        `;
        svgEl.prepend(style);

        const unitImages = {};
        const orderedUnits = [];

        svgEl.querySelectorAll(`[id^="${FLOOR_PREFIX}"]`).forEach(el => {
            const unit = catalogData.units[el.id];
            if (unit) {
                el.classList.remove('status-available','status-reserved','status-sold');
                el.classList.add('generic-unit');
            }
            orderedUnits.push(el);

            // Preload image for pixel hit testing
            const hrefAttr = el.getAttribute('href') || el.getAttribute('xlink:href');
            if(hrefAttr && hrefAttr.startsWith('#')) {
                const imgEl = svgEl.querySelector(hrefAttr);
                if(imgEl) {
                    const imgSrc = imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href');
                    if(imgSrc && imgSrc.startsWith('data:image')) {
                        const img = new Image();
                        img.src = imgSrc;
                        const x = parseFloat(el.getAttribute('x') || 0);
                        const y = parseFloat(el.getAttribute('y') || 0);
                        const w = parseFloat(imgEl.getAttribute('width') || 0);
                        const h = parseFloat(imgEl.getAttribute('height') || 0);
                        unitImages[el.id] = { img, x, y, w, h };
                    }
                }
            }
        });

        orderedUnits.reverse(); // For z-index top-to-bottom testing

        const hitCanvas = document.createElement('canvas');
        hitCanvas.width = 1;
        hitCanvas.height = 1;
        const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });
        let currentHoveredId = null;

        function getUnitAtMouse(e) {
            const pt = svgEl.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svgEl.getScreenCTM().inverse());
            
            for(let el of orderedUnits) {
                const data = unitImages[el.id];
                if(!data || !data.img.complete) continue;
                
                if(svgP.x >= data.x && svgP.x <= data.x + data.w &&
                   svgP.y >= data.y && svgP.y <= data.y + data.h) {
                    
                    hitCtx.clearRect(0, 0, 1, 1);
                    hitCtx.drawImage(data.img, data.x - svgP.x, data.y - svgP.y, data.w, data.h);
                    
                    if(hitCtx.getImageData(0, 0, 1, 1).data[3] > 0) {
                        return el.id;
                    }
                }
            }
            return null;
        }

        svgEl.addEventListener('mousemove', e => {
            const hoveredId = getUnitAtMouse(e);
            if(hoveredId !== currentHoveredId) {
                if(currentHoveredId) {
                    const oldEl = document.getElementById(currentHoveredId);
                    if(oldEl) oldEl.classList.remove('js-hover');
                }
                if(hoveredId) {
                    const newEl = document.getElementById(hoveredId);
                    if(newEl) newEl.classList.add('js-hover');
                }
                currentHoveredId = hoveredId;
            }
            svgEl.style.cursor = currentHoveredId ? 'pointer' : 'default';
        });

        svgEl.addEventListener('click', e => {
            const clickedId = getUnitAtMouse(e);
            if(clickedId) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                onUnitClick(clickedId);
            } else {
                resetAll();
            }
        });
    }

    // ── TABLE ─────────────────────────────────────────────────────────────────
    function renderTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        
        const statusTh = document.querySelector('#units-table th:nth-child(3)');
        if (statusTh) statusTh.remove();

        Object.values(catalogData.units || {})
            .filter(u => u.code && u.code.startsWith(FLOOR_PREFIX))
            .sort(window.sortUnitsCode)
            .forEach(unit => {
                const tr = document.createElement('tr');
                tr.id = `row-${unit.code}`;
                tr.innerHTML = `<td style="font-weight:600">${unit.code}</td>
                    <td>${unit.area} م²</td>`;
                tr.addEventListener('click', () => onRowClick(unit.code));
                tableBody.appendChild(tr);
            });
    }

    // ── CHIPS ────────────────────────────────────────────────────────────────
    function renderChips() {
        if (!categoriesFilter) return;
        categoriesFilter.innerHTML = '';
        const wrapper = document.createElement('div'); wrapper.className = 'categories-wrapper';
        const scroll  = document.createElement('div'); scroll.className  = 'categories-scroll';
        wrapper.appendChild(scroll);
        Array.from(allCategories).sort().forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-chip'; btn.textContent = cat; btn.dataset.category = cat;
            btn.addEventListener('click', () => onCatClick(cat, btn));
            scroll.appendChild(btn);
        });
        categoriesFilter.appendChild(wrapper);
        initDragScroll(scroll);
    }

    // ── INTERACTION HANDLERS ──────────────────────────────────────────────────
    function onUnitClick(id) {
        if (!catalogData.units[id]) return;
        resetAll(false); selectedUnitId = id;
        svgHighlight(id, 'active'); rowHighlight(id, true);
        showDetails(catalogData.units[id]); markChips(cats(catalogData.units[id]));
    }
    function onRowClick(id) {
        if (!catalogData.units[id]) return;
        resetAll(false); selectedUnitId = id;
        svgHighlight(id, 'active'); rowHighlight(id, false);
        showDetails(catalogData.units[id]); markChips(cats(catalogData.units[id]));
    }
    function onCatClick(cat) {
        currentFilter = (currentFilter === cat.trim()) ? null : cat.trim();
        selectedUnitId = null; hideDetails();
        if (svgEl) svgEl.querySelectorAll(`[id^="${FLOOR_PREFIX}"]`).forEach(el => el.classList.remove('active'));
        document.querySelectorAll('#units-table tbody tr').forEach(r => r.classList.remove('selected'));
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('unit-active'));
        applyFilters();
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    function svgHighlight(id, cls) { if (!svgEl) return; const el = svgEl.getElementById(id); if (el) el.classList.add(cls); }
    function rowHighlight(id, scroll) {
        const row = document.getElementById(`row-${id}`); if (!row) return;
        row.classList.add('selected'); if (scroll) row.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
    function showDetails(unit) {
        const ph = detailsPanel.querySelector('.detail-placeholder');
        const ct = detailsPanel.querySelector('.detail-content');
        if (ph) ph.style.display = 'none'; if (ct) ct.classList.remove('hidden');
        detailId.textContent         = unit.code;
        detailArea.textContent       = unit.area + ' م²';
        
        if (detailCategories) {
            detailCategories.innerHTML = '';
            const categories = cats(unit);
            if (categories.length > 0) {
                categories.forEach(c => {
                    const span = document.createElement('span');
                    span.className = 'catalog-tag category-tag';
                    span.textContent = c;
                    detailCategories.appendChild(span);
                });
            }
        }
        
        if (detailPosition) {
            detailPosition.innerHTML = '';
            if (unit.position && unit.position.trim() !== '') {
                const span = document.createElement('span');
                span.className = 'catalog-tag position-tag';
                span.textContent = unit.position;
                detailPosition.appendChild(span);
            }
        }
        

    }
    function hideDetails() {
        const ph = detailsPanel.querySelector('.detail-placeholder');
        const ct = detailsPanel.querySelector('.detail-content');
        if (ph) ph.style.display = ''; if (ct) ct.classList.add('hidden');
    }
    function markChips(activeCats) {
        const trimmed = activeCats.map(c => c.trim());
        document.querySelectorAll('.category-chip').forEach(chip => chip.classList.toggle('unit-active', trimmed.includes((chip.dataset.category||'').trim())));
    }

    function applyFilters() {
        if (svgEl) {
            svgEl.classList.remove('has-cat-highlight','has-active-filters');
            svgEl.querySelectorAll(`[id^="${FLOOR_PREFIX}"]`).forEach(el => {
                el.classList.remove('cat-highlight','status-highlight','filter-highlight');
                if (!selectedUnitId) el.classList.remove('active');
            });
        }
        document.querySelectorAll('#units-table tbody tr').forEach(row => {
            row.classList.remove('category-row','status-row-highlight','filter-row-highlight');
            if (!selectedUnitId) row.classList.remove('selected');
        });
        document.querySelectorAll('.category-chip').forEach(chip => {
            chip.classList.toggle('active', !!(currentFilter && (chip.dataset.category||'').trim() === currentFilter));
            if (!selectedUnitId) chip.classList.remove('unit-active');
        });
        if (!currentFilter) return;
        if (svgEl) svgEl.classList.add('has-active-filters');
        if (svgEl) svgEl.querySelectorAll(`[id^="${FLOOR_PREFIX}"]`).forEach(el => {
            const u = catalogData.units[el.id]; if (!u) return;
            const mc = cats(u).some(c => c.trim() === currentFilter);
            if (mc) el.classList.add('filter-highlight');
        });
        document.querySelectorAll('#units-table tbody tr').forEach(row => {
            const unitId = row.id.replace('row-','').trim();
            const u = catalogData.units[unitId]; if (!u) return;
            const mc = cats(u).some(c => c.trim() === currentFilter);
            if (mc) row.classList.add('filter-row-highlight');
        });
    }

    function resetAll(resetDetails = true) {
        selectedUnitId = null; currentFilter = null;
        if (svgEl) svgEl.querySelectorAll(`[id^="${FLOOR_PREFIX}"]`).forEach(el => el.classList.remove('active','cat-highlight','status-highlight','filter-highlight'));
        document.querySelectorAll('#units-table tbody tr').forEach(r => r.classList.remove('selected','category-row','status-row-highlight','filter-row-highlight'));
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active','unit-active'));
        applyFilters();
        if (resetDetails) hideDetails();
    }

    // ── MODAL ─────────────────────────────────────────────────────────────────
    function setupModal() {
        if (showPriceBtn) showPriceBtn.addEventListener('click', openModal);
        const closeBtn = document.getElementById('modal-close-trigger');
        if (closeBtn) closeBtn.addEventListener('click', () => plansModal.classList.remove('active'));
        if (plansModal) plansModal.addEventListener('click', e => { if (e.target === plansModal) plansModal.classList.remove('active'); });
    }

    function openModal() {
        if (!selectedUnitId) return;
        const unit = catalogData.units[selectedUnitId]; if (!unit) return;
        modalUnitId.textContent = unit.code + ' (' + unit.area + ' م²)';
        let gridHTML = `<div class="plans-table-wrapper" style="width:100%;margin-top:clamp(10px,2vw,20px);border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.05);background:white;">
            <table style="width:100%;border-collapse:collapse;text-align:center;background:white;">
                <thead><tr>
                    <th style="padding:clamp(5px,1vw,15px);border:1px solid #eee;background:#f8f9fa;color:var(--text-muted);font-weight:600;font-size:clamp(0.6rem,1.2vw,0.95rem);">الخطة</th>
                    <th style="padding:clamp(5px,1vw,15px);border:1px solid #eee;background:#f8f9fa;color:var(--text-muted);font-weight:600;font-size:clamp(0.6rem,1.2vw,0.95rem);">سعر المتر</th>
                    <th style="padding:clamp(5px,1vw,15px);border:1px solid #eee;background:#f8f9fa;color:var(--text-muted);font-weight:600;font-size:clamp(0.6rem,1.2vw,0.95rem);">إجمالي السعر</th>
<th style="padding:clamp(5px,1vw,15px);border:1px solid #eee;background:#f8f9fa;color:var(--text-muted);font-weight:600;font-size:clamp(0.6rem,1.2vw,0.95rem);">قيمة المقدم</th>
                    
                    <th style="padding:clamp(5px,1vw,15px);border:1px solid #eee;background:#f8f9fa;color:var(--text-muted);font-weight:600;font-size:clamp(0.6rem,1.2vw,0.95rem);">القسط الربع سنوي</th>
                </tr></thead><tbody>`;
        (catalogData.plans || []).forEach(plan => {
            const ppm = (catalogData.prices[unit.position]?.[plan.id]) || 0;
            const total = ppm * unit.area, down = total * (plan.down/100), rem = total - down;
            const mo = rem / (plan.years * 4);
            gridHTML += `<tr onmouseover="this.style.backgroundColor='#f9faff'" onmouseout="this.style.backgroundColor='transparent'">
                <td style="padding:clamp(5px,1vw,15px);border:1px solid #eee;text-align:right;">
                    <div style="font-weight:700;color:var(--text-dark);font-size:clamp(0.7rem,1.4vw,1rem);">${plan.name}</div>
                    <div style="display:inline-block;padding:2px 6px;background:color-mix(in srgb,var(--accent-color) 10%,transparent);color:var(--accent-color);border-radius:20px;font-size:clamp(0.55rem,1vw,0.8rem);font-weight:600;">${plan.years} سنوات - ${plan.down}% مقدم</div>
                </td>
                <td style="padding:clamp(5px,1vw,15px);border:1px solid #eee;color:var(--text-dark);font-weight:600;font-size:clamp(0.65rem,1.3vw,0.95rem);">EGP ${ppm.toLocaleString()}</td>
                <td style="padding:clamp(5px,1vw,15px);border:1px solid #eee;font-weight:700;color:var(--accent-color);font-size:clamp(0.65rem,1.3vw,0.95rem);">EGP ${Math.round(total).toLocaleString()}</td>
<td style="padding:clamp(5px,1vw,15px);border:1px solid #eee;color:var(--text-dark);font-weight:600;font-size:clamp(0.65rem,1.3vw,0.95rem);">EGP ${Math.round(down).toLocaleString()}</td>
                
                <td style="padding:clamp(5px,1vw,15px);border:1px solid #eee;text-align:center;vertical-align:middle;">
                    <div style="display:inline-flex;flex-direction:column;align-items:center;background:var(--dark-bg);padding:clamp(4px,1vw,8px) clamp(8px,1.5vw,16px);border-radius:8px;">
                        <span style="color:white;font-weight:700;font-size:clamp(0.65rem,1.3vw,1rem);">EGP ${Math.round(mo).toLocaleString()}</span>
                    </div>
                </td>
            </tr>`;
        });
        gridHTML += '</tbody></table></div>';
        modalPlansGrid.innerHTML = gridHTML;
        plansModal.classList.add('active');
    }

    // ── LIVE / REMOTE SYNC ────────────────────────────────────────────────────
    window.addEventListener('storage', async e => {
        if (e.key === CACHE_KEY + '_ping' || e.key === CACHE_KEY) {
            await loadData(); renderTable(); renderChips();
            if (svgEl) setupSVG(); resetAll();
        }
    });
    window.addEventListener('thaMallRemoteUpdate', async () => {
        await loadData(); renderTable(); renderChips();
        if (svgEl) setupSVG(); resetAll(false);
    });
    window.addEventListener('thaMallDataEvent', e => {
        if (e.detail.event === 'networkStatus' || e.detail.event === 'loaded') updateStatus();
    });
    setInterval(() => {
        if (!document.hidden && typeof ThaMallDB !== 'undefined') ThaMallDB.ping().then(() => updateStatus());
    }, 30000);

    await init();
});
