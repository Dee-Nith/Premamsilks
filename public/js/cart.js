/**
 * PREMAM SILKS — Shopping Cart Module
 * 
 * Production-grade cart management using localStorage.
 * Handles add/remove/update items, cart persistence, and UI updates.
 * 
 * Usage:
 *   PremamCart.add(product)
 *   PremamCart.remove(productId)
 *   PremamCart.updateQty(productId, qty)
 *   PremamCart.getItems()
 *   PremamCart.getTotal()
 */

const PremamCart = (function () {
    'use strict';

    const STORAGE_KEY = 'premam_cart';
    const CART_EXPIRY_DAYS = 7;
    let cartItems = [];
    let listeners = [];

    // ============================================================
    // PERSISTENCE (localStorage)
    // ============================================================

    function loadCart() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return [];

            const data = JSON.parse(stored);

            // Check expiry
            if (data.expiry && Date.now() > data.expiry) {
                localStorage.removeItem(STORAGE_KEY);
                return [];
            }

            return Array.isArray(data.items) ? data.items : [];
        } catch (e) {
            console.error('Error loading cart:', e);
            return [];
        }
    }

    function saveCart() {
        try {
            const data = {
                items: cartItems,
                expiry: Date.now() + (CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving cart:', e);
        }
    }

    // ============================================================
    // CART OPERATIONS
    // ============================================================

    /**
     * Add item to cart (or increment quantity if exists)
     * @param {Object} product - { id, name, price, image, category, originalPrice? }
     * @param {number} quantity - default 1
     */
    function add(product, quantity = 1) {
        if (!product || !product.id) {
            console.error('Invalid product: must have an id');
            return;
        }

        const existing = cartItems.find(item => item.id === product.id);

        if (existing) {
            existing.quantity += quantity;
        } else {
            cartItems.push({
                id: product.id,
                name: product.name || 'Untitled Saree',
                price: Number(product.price) || 0,
                originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
                image: product.image || 'images/placeholder.png',
                category: product.category || 'Silk Saree',
                quantity: quantity,
                addedAt: new Date().toISOString()
            });
        }

        saveCart();
        notifyListeners('add', product);
        showToast(`${product.name} added to cart!`);
    }

    /**
     * Remove item from cart
     * @param {string} productId
     */
    function remove(productId) {
        const index = cartItems.findIndex(item => item.id === productId);
        if (index === -1) return;

        const removed = cartItems.splice(index, 1)[0];
        saveCart();
        notifyListeners('remove', removed);
    }

    /**
     * Update item quantity
     * @param {string} productId
     * @param {number} quantity
     */
    function updateQty(productId, quantity) {
        const item = cartItems.find(item => item.id === productId);
        if (!item) return;

        if (quantity <= 0) {
            remove(productId);
            return;
        }

        item.quantity = quantity;
        saveCart();
        notifyListeners('update', item);
    }

    /**
     * Clear entire cart
     */
    function clear() {
        cartItems = [];
        saveCart();
        notifyListeners('clear', null);
    }

    /**
     * Get all cart items
     * @returns {Array}
     */
    function getItems() {
        return [...cartItems];
    }

    /**
     * Get total item count
     * @returns {number}
     */
    function getCount() {
        return cartItems.reduce((sum, item) => sum + item.quantity, 0);
    }

    /**
     * Get cart subtotal
     * @returns {number}
     */
    function getSubtotal() {
        return cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    /**
     * Get shipping cost
     * @returns {number}
     */
    function getShipping() {
        const config = window.PremamDB?.APP_CONFIG || { freeShippingThreshold: 25000, shippingCost: 500 };
        const subtotal = getSubtotal();
        return subtotal >= config.freeShippingThreshold ? 0 : config.shippingCost;
    }

    /**
     * Get GST amount
     * @returns {number}
     */
    function getGST() {
        const config = window.PremamDB?.APP_CONFIG || { gst: 5 };
        return Math.round(getSubtotal() * (config.gst / 100));
    }

    /**
     * Get total (subtotal + shipping + GST)
     * @returns {Object} { subtotal, shipping, gst, total }
     */
    function getTotal() {
        const subtotal = getSubtotal();
        const shipping = getShipping();
        const gst = getGST();
        return {
            subtotal,
            shipping,
            gst,
            total: subtotal + shipping + gst,
            freeShipping: shipping === 0
        };
    }

    /**
     * Check if product is in cart
     * @param {string} productId
     * @returns {boolean}
     */
    function has(productId) {
        return cartItems.some(item => item.id === productId);
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    /**
     * Subscribe to cart changes
     * @param {Function} callback - receives (action, item)
     * @returns {Function} unsubscribe function
     */
    function onChange(callback) {
        listeners.push(callback);
        return () => {
            listeners = listeners.filter(l => l !== callback);
        };
    }

    function notifyListeners(action, item) {
        listeners.forEach(cb => {
            try { cb(action, item); }
            catch (e) { console.error('Cart listener error:', e); }
        });
    }

    // ============================================================
    // UI HELPERS
    // ============================================================

    /**
     * Update all cart count badges on page
     */
    function updateBadges() {
        const count = getCount();
        document.querySelectorAll('.cart-count, .nav-icon[aria-label="Shopping Cart"] .badge').forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? '' : '';
        });
    }

    /**
     * Format price in INR
     * @param {number} amount
     * @returns {string}
     */
    function formatPrice(amount) {
        return '₹' + amount.toLocaleString('en-IN');
    }

    /**
     * Show toast notification
     * @param {string} message
     * @param {string} type - 'success', 'error', 'info'
     */
    function showToast(message, type = 'success') {
        // Remove existing toast
        const existingToast = document.querySelector('.cart-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `cart-toast cart-toast-${type}`;
        toast.innerHTML = `
      <div class="cart-toast-content">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          ${type === 'success'
                ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />'
                : type === 'error'
                    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />'
                    : '<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />'
            }
        </svg>
        <span>${message}</span>
      </div>
    `;

        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Render cart sidebar HTML
     * @returns {string}
     */
    function renderCartSidebar() {
        const items = getItems();
        const totals = getTotal();

        if (items.length === 0) {
            return `
        <div class="cart-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <h3>Your cart is empty</h3>
          <p>Looks like you haven't added any sarees yet.</p>
          <a href="shop.html" class="btn btn-primary">Browse Sarees</a>
        </div>
      `;
        }

        const itemsHTML = items.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-image">
          <img src="${item.image}" alt="${item.name}" loading="lazy">
        </div>
        <div class="cart-item-details">
          <span class="cart-item-category">${item.category}</span>
          <h4 class="cart-item-name">${item.name}</h4>
          <div class="cart-item-price">${formatPrice(item.price)}</div>
          <div class="cart-item-qty">
            <button class="qty-btn minus" data-id="${item.id}" aria-label="Decrease quantity">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-id="${item.id}" aria-label="Remove item">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    `).join('');

        return `
      <div class="cart-items">${itemsHTML}</div>
      <div class="cart-summary">
        <div class="cart-summary-row">
          <span>Subtotal</span>
          <span>${formatPrice(totals.subtotal)}</span>
        </div>
        <div class="cart-summary-row">
          <span>Shipping</span>
          <span>${totals.freeShipping ? '<span class="free-shipping">FREE</span>' : formatPrice(totals.shipping)}</span>
        </div>
        <div class="cart-summary-row">
          <span>GST (${window.PremamDB?.APP_CONFIG?.gst || 5}%)</span>
          <span>${formatPrice(totals.gst)}</span>
        </div>
        ${!totals.freeShipping ? `
          <div class="cart-free-shipping-msg">
            Add ${formatPrice((window.PremamDB?.APP_CONFIG?.freeShippingThreshold || 25000) - totals.subtotal)} more for free shipping!
          </div>
        ` : ''}
        <div class="cart-summary-row cart-total">
          <span>Total</span>
          <span>${formatPrice(totals.total)}</span>
        </div>
        <a href="checkout.html" class="btn btn-primary btn-block cart-checkout-btn">Proceed to Checkout</a>
        <a href="shop.html" class="btn btn-outline btn-block cart-continue-btn">Continue Shopping</a>
      </div>
    `;
    }

    // ============================================================
    // CART SIDEBAR TOGGLE
    // ============================================================

    let sidebarCreated = false;

    function createSidebar() {
        if (sidebarCreated) return;

        const overlay = document.createElement('div');
        overlay.className = 'cart-overlay';
        overlay.id = 'cartOverlay';

        const sidebar = document.createElement('div');
        sidebar.className = 'cart-sidebar';
        sidebar.id = 'cartSidebar';
        sidebar.innerHTML = `
      <div class="cart-sidebar-header">
        <h3>Shopping Cart <span class="cart-header-count">(${getCount()})</span></h3>
        <button class="cart-sidebar-close" id="cartClose" aria-label="Close cart">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="cart-sidebar-body" id="cartSidebarBody">
        ${renderCartSidebar()}
      </div>
    `;

        document.body.appendChild(overlay);
        document.body.appendChild(sidebar);

        // Event delegation for cart actions
        sidebar.addEventListener('click', handleSidebarClick);
        overlay.addEventListener('click', closeSidebar);
        document.getElementById('cartClose').addEventListener('click', closeSidebar);

        sidebarCreated = true;
    }

    function handleSidebarClick(e) {
        const target = e.target.closest('[data-id]');
        if (!target) return;

        const productId = target.dataset.id;

        if (target.classList.contains('minus')) {
            const item = cartItems.find(i => i.id === productId);
            if (item) updateQty(productId, item.quantity - 1);
            refreshSidebar();
        } else if (target.classList.contains('plus')) {
            const item = cartItems.find(i => i.id === productId);
            if (item) updateQty(productId, item.quantity + 1);
            refreshSidebar();
        } else if (target.classList.contains('cart-item-remove')) {
            remove(productId);
            refreshSidebar();
        }
    }

    function refreshSidebar() {
        const body = document.getElementById('cartSidebarBody');
        const headerCount = document.querySelector('.cart-header-count');
        if (body) body.innerHTML = renderCartSidebar();
        if (headerCount) headerCount.textContent = `(${getCount()})`;
        updateBadges();
    }

    function openSidebar() {
        createSidebar();
        refreshSidebar();

        const sidebar = document.getElementById('cartSidebar');
        const overlay = document.getElementById('cartOverlay');

        requestAnimationFrame(() => {
            sidebar.classList.add('open');
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        });
    }

    function closeSidebar() {
        const sidebar = document.getElementById('cartSidebar');
        const overlay = document.getElementById('cartOverlay');

        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ============================================================
    // INITIALIZE
    // ============================================================

    function init() {
        cartItems = loadCart();
        updateBadges();

        // Auto-update badges on cart changes
        onChange(() => updateBadges());

        // Bind cart icon clicks to open sidebar
        document.querySelectorAll('a[aria-label="Shopping Cart"], .nav-icon[aria-label="Shopping Cart"]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                openSidebar();
            });
        });

        console.log(`🛒 Cart initialized with ${getCount()} items`);
    }

    // Auto-init when DOM ready
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
        updateQty,
        clear,
        getItems,
        getCount,
        getSubtotal,
        getShipping,
        getGST,
        getTotal,
        has,
        onChange,
        updateBadges,
        formatPrice,
        showToast,
        openSidebar,
        closeSidebar,
        refreshSidebar
    };

})();

// Make globally available
window.PremamCart = PremamCart;
