/**
 * PREMAM SILKS — Wishlist Module
 * 
 * localStorage-based wishlist with sidebar UI.
 * Customers can save products while browsing, then move to cart.
 *
 * Usage:
 *   PremamWishlist.add(product)
 *   PremamWishlist.remove(productId)
 *   PremamWishlist.has(productId)
 *   PremamWishlist.openSidebar()
 */
const PremamWishlist = (function () {
    'use strict';

    const STORAGE_KEY = 'premam_wishlist';

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
    let wishlistItems = [];

    // ============================================================
    // PERSISTENCE
    // ============================================================
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) wishlistItems = JSON.parse(raw);
        } catch (e) {
            wishlistItems = [];
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlistItems));
        } catch (e) {
            console.warn('Wishlist save failed:', e);
        }
    }

    // ============================================================
    // OPERATIONS
    // ============================================================
    function add(product) {
        if (!product || !product.id) return;
        if (has(product.id)) return; // already in wishlist

        wishlistItems.push({
            id: product.id,
            name: product.name || '',
            price: Number(product.price) || 0,
            originalPrice: Number(product.originalPrice) || 0,
            image: product.image || '',
            category: product.category || ''
        });
        save();
        updateBadges();
        refreshSidebar();
        showToast(`${product.name} added to wishlist`);
    }

    function remove(productId) {
        wishlistItems = wishlistItems.filter(i => i.id !== productId);
        save();
        updateBadges();
        refreshSidebar();
        updateHeartButtons();
    }

    function has(productId) {
        return wishlistItems.some(i => i.id === productId);
    }

    function getItems() {
        return [...wishlistItems];
    }

    function getCount() {
        return wishlistItems.length;
    }

    // ============================================================
    // UI — BADGES
    // ============================================================
    function updateBadges() {
        const count = getCount();
        document.querySelectorAll('.nav-icon[aria-label="Wishlist"] .badge').forEach(badge => {
            badge.textContent = count;
        });
        // Also update heart buttons active state
        updateHeartButtons();
    }

    function updateHeartButtons() {
        document.querySelectorAll('.wishlist-heart-btn').forEach(btn => {
            const id = btn.dataset.productId;
            if (id && has(id)) {
                btn.classList.add('active');
                btn.setAttribute('aria-label', 'Remove from Wishlist');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-label', 'Add to Wishlist');
            }
        });
    }

    // ============================================================
    // UI — TOAST
    // ============================================================
    function showToast(message) {
        if (window.PremamCart && window.PremamCart.showToast) {
            window.PremamCart.showToast(message, 'success');
        }
    }

    // ============================================================
    // UI — SIDEBAR
    // ============================================================
    let sidebarCreated = false;

    function renderSidebar() {
        const items = getItems();
        const count = getCount();

        if (items.length === 0) {
            return `
            <div class="cart-sidebar-header">
                <h3>My Wishlist <span class="cart-header-count">(0)</span></h3>
                <button class="cart-sidebar-close" data-action="close-wishlist">
                    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="cart-sidebar-body">
                <div class="cart-empty">
                    <svg width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg>
                    <h3>Your wishlist is empty</h3>
                    <p>Save your favourite sarees while browsing</p>
                    <button class="btn btn-primary" data-action="close-wishlist" style="padding:10px 28px;border-radius:8px;background:#0d6157;color:#fff;border:none;cursor:pointer;">Continue Shopping</button>
                </div>
            </div>`;
        }

        const itemsHTML = items.map(item => {
            const formatPrice = (n) => '₹' + Number(n).toLocaleString('en-IN');
            return `
            <div class="cart-item wishlist-item" data-id="${escapeHTML(item.id)}">
                <div class="cart-item-image">
                    <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" onerror="this.src='images/placeholder.png'">
                </div>
                <div class="cart-item-details">
                    <span class="cart-item-category">${escapeHTML(item.category)}</span>
                    <p class="cart-item-name">${escapeHTML(item.name)}</p>
                    <span class="cart-item-price">${formatPrice(item.price)}</span>
                    <button class="wishlist-move-to-cart" data-id="${item.id}" style="margin-top:6px;padding:6px 14px;font-size:0.75rem;font-weight:600;background:#0d6157;color:#fff;border:none;border-radius:5px;cursor:pointer;transition:background 0.2s;">
                        🛒 Move to Cart
                    </button>
                </div>
                <button class="cart-item-remove" data-action="remove-wishlist" data-id="${item.id}" title="Remove">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>`;
        }).join('');

        return `
        <div class="cart-sidebar-header">
            <h3>My Wishlist <span class="cart-header-count">(${count})</span></h3>
            <button class="cart-sidebar-close" data-action="close-wishlist">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="cart-sidebar-body">
            <div class="cart-items">${itemsHTML}</div>
        </div>`;
    }

    function createSidebar() {
        if (sidebarCreated) return;

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'cart-overlay wishlist-overlay';
        overlay.dataset.action = 'close-wishlist';
        document.body.appendChild(overlay);

        // Sidebar
        const sidebar = document.createElement('div');
        sidebar.className = 'cart-sidebar wishlist-sidebar';
        sidebar.id = 'wishlistSidebar';
        sidebar.innerHTML = renderSidebar();
        document.body.appendChild(sidebar);

        // Click handler
        sidebar.addEventListener('click', handleClick);
        overlay.addEventListener('click', () => closeSidebar());

        sidebarCreated = true;
    }

    function handleClick(e) {
        const action = e.target.closest('[data-action]')?.dataset.action;
        const id = e.target.closest('[data-id]')?.dataset.id;

        if (action === 'close-wishlist') {
            closeSidebar();
            return;
        }

        if (action === 'remove-wishlist' && id) {
            remove(id);
            return;
        }

        // Move to cart
        const moveBtn = e.target.closest('.wishlist-move-to-cart');
        if (moveBtn) {
            const itemId = moveBtn.dataset.id;
            const item = wishlistItems.find(i => i.id === itemId);
            if (item && window.PremamCart) {
                window.PremamCart.add(item);
                remove(itemId);
                if (window.PremamCart.showToast) {
                    window.PremamCart.showToast(`${item.name} moved to cart!`, 'success');
                }
            }
        }
    }

    function refreshSidebar() {
        const sidebar = document.getElementById('wishlistSidebar');
        if (sidebar) sidebar.innerHTML = renderSidebar();
    }

    function openSidebar() {
        createSidebar();
        refreshSidebar();
        requestAnimationFrame(() => {
            document.querySelector('.wishlist-overlay')?.classList.add('open');
            document.getElementById('wishlistSidebar')?.classList.add('open');
            document.body.style.overflow = 'hidden';
        });
    }

    function closeSidebar() {
        document.querySelector('.wishlist-overlay')?.classList.remove('open');
        document.getElementById('wishlistSidebar')?.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        load();
        updateBadges();

        // Wire up header wishlist icon
        document.querySelectorAll('.nav-icon[aria-label="Wishlist"]').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                openSidebar();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        add,
        remove,
        has,
        getItems,
        getCount,
        updateBadges,
        updateHeartButtons,
        openSidebar,
        closeSidebar,
        refreshSidebar
    };
})();

window.PremamWishlist = PremamWishlist;
