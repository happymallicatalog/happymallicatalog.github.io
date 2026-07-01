/* Navigation and Swipe Logic */
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSwipeSupport();
});

function initNavigation() {
    const navContainer = document.createElement('div');
    navContainer.className = 'nav-menu-container';
    navContainer.id = 'mainNav';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'nav-toggle-btn';
    toggleBtn.innerHTML = `
        <div class="burger-icon">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;

    const navItems = document.createElement('div');
    navItems.className = 'nav-items';
    
    // Add Luxury Card Accents
    const accentTR = document.createElement('div');
    accentTR.className = 'nav-card-accent nav-accent-tr';
    const accentBL = document.createElement('div');
    accentBL.className = 'nav-card-accent nav-accent-bl';
    navItems.appendChild(accentTR);
    navItems.appendChild(accentBL);

    // Menu Items Definition
    const items = [
        { id: 'cover', type: 'svg', icon: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle>', link: 'cover.html', class: 'cover-icon' },
        { id: 'developer', type: 'svg', icon: '<path d="M3 21h18M9 21V9m0 0V3h6v6m-6 0h6m0 0v12M9 6h6M9 12h6M9 15h6M9 18h6"></path>', link: 'developer.html' },
        { id: 'mall', type: 'svg', icon: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path>', link: 'mall.html' },
        { id: 'location', type: 'svg', icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>', link: 'location.html' },
        { id: 'bfloor', type: 'text', icon: 'B', link: 'b-floor.html', class: 'small-text-icon' },
        { id: 'gfloor', type: 'text', icon: 'G', link: 'g-floor.html' },
        { id: '1stfloor', type: 'text', icon: '1st', link: '1st-floor.html', class: 'small-text-icon' },
        { id: '2ndfloor', type: 'text', icon: '2nd', link: '2nd-floor.html', class: 'small-text-icon' },
        { id: '3rdfloor', type: 'text', icon: '3rd', link: '3rd-floor.html', class: 'small-text-icon' },
        { id: 'payment', type: 'svg', icon: '<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path>', link: 'plans.html' },
        { id: 'contacts', type: 'svg', icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.27-2.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>', link: 'contacts.html' },
        { id: 'end', type: 'svg', icon: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle>', link: 'end.html' }
    ];

    items.forEach(item => {
        const a = document.createElement('a');
        a.href = item.link;
        a.className = 'nav-item ' + (item.class || '');
        
        const currentPath = window.location.pathname.split('/').pop() || 'cover.html';
        if (currentPath === item.link) {
            a.classList.add('active');
        }

        if (item.type === 'img') {
            a.innerHTML = `<img src="${item.icon}" class="custom-icon" alt="${item.id}">`;
        } else if (item.type === 'text') {
            a.innerHTML = `<span class="nav-text-icon">${item.icon}</span>`;
        } else {
            a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>`;
        }
        
        navItems.appendChild(a);
    });

    navContainer.appendChild(navItems);
    navContainer.appendChild(toggleBtn);
    
    document.body.appendChild(navContainer);

    // Start pulsing after 3 seconds to prompt the user that this button opens a menu
    let pulseTimeout;
    let stopPulseTimeout;

    function startPulseTimer() {
        pulseTimeout = setTimeout(() => {
            if (!navContainer.classList.contains('active')) {
                toggleBtn.classList.add('pulse-indicator');
                
                // Stop pulsing automatically after 6 seconds to avoid distraction
                stopPulseTimeout = setTimeout(() => {
                    toggleBtn.classList.remove('pulse-indicator');
                }, 6000);
            }
        }, 3000);
    }

    const hasIntroVideo = document.getElementById('introVideo');
    if (hasIntroVideo) {
        window.addEventListener('introFinished', () => {
            startPulseTimer();
        });
    } else {
        startPulseTimer();
    }

    toggleBtn.addEventListener('click', () => {
        clearTimeout(pulseTimeout);
        clearTimeout(stopPulseTimeout);
        toggleBtn.classList.remove('pulse-indicator');
        navContainer.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!navContainer.contains(e.target)) {
            navContainer.classList.remove('active');
        }
    });

    checkMenuDirection(navContainer, navItems, toggleBtn);
    window.addEventListener('resize', () => {
        checkMenuDirection(navContainer, navItems, toggleBtn);
    });
}

function checkMenuDirection(container, itemsContainer, toggleBtn) {
    if (window.innerHeight < 750) {
        container.classList.add('horizontal');
    } else {
        container.classList.remove('horizontal');
    }
}

