document.addEventListener('DOMContentLoaded', async () => {
    const CACHE_KEY = ThaMallDB ? ThaMallDB.LOCAL_KEY : 'tha_mall_admin_data';

    // UI refs
    const svgContainer     = document.getElementById('svg-container');
    const tableBody        = document.getElementById('table-body');
    const categoriesFilter = document.getElementById('categories-filter');
    const detailsPanel     = document.getElementById('selected-unit-details');
    const detailId         = document.getElementById('detail-id');
    const detailArea       = document.getElementById('detail-area');
    const detailCategories = document.getElementById('detail-categories');
    const detailStatus     = document.getElementById('detail-status');
    const plansModal       = document.getElementById('plans-modal');
    const modalUnitId      = document.getElementById('modal-unit-id');
    const modalPlansGrid   = document.getElementById('modal-plans-grid');
    const showPriceBtn     = document.getElementById('show-price-trigger');

    // State
    let catalogData    = { units: {}, prices: {}, plans: [], categories: [] };
    let allCategories  = new Set();
    let selectedUnitId = null;
    let currentFilter  = null;

    // The SVG is embedded inline in the HTML — find it directly in the DOM
    const svgEl = svgContainer ? svgContainer.querySelector('svg') : null;

    // ── BOOT ─────────────────────────────────────────────────────────────────
    async function init() {
        await loadData();   // async: fetches from cloud or cache
        renderTable();
        renderChips();
        setupSVG();
        setupModal();
        updateStatus();
        window.addEventListener('online',  updateStatus);
        window.addEventListener('offline', updateStatus);

        // Wire status indicators click listeners
        document.querySelectorAll('.status-indicator').forEach(indicator => {
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                const status = indicator.dataset.status;
                onStatusIndicatorClick(status, indicator);
            });
        });

        // Add click listeners for expansion
        const mainInd = document.getElementById('online-indicator');
        if (mainInd) {
            mainInd.addEventListener('click', () => mainInd.classList.toggle('expanded'));
        }
        const modInd = document.getElementById('modalStatusIndicator');
        if (modInd) {
            modInd.addEventListener('click', () => modInd.classList.toggle('expanded'));
        }

        // Activate mouse drag scrolling for all scrollable containers
        initDragScroll(document.querySelector('.table-scroll-area'));
        initDragScroll(document.querySelector('.detail-scroll-area'));
        initDragScroll(document.getElementById('svg-container'));
        initDragScroll(document.querySelector('.modal-content'));
    }

    // ── ONLINE / OFFLINE INDICATOR ────────────────────────────────────────────
    function updateStatus() {
        const indicator = document.getElementById('online-indicator');
        const modalIndicator = document.getElementById('modalStatusIndicator');
        if (!indicator) return;
        
        let statusText = indicator.querySelector('.status-text');
        if (!statusText) {
            statusText = document.createElement('span');
            statusText.className = 'status-text';
            indicator.appendChild(statusText);
        }

        const status = (typeof ThaMallDB !== 'undefined') ? ThaMallDB.getSyncStatus() : { online: navigator.onLine, checked: true, source: 'cache' };
        
        const onlineMsg = "اونلاين - البيانات محدثة";
        const offlineMsg = "اوفلاين - البيانات غير محدثة";
        const checkingMsg = "جاري اختبار الاتصال...";

        if (!status.checked) {
            indicator.classList.remove('online', 'offline');
            statusText.textContent = checkingMsg;
            
            if (modalIndicator) {
                modalIndicator.classList.remove('online', 'offline');
                const dot = modalIndicator.querySelector('.status-dot');
                if (dot) dot.className = 'status-dot';
                let mText = modalIndicator.querySelector('.status-text');
                if (!mText) {
                    mText = document.createElement('span');
                    mText.className = 'status-text';
                    modalIndicator.appendChild(mText);
                }
                mText.textContent = checkingMsg;
            }
        } else if (status.online) {
            indicator.classList.remove('offline');
            indicator.classList.add('online');
            statusText.textContent = onlineMsg;
            
            if (modalIndicator) {
                modalIndicator.classList.remove('offline');
                modalIndicator.classList.add('online');
                const dot = modalIndicator.querySelector('.status-dot');
                if (dot) dot.className = 'status-dot online';
                let mText = modalIndicator.querySelector('.status-text');
                if (!mText) {
                    mText = document.createElement('span');
                    mText.className = 'status-text';
                    modalIndicator.appendChild(mText);
                }
                mText.textContent = onlineMsg;
            }
        } else {
            indicator.classList.remove('online');
            indicator.classList.add('offline');
            statusText.textContent = offlineMsg;
            
            if (modalIndicator) {
                modalIndicator.classList.remove('online');
                modalIndicator.classList.add('offline');
                const dot = modalIndicator.querySelector('.status-dot');
                if (dot) dot.className = 'status-dot offline';
                let mText = modalIndicator.querySelector('.status-text');
                if (!mText) {
                    mText = document.createElement('span');
                    mText.className = 'status-text';
                    modalIndicator.appendChild(mText);
                }
                mText.textContent = offlineMsg;
            }
        }
    }

    /** 
     * Enables mouse-drag scrolling for a container
     */
    function initDragScroll(el) {
        if (!el) return;
        let isDown = false;
        let startX, startY, scrollLeft, scrollTop;
        let moveDist = 0; 

        const handleStart = (e) => {
            isDown = true;
            moveDist = 0;
            const pageX = e.pageX || (e.touches && e.touches[0].pageX);
            const pageY = e.pageY || (e.touches && e.touches[0].pageY);
            startX = pageX - el.offsetLeft;
            startY = pageY - el.offsetTop;
            scrollLeft = el.scrollLeft;
            scrollTop = el.scrollTop;
            if (el.classList.contains('detail-scroll-area')) {
                el.style.cursor = 'ns-resize';
            } else {
                el.style.cursor = 'grabbing';
            }
            el.style.userSelect = 'none';
        };

        const handleEnd = () => {
            isDown = false;
            el.classList.remove('dragging');
            el.style.cursor = '';
            el.style.userSelect = '';
        };

        const handleMove = (e) => {
            if (!isDown || document.body.classList.contains('swipe-confirmed')) return;
            const pageX = e.pageX || (e.touches && e.touches[0].pageX);
            const pageY = e.pageY || (e.touches && e.touches[0].pageY);
            const x = pageX - el.offsetLeft;
            const y = pageY - el.offsetTop;
            
            const dx = Math.abs(x - startX);
            const dy = Math.abs(y - startY);
            
            // Only start dragging after a small movement to allow normal clicks
            if (!el.classList.contains('dragging') && (dx > 5 || dy > 5)) {
                el.classList.add('dragging');
            }
            
            if (el.classList.contains('dragging')) {
                const walkX = (x - startX) * 2;
                const walkY = (y - startY) * 2;
                el.scrollLeft = scrollLeft - walkX;
                el.scrollTop  = scrollTop  - walkY;
            }
        };

        el.addEventListener('mousedown', handleStart);
        el.addEventListener('mousemove', (e) => { 
            if (isDown) {
                e.preventDefault(); 
                handleMove(e); 
            }
        });
        el.addEventListener('mouseup', handleEnd);
        el.addEventListener('mouseleave', handleEnd);
    }

    // ── DATA ──────────────────────────────────────────────────────────────────
    async function loadData() {
        try {
            let data, source;
            if (typeof ThaMallDB !== 'undefined') {
                const result = await ThaMallDB.load();
                data   = result.data;
                source = result.source;
                updateStatus();
            } else {
                // Fallback: plain localStorage
                const raw = localStorage.getItem(CACHE_KEY);
                data = raw ? JSON.parse(raw) : null;
                source = 'cache';
            }
            if (!data) return;
            catalogData = data;
            allCategories.clear();
            
            const prefix = 'F-';
            const activeFloorCats = new Set();
            Object.values(catalogData.units || {}).forEach(u => {
                if (u.code && u.code.startsWith(prefix)) {
                    cats(u).forEach(c => activeFloorCats.add(c.trim()));
                }
            });

            // Populate allCategories only if they exist in the dashboard's global list AND have units on this floor
            (catalogData.categories || []).forEach(c => {
                const trimmed = c.trim();
                if (activeFloorCats.has(trimmed)) {
                    allCategories.add(trimmed);
                }
            });
        } catch (e) { console.error('[floor.js] Data error', e); }
    }

    /** Always returns string[] of categories for a unit */
    function cats(unit) {
        if (!unit || !unit.categories) return [];
        return Array.isArray(unit.categories)
            ? unit.categories
            : unit.categories.split(',').map(c => c.trim()).filter(Boolean);
    }

    // ── SVG SETUP ─────────────────────────────────────────────────────────────
    // The G-/F- elements are <use>→<image> PNG stamps placed at their unit's
    // exact floor coordinates. Opacity and color are styled based on status.
    function setupSVG() {
        if (!svgEl) { console.warn('Inline SVG not found in #svg-container'); return; }

        // Ensure filters are injected into the SVG <defs>
        let defs = svgEl.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svgEl.prepend(defs);
        }
        
        // Add green-tint filter (Available)
        if (!svgEl.getElementById('green-tint')) {
            defs.insertAdjacentHTML('beforeend', `
                <filter id="green-tint">
                    <feFlood flood-color="#28a745" flood-opacity="0.6" result="flood"></feFlood>
                    <feComposite in="flood" in2="SourceAlpha" operator="in" result="composite"></feComposite>
                    <feMerge>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                        <feMergeNode in="composite"></feMergeNode>
                    </feMerge>
                </filter>
            `);
        }
        // Add gray-tint filter (Reserved)
        if (!svgEl.getElementById('gray-tint')) {
            defs.insertAdjacentHTML('beforeend', `
                <filter id="gray-tint">
                    <feFlood flood-color="#888888" flood-opacity="0.6" result="flood"></feFlood>
                    <feComposite in="flood" in2="SourceAlpha" operator="in" result="composite"></feComposite>
                    <feMerge>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                        <feMergeNode in="composite"></feMergeNode>
                    </feMerge>
                </filter>
            `);
        }
        // Add red-tint filter (Sold)
        if (!svgEl.getElementById('red-tint')) {
            defs.insertAdjacentHTML('beforeend', `
                <filter id="red-tint">
                    <feFlood flood-color="#dc3545" flood-opacity="0.6" result="flood"></feFlood>
                    <feComposite in="flood" in2="SourceAlpha" operator="in" result="composite"></feComposite>
                    <feMerge>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                        <feMergeNode in="composite"></feMergeNode>
                    </feMerge>
                </filter>
            `);
        }

        // Inject interaction styles into the inline SVG
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = `
            [id^="G-"], [id^="F-"] {
                cursor: pointer;
                transition: opacity 0.25s ease;
                pointer-events: all;
            }
        `;
        svgEl.prepend(style);

        // Assign status classes to the SVG unit stamps based on their status in catalogData
        const prefix = document.title.includes('1st') ? 'F-' : 'G-';
        svgEl.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
            const unit = catalogData.units[el.id];
            if (unit) {
                const status = unit.status || 'متاح';
                el.classList.remove('status-available', 'status-reserved', 'status-sold');
                el.classList.add(status === 'متاح' ? 'status-available' : status === 'مباع' ? 'status-sold' : 'status-reserved');
            }
            
            el.addEventListener('click', e => {
                e.stopPropagation();
                onUnitClick(el.id);
            });
        });

        // Click on empty SVG background → clear selection
        svgEl.addEventListener('click', () => resetAll());
    }

    // ── TABLE ─────────────────────────────────────────────────────────────────
    function renderTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        const prefix = document.title.includes('1st') ? 'F-' : 'G-';
        Object.values(catalogData.units || {})
            .filter(u => u.code && u.code.startsWith(prefix))
            .sort((a, b) => a.code.localeCompare(b.code))
            .forEach(unit => {
                const status = unit.status || 'متاح';
                const tr = document.createElement('tr');
                tr.id = `row-${unit.code}`;
                tr.innerHTML = `
                    <td style="font-weight:600">${unit.code}</td>
                    <td>${unit.area} م²</td>
                    <td><span class="status-cell status-${status === 'متاح' ? 'available' : status === 'مباع' ? 'sold' : 'reserved'}">${status}</span></td>`;
                tr.addEventListener('click', () => onRowClick(unit.code));
                tableBody.appendChild(tr);
            });
    }

    // ── CATEGORY CHIPS ────────────────────────────────────────────────────────
    function renderChips() {
        if (!categoriesFilter) return;
        categoriesFilter.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'categories-wrapper';
        const scroll = document.createElement('div');
        scroll.className = 'categories-scroll';
        wrapper.appendChild(scroll);
        Array.from(allCategories).sort().forEach(cat => {
            const btn = document.createElement('button');
            btn.className        = 'category-chip';
            btn.textContent      = cat;
            btn.dataset.category = cat;
            btn.addEventListener('click', () => onCatClick(cat, btn));
            scroll.appendChild(btn);
        });
        categoriesFilter.appendChild(wrapper);
        // Enable drag-scroll on the scroll area
        initDragScroll(scroll);
    }

    // ── INTERACTION HANDLERS ──────────────────────────────────────────────────

    /** Click on a unit shape in the SVG floor plan */
    function onUnitClick(id) {
        if (!catalogData.units[id]) return;
        resetAll(false);
        selectedUnitId = id;
        svgHighlight(id, 'active');
        rowHighlight(id, true);
        showDetails(catalogData.units[id]);
        markChips(cats(catalogData.units[id]));
    }

    /** Click on a row in the sidebar table */
    function onRowClick(id) {
        if (!catalogData.units[id]) return;
        resetAll(false);
        selectedUnitId = id;
        svgHighlight(id, 'active');
        rowHighlight(id, false);       // user clicked it — no scroll needed
        showDetails(catalogData.units[id]);
        markChips(cats(catalogData.units[id]));
    }

    /** Click on a category chip */
    function onCatClick(cat, btn) {
        const targetCat = (cat || '').trim();
        if (!targetCat) return;

        // Toggle logic: If clicking the active filter, clear it
        if (currentFilter === targetCat) { 
            currentFilter = null;
        } else {
            currentFilter = targetCat;
        }

        // Clear active status filter to get all units in this category as a new selection
        currentStatusFilter = null;
        document.querySelectorAll('.status-indicator').forEach(ind => ind.classList.remove('active'));

        // ABSOLUTELY clear any previous single unit selections and active styles
        selectedUnitId = null;
        hideDetails();

        if (svgEl) {
            const prefix = document.title.includes('1st') ? 'F-' : 'G-';
            svgEl.querySelectorAll(`[id^="${prefix}"]`).forEach(el => el.classList.remove('active'));
        }
        document.querySelectorAll('#units-table tbody tr').forEach(row => row.classList.remove('selected'));
        document.querySelectorAll('.category-chip').forEach(chip => chip.classList.remove('unit-active'));

        applyFilters();
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    function svgHighlight(id, cls) {
        if (!svgEl) return;
        const el = svgEl.getElementById(id);
        if (el) el.classList.add(cls);
    }

    function rowHighlight(id, scroll) {
        const row = document.getElementById(`row-${id}`);
        if (!row) return;
        row.classList.add('selected');
        if (scroll) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function showDetails(unit) {
        const ph = detailsPanel.querySelector('.detail-placeholder');
        const ct = detailsPanel.querySelector('.detail-content');
        if (ph) ph.style.display = 'none';
        if (ct) ct.classList.remove('hidden');
        detailId.textContent         = unit.code;
        detailArea.textContent       = unit.area + ' م²';
        detailCategories.textContent = cats(unit).join(', ') || '—';
        if (detailStatus) {
            const status = unit.status || 'متاح';
            detailStatus.textContent = status;
            if (status === 'متاح') {
                detailStatus.style.color = '#28a745';
            } else if (status === 'مباع') {
                detailStatus.style.color = '#dc3545';
            } else if (status === 'محجوز') {
                detailStatus.style.color = '#6c757d';
            } else {
                detailStatus.style.color = 'var(--primary-color)';
            }
        }
        
        // Highlight status indicator for the selected unit
        const status = unit.status || 'متاح';
        document.querySelectorAll('.status-indicator').forEach(ind => {
            ind.classList.toggle('unit-active', ind.dataset.status === status);
        });
    }

    function hideDetails() {
        const ph = detailsPanel.querySelector('.detail-placeholder');
        const ct = detailsPanel.querySelector('.detail-content');
        if (ph) ph.style.display = '';
        if (ct) ct.classList.add('hidden');
        
        // Clear status highlights when hidden
        document.querySelectorAll('.status-indicator').forEach(ind => {
            ind.classList.remove('unit-active');
        });
    }

    function markChips(activeCats) {
        const trimmedActive = activeCats.map(c => c.trim());
        document.querySelectorAll('.category-chip').forEach(chip => {
            const chipCat = (chip.dataset.category || '').trim();
            chip.classList.toggle('unit-active', trimmedActive.includes(chipCat));
        });
    }

    let currentStatusFilter = null;

    function onStatusIndicatorClick(status, indicator) {
        // Toggle status filter logic
        if (currentStatusFilter === status) {
            currentStatusFilter = null;
        } else {
            currentStatusFilter = status;
        }

        // ABSOLUTELY clear any previous single unit selections and active styles
        selectedUnitId = null;
        hideDetails();

        if (svgEl) {
            const prefix = document.title.includes('1st') ? 'F-' : 'G-';
            svgEl.querySelectorAll(`[id^="${prefix}"]`).forEach(el => el.classList.remove('active'));
        }
        document.querySelectorAll('#units-table tbody tr').forEach(row => row.classList.remove('selected'));
        document.querySelectorAll('.category-chip').forEach(chip => chip.classList.remove('unit-active'));

        applyFilters();
    }

    /**
     * Apply active category and status filters concurrently
     */
    function applyFilters() {
        // 1. Remove all old filter classes from SVG and Table
        if (svgEl) {
            svgEl.classList.remove('has-cat-highlight', 'has-active-filters');
            const prefix = document.title.includes('1st') ? 'F-' : 'G-';
            svgEl.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
                el.classList.remove('cat-highlight', 'status-highlight', 'filter-highlight');
                if (!selectedUnitId) el.classList.remove('active');
            });
        }

        document.querySelectorAll('#units-table tbody tr').forEach(row => {
            row.classList.remove('category-row', 'status-row-highlight', 'filter-row-highlight');
            if (!selectedUnitId) row.classList.remove('selected');
        });

        // Toggle active state on category chips UI
        document.querySelectorAll('.category-chip').forEach(chip => {
            const chipCat = (chip.dataset.category || '').trim();
            if (currentFilter && chipCat === currentFilter) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
            if (!selectedUnitId) {
                chip.classList.remove('unit-active');
            }
        });

        // Toggle active state on status indicators UI
        document.querySelectorAll('.status-indicator').forEach(ind => {
            const status = ind.dataset.status;
            if (currentStatusFilter && status === currentStatusFilter) {
                ind.classList.add('active');
            } else {
                ind.classList.remove('active');
            }
        });

        // If no filter is active, stop here (classes were cleared)
        if (!currentFilter && !currentStatusFilter) {
            return;
        }

        // 2. Add 'has-active-filters' to SVG to trigger fading of non-matching units
        if (svgEl) {
            svgEl.classList.add('has-active-filters');
        }

        const prefix = document.title.includes('1st') ? 'F-' : 'G-';

        // 3. Highlight SVG Units matching all active criteria
        if (svgEl) {
            svgEl.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
                const u = catalogData.units[el.id];
                if (!u) return;

                const matchCat = !currentFilter || cats(u).some(c => c.trim() === currentFilter);
                const matchStatus = !currentStatusFilter || (u.status || 'متاح') === currentStatusFilter;

                if (matchCat && matchStatus) {
                    el.classList.add('filter-highlight');
                }
            });
        }

        // 4. Highlight Table Rows matching all active criteria
        document.querySelectorAll('#units-table tbody tr').forEach(row => {
            const unitId = row.id.replace('row-', '').trim();
            const u = catalogData.units[unitId];
            if (!u) return;

            const matchCat = !currentFilter || cats(u).some(c => c.trim() === currentFilter);
            const matchStatus = !currentStatusFilter || (u.status || 'متاح') === currentStatusFilter;

            if (matchCat && matchStatus) {
                row.classList.add('filter-row-highlight');
            }
        });
    }

    /**
     * Clear every highlighted state.
     * @param {boolean} resetDetails  Also reset the details panel (default true)
     */
    function resetAll(resetDetails = true) {
        selectedUnitId = null;
        currentFilter  = null;
        currentStatusFilter = null;

        // ABSOLUTELY clear any previous selections and active styles
        if (svgEl) {
            const prefix = document.title.includes('1st') ? 'F-' : 'G-';
            svgEl.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
                el.classList.remove('active', 'cat-highlight', 'status-highlight', 'filter-highlight');
            });
        }
        document.querySelectorAll('#units-table tbody tr').forEach(row => {
            row.classList.remove('selected', 'category-row', 'status-row-highlight', 'filter-row-highlight');
        });
        document.querySelectorAll('.category-chip').forEach(chip => {
            chip.classList.remove('active', 'unit-active');
        });
        document.querySelectorAll('.status-indicator').forEach(ind => {
            ind.classList.remove('active', 'unit-active');
        });

        applyFilters();

        if (resetDetails) hideDetails();
    }

    // ── MODAL ─────────────────────────────────────────────────────────────────
    function setupModal() {
        if (showPriceBtn) showPriceBtn.addEventListener('click', openModal);
        
        const closeBtn = document.getElementById('modal-close-trigger');
        if (closeBtn) closeBtn.addEventListener('click', () => plansModal.classList.remove('active'));

        if (plansModal)   plansModal.addEventListener('click', e => {
            if (e.target === plansModal) plansModal.classList.remove('active');
        });
    }

    function openModal() {
        if (!selectedUnitId) return;
        const unit = catalogData.units[selectedUnitId];
        if (!unit) return;

        modalUnitId.textContent = unit.code + ' (' + unit.area + ' م²)';
        
        let gridHTML = `
            <div class="plans-table-wrapper" style="width: 100%; margin-top: clamp(10px, 2vw, 20px); border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); background: white;">
                <table style="width: 100%; border-collapse: collapse; text-align: center; background: white;">
                    <thead>
                        <tr>
                            <th style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; background: #f8f9fa; color: var(--text-muted); font-weight: 600; font-size: clamp(0.6rem, 1.2vw, 0.95rem);">الخطة</th>
                            <th style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; background: #f8f9fa; color: var(--text-muted); font-weight: 600; font-size: clamp(0.6rem, 1.2vw, 0.95rem);">سعر المتر</th>
                            <th style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; background: #f8f9fa; color: var(--text-muted); font-weight: 600; font-size: clamp(0.6rem, 1.2vw, 0.95rem);">إجمالي السعر</th>
<th style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; background: #f8f9fa; color: var(--text-muted); font-weight: 600; font-size: clamp(0.6rem, 1.2vw, 0.95rem);">قيمة المقدم</th>
                            <th style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; background: #f8f9fa; color: var(--text-muted); font-weight: 600; font-size: clamp(0.6rem, 1.2vw, 0.95rem);">دفعة سنوية</th>
                            
                            <th style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; background: #f8f9fa; color: var(--text-muted); font-weight: 600; font-size: clamp(0.6rem, 1.2vw, 0.95rem);">القسط الشهري</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        (catalogData.plans || []).forEach(plan => {
            const ppm   = (catalogData.prices[unit.position]?.[plan.id]) || 0;
            const total = ppm * unit.area;
            const down  = total * (plan.down / 100);
            const rem   = total - down;
            const yr    = total * (plan.yearly / 100);
            const mo    = (rem - yr * plan.years) / (plan.years * 12);

            gridHTML += `
                        <tr style="transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9faff'" onmouseout="this.style.backgroundColor='transparent'">
                            <td style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; text-align: right;">
                                <div style="font-weight: 700; color: var(--text-dark); margin-bottom: 2px; font-size: clamp(0.7rem, 1.4vw, 1rem);">${plan.name}</div>
                                <div style="display: inline-block; padding: 2px 6px; background: color-mix(in srgb, var(--accent-color) 10%, transparent); color: var(--accent-color); border-radius: 20px; font-size: clamp(0.55rem, 1vw, 0.8rem); font-weight: 600; white-space: nowrap;">${plan.years} سنوات - ${plan.down}% مقدم</div>
                            </td>
                            <td style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; color: var(--text-dark); font-weight: 600; font-size: clamp(0.65rem, 1.3vw, 0.95rem);">EGP ${ppm.toLocaleString()}</td>
                            <td style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; font-weight: 700; color: var(--accent-color); font-size: clamp(0.65rem, 1.3vw, 0.95rem);">EGP ${Math.round(total).toLocaleString()}</td>
<td style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; color: var(--text-dark); font-weight: 600; font-size: clamp(0.65rem, 1.3vw, 0.95rem);">EGP ${Math.round(down).toLocaleString()}</td>
                            <td style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; color: var(--text-dark); font-weight: 600; font-size: clamp(0.65rem, 1.3vw, 0.95rem);">${plan.yearly > 0 ? 'EGP ' + Math.round(yr).toLocaleString() : 'لا يوجد'}</td>
                            
                            <td style="padding: clamp(5px, 1vw, 15px); border: 1px solid #eee; text-align: center; vertical-align: middle;">
                                <div style="display: inline-flex; flex-direction: column; align-items: center; justify-content: center; background: var(--dark-bg); padding: clamp(4px, 1vw, 8px) clamp(8px, 1.5vw, 16px); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                    <span style="font-size: clamp(0.5rem, 0.9vw, 0.75rem); color: rgba(255,255,255,0.7); margin-bottom: 2px; white-space: nowrap;">القسط الشهري</span>
                                    <span style="color: white; font-weight: 700; font-size: clamp(0.65rem, 1.3vw, 1rem); white-space: nowrap;">EGP ${Math.round(mo).toLocaleString()}</span>
                                </div>
                            </td>
                        </tr>
            `;
        });

        gridHTML += `
                    </tbody>
                </table>
            </div>
        `;
        modalPlansGrid.innerHTML = gridHTML;
        plansModal.classList.add('active');
    }

    // ── LIVE SYNC (admin panel changes in same browser) ───────────────────────
    window.addEventListener('storage', async e => {
        if (e.key === CACHE_KEY + '_ping' || e.key === CACHE_KEY) {
            await loadData();
            renderTable();
            renderChips();
            resetAll();
        }
    });

    // ── REMOTE SYNC (admin panel changes from another device) ────────────────
    window.addEventListener('thaMallRemoteUpdate', async () => {
        console.log('[1st-floor.js] Remote update received, refreshing data...');
        await loadData();
        renderTable();
        renderChips();
        resetAll(false); // Don't clear selected unit if possible
    });

    // ── NETWORK STATUS (Active detection from DB layer) ──────────────────────
    window.addEventListener('thaMallDataEvent', e => {
        if (e.detail.event === 'networkStatus' || e.detail.event === 'loaded') {
            updateStatus();
        }
    });

    // Periodic ping to keep status accurate (only when page is visible)
    setInterval(() => {
        if (!document.hidden && typeof ThaMallDB !== 'undefined') {
            ThaMallDB.ping().then(() => updateStatus());
        }
    }, 30000);

    // ── GO ────────────────────────────────────────────────────────────────────
    await init();
});
