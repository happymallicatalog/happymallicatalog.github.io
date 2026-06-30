/* 
   Global Catalog Logic
   - Orientation Control
*/

document.addEventListener('DOMContentLoaded', () => {
    // Detect if running in PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone === true;
    if (isStandalone) {
        localStorage.setItem('happymall_pwa_installed', 'true');
        localStorage.removeItem('pwa_user_reset');
    }

    // Save current catalog page so PWA can restore it after returning from external links (e.g. Google Maps)
    const currentPage = window.location.pathname.split('/').pop();
    const catalogPages = ['cover.html','developer.html','mall.html','location.html','b-floor.html','g-floor.html','1st-floor.html','2nd-floor.html','3rd-floor.html','plans.html','contacts.html','end.html'];
    if (currentPage && catalogPages.includes(currentPage)) {
        localStorage.setItem('happymall_last_page', currentPage);
    }

    initOrientationControl();
    initDragToScroll();
});

/* --- Global Link/Contact Interceptor for PWA --- */
document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Check if it is a contact protocol or external link
    const isMailto = href.startsWith('mailto:');
    const isTel = href.startsWith('tel:');
    const isSms = href.startsWith('sms:');
    const isWhatsapp = href.startsWith('whatsapp:') || href.includes('wa.me') || href.includes('api.whatsapp.com');
    const isExternalHttp = (href.startsWith('http://') || href.startsWith('https://')) && !href.includes(window.location.hostname);

    if (isMailto || isTel || isSms || isWhatsapp || isExternalHttp) {
        e.preventDefault();
        window.location.href = href;
    }
});

/* --- Orientation Control --- */
function initOrientationControl() {
    if (!document.querySelector('.orientation-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'orientation-overlay';
        overlay.innerHTML = `
            <svg class="rotate-device-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="5" y="2" width="14" height="20" rx="2" stroke="white" />
                <path d="M12 18h.01" stroke="white" stroke-linecap="round" />
                <path d="M17 7l3-3m0 0l-3-3m3 3H10a5 5 0 0 0-5 5v2" stroke="var(--accent-color)" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div class="orientation-text">
                <p class="en-text">PLEASE ROTATE YOUR DEVICE</p>
                <h2 class="ar-text">يرجى تدوير الجهاز</h2>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

/* --- Global Drag-to-Scroll Support --- */
function initDragToScroll() {
    const scrollables = document.querySelectorAll('.scrollable-element');
    scrollables.forEach(slider => {
        let isDown = false;
        let startX;
        let startY;
        let scrollLeft;
        let scrollTop;

        // Mouse Events
        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.style.cursor = 'grabbing';
            startX = e.pageX - slider.offsetLeft;
            startY = e.pageY - slider.offsetTop;
            scrollLeft = slider.scrollLeft;
            scrollTop = slider.scrollTop;
        });
        
        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.style.cursor = 'grab';
        });
        
        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.style.cursor = 'grab';
        });
        
        slider.addEventListener('mousemove', (e) => {
            if (!isDown || document.body.classList.contains('swipe-confirmed')) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const y = e.pageY - slider.offsetTop;
            const walkX = (x - startX) * 1.5; 
            const walkY = (y - startY) * 1.5;
            slider.scrollLeft = scrollLeft - walkX;
            slider.scrollTop = scrollTop - walkY;
        });

        // Touch Events
        slider.addEventListener('touchstart', (e) => {
            isDown = true;
            startX = e.touches[0].pageX - slider.offsetLeft;
            startY = e.touches[0].pageY - slider.offsetTop;
            scrollLeft = slider.scrollLeft;
            scrollTop = slider.scrollTop;
        }, { passive: true });
        
        slider.addEventListener('touchend', () => {
            isDown = false;
        }, { passive: true });
        
        slider.addEventListener('touchmove', (e) => {
            if (!isDown || document.body.classList.contains('swipe-confirmed')) return;
            const x = e.touches[0].pageX - slider.offsetLeft;
            const y = e.touches[0].pageY - slider.offsetTop;
            const walkX = (x - startX) * 1.5;
            const walkY = (y - startY) * 1.5;
            slider.scrollLeft = scrollLeft - walkX;
            slider.scrollTop = scrollTop - walkY;
        }, { passive: true });

        // Set initial cursor
        slider.style.cursor = 'grab';
    });
}

window.sortUnitsCode = function(codeA, codeB) {
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
};