function initSwipeSupport() {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    let swipeConfirmed = false;
    const minSwipeDistance = 100;
    const pageContainer = document.querySelector('.page-container') || document.body;

    // Handle initial slide-in animation
    const navDirection = sessionStorage.getItem('navDirection');
    if (navDirection === 'next') {
        pageContainer.classList.add('slide-in-right');
    } else if (navDirection === 'prev') {
        pageContainer.classList.add('slide-in-left');
    }
    sessionStorage.removeItem('navDirection');
    
    // Prevent default browser image/link dragging which interferes with swipe navigation
    document.addEventListener('dragstart', e => e.preventDefault());

    // Touch events
    document.addEventListener('touchstart', e => {
        if (isInteractingWithScrollable(e.target)) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
        swipeConfirmed = false;
        document.body.classList.add('dragging');
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
        const diffX = currentX - startX;
        const diffY = currentY - startY;

        // If not already confirmed as a horizontal swipe, check if it's horizontal enough
        if (!swipeConfirmed) {
            if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 10) {
                swipeConfirmed = true;
                document.body.classList.add('swipe-confirmed');
            } else if (Math.abs(diffY) > 10) {
                // If it's more of a vertical move, stop tracking this swipe to allow normal scrolling
                isDragging = false;
                document.body.classList.remove('dragging');
                return;
            } else {
                return; // Wait for more movement
            }
        }
        
        if (pageContainer) {
            pageContainer.style.transform = `translateX(${diffX}px)`;
            pageContainer.style.opacity = Math.max(0.7, 1 - Math.abs(diffX) / window.innerWidth);
        }
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!isDragging) return;
        isDragging = false;
        document.body.classList.remove('dragging');
        document.body.classList.remove('swipe-confirmed');
        
        const diff = startX - (e.changedTouches[0].clientX);
        handleGestureEnd(diff);
    });

    document.addEventListener('touchcancel', () => {
        isDragging = false;
        document.body.classList.remove('dragging');
        document.body.classList.remove('swipe-confirmed');
        if (pageContainer) {
            pageContainer.style.transform = 'translateX(0)';
            pageContainer.style.opacity = '1';
        }
    });

    // Mouse events
    document.addEventListener('mousedown', e => {
        if (isInteractingWithScrollable(e.target)) return;
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('path')) return;
        
        startX = e.clientX;
        startY = e.clientY;
        isDragging = true;
        swipeConfirmed = false;
        document.body.classList.add('dragging');
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        currentX = e.clientX;
        currentY = e.clientY;
        const diffX = currentX - startX;
        const diffY = currentY - startY;

        if (!swipeConfirmed) {
            if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 10) {
                swipeConfirmed = true;
                document.body.classList.add('swipe-confirmed');
            } else if (Math.abs(diffY) > 10) {
                isDragging = false;
                document.body.classList.remove('dragging');
                return;
            } else {
                return;
            }
        }
        
        if (pageContainer) {
            pageContainer.style.transform = `translateX(${diffX}px)`;
            pageContainer.style.opacity = Math.max(0.7, 1 - Math.abs(diffX) / window.innerWidth);
        }
    });

    document.addEventListener('mouseup', e => {
        if (!isDragging) return;
        isDragging = false;
        document.body.classList.remove('dragging');
        document.body.classList.remove('swipe-confirmed');
        
        const diff = startX - e.clientX;
        handleGestureEnd(diff);
    });

    function isInteractingWithScrollable(el) {
        // Only block swipe navigation if the user is interacting with 
        // a component that explicitly handles horizontal scrolling/swiping.
        // We allow swiping on maps and tables because they are mostly 
        // vertical or we want the page-level swipe to take precedence 
        // for catalog navigation.
        return el.closest('.categories-scroll') || 
               el.closest('.thumbs-container') ||
               el.closest('.features-grid') ||
               el.closest('.bottom-slider-bar') ||
               el.closest('.slider-inner');
    }

    function handleGestureEnd(diff) {
        if (Math.abs(diff) > minSwipeDistance) {
            document.body.classList.add('navigating');
            if (diff > 0) {
                if (pageContainer) pageContainer.style.transform = `translateX(-100%)`;
                sessionStorage.setItem('navDirection', 'next');
                setTimeout(() => navigateToNext(), 150);
            } else {
                if (pageContainer) pageContainer.style.transform = `translateX(100%)`;
                sessionStorage.setItem('navDirection', 'prev');
                setTimeout(() => navigateToPrev(), 150);
            }
        } else {
            if (pageContainer) {
                pageContainer.style.transform = 'translateX(0)';
                pageContainer.style.opacity = '1';
            }
        }
    }
}

function navigateToNext() {
    const pages = ['cover.html', 'developer.html', 'mall.html', 'location.html', 'b-floor.html', 'g-floor.html', '1st-floor.html', '2nd-floor.html', '3rd-floor.html', 'plans.html', 'contacts.html', 'end.html'];
    const currentPath = window.location.pathname.split('/').pop() || 'cover.html';
    const currentIndex = pages.indexOf(currentPath);
    if (currentIndex < pages.length - 1) {
        window.location.href = pages[currentIndex + 1];
    }
}

function navigateToPrev() {
    const pages = ['cover.html', 'developer.html', 'mall.html', 'location.html', 'b-floor.html', 'g-floor.html', '1st-floor.html', '2nd-floor.html', '3rd-floor.html', 'plans.html', 'contacts.html', 'end.html'];
    const currentPath = window.location.pathname.split('/').pop() || 'cover.html';
    const currentIndex = pages.indexOf(currentPath);
    if (currentIndex > 0) {
        window.location.href = pages[currentIndex - 1];
    }
}
