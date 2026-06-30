/**
 * floor-loader.js
 * Fetches an external SVG file and injects it inline into #svg-container,
 * then resolves so the floor JS can set up interactions.
 *
 * Uses fetch WITHOUT cache-busting so the Service Worker can serve
 * the SVG from its cache when offline.
 */
async function loadFloorSVG(svgPath) {
    const container = document.getElementById('svg-container');
    if (!container) return null;

    // Show loading state
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--primary-color,#C5A059);flex-direction:column;gap:12px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
            </path>
        </svg>
        <span style="font-family:sans-serif;font-size:0.85rem;opacity:0.7;">جاري تحميل المخطط...</span>
    </div>`;

    try {
        // Fetch WITHOUT cache-busting timestamp so the SW can serve it from cache offline.
        // The SW's cacheFirst strategy will handle offline serving automatically.
        const res = await fetch(svgPath, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const svgText = await res.text();

        // Parse and extract the SVG element
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) throw new Error('No SVG element found in response');

        // Override size attrs so it fills container
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.display = 'block';
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        svgEl.id = 'floor-svg-inline';

        container.innerHTML = '';
        container.appendChild(svgEl);
        return svgEl;
    } catch (err) {
        console.error('[floor-loader] Error loading SVG:', err);
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#C5A059;font-family:sans-serif;font-size:0.9rem;flex-direction:column;gap:8px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>تعذر تحميل المخطط</span>
        </div>`;
        return null;
    }
}
