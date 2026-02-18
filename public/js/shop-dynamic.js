/**
 * Shop Dynamic — Loads products from Firestore and renders them on the shop page.
 * Supports filtering by category, color, price, occasion, plus sorting.
 */
(function () {
    'use strict';

    // -------------------------------------------------------
    // State
    // -------------------------------------------------------
    let allProducts = [];
    let filteredProducts = [];
    let displayCount = 12;
    const BATCH_SIZE = 12;

    // Active filters
    const activeFilters = {
        categories: [],
        colors: [],
        priceRanges: [],
        occasions: []
    };

    let currentSort = 'featured';

    // -------------------------------------------------------
    // DOM references
    // -------------------------------------------------------
    const grid = document.getElementById('productsGrid');
    const resultsCount = document.querySelector('.results-count strong');
    const sortSelect = document.getElementById('sortSelect');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const filterToggle = document.getElementById('filterToggle');
    const filterSidebar = document.getElementById('filterSidebar');
    const loadMoreSection = document.getElementById('loadMoreSection');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    // -------------------------------------------------------
    // Format helpers
    // -------------------------------------------------------
    function formatPrice(amount) {
        return '₹' + Number(amount).toLocaleString('en-IN');
    }

    // -------------------------------------------------------
    // Product card HTML
    // -------------------------------------------------------
    function productCardHTML(p) {
        const mainImg = (p.images && p.images.length > 0) ? p.images[0] : (p.image || 'images/placeholder.png');
        const discount = p.originalPrice && p.originalPrice > p.price
            ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;

        const badgeMap = {
            new: 'New',
            sale: 'Sale',
            bestseller: 'Bestseller',
            exclusive: 'Exclusive'
        };

        let badgeHTML = '';
        if (p.badge && badgeMap[p.badge]) {
            badgeHTML = `<span class="product-badge ${p.badge}">${badgeMap[p.badge]}</span>`;
        } else if (discount >= 15) {
            badgeHTML = `<span class="product-badge sale">${discount}% Off</span>`;
        }

        const discountTagHTML = discount > 0
            ? `<span class="discount-tag">${discount}% OFF</span>` : '';

        const originalPriceHTML = p.originalPrice && p.originalPrice > p.price
            ? `<span class="original">${formatPrice(p.originalPrice)}</span>` : '';

        const whatsappMsg = encodeURIComponent(`Hi! I'm interested in ${p.name}${p.sareeCode ? ` (${p.sareeCode})` : ''}. Can you share more details?`);
        const whatsappLink = `https://wa.me/917200123457?text=${whatsappMsg}`;

        return `
        <div class="product-card" data-category="${p.category || ''}" data-color="${p.color || ''}" data-price="${p.price || 0}" data-id="${p.id}">
            <div class="product-image">
                <img src="${mainImg}" alt="${p.name}" class="main-image" loading="lazy" onerror="this.src='images/placeholder.png'">
                ${badgeHTML ? `<div class="product-badges">${badgeHTML}</div>` : ''}
                <div class="product-actions">
                    <a href="${whatsappLink}" target="_blank" class="product-action-btn" aria-label="Enquire on WhatsApp" title="Enquire on WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                        </svg>
                    </a>
                    <button class="product-action-btn wishlist-heart-btn${(window.PremamWishlist && window.PremamWishlist.has(p.id)) ? ' active' : ''}" aria-label="Add to Wishlist" title="Add to Wishlist"
                        data-product-id="${p.id}"
                        data-product-name="${(p.name || '').replace(/"/g, '&quot;')}"
                        data-product-price="${p.price || 0}"
                        data-product-original-price="${p.originalPrice || 0}"
                        data-product-image="${mainImg.replace(/"/g, '&quot;')}"
                        data-product-category="${p.category || ''}"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="product-info">
                <span class="product-category">${p.category || 'Saree'}</span>
                <h4 class="product-name">${p.name || 'Untitled'}</h4>
                ${p.sareeCode ? `<small style="color:#8a7e6b;font-size:0.7rem;">${p.sareeCode}</small>` : ''}
                <div class="product-price">
                    <span class="current">${formatPrice(p.price || 0)}</span>
                    ${originalPriceHTML}
                    ${discountTagHTML}
                </div>
                <button class="product-add-to-cart-btn add-to-cart-btn"
                    data-product-id="${p.id}"
                    data-product-name="${(p.name || '').replace(/"/g, '&quot;')}"
                    data-product-price="${p.price || 0}"
                    data-product-image="${mainImg.replace(/"/g, '&quot;')}"
                    data-product-category="${p.category || ''}"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    Add to Cart
                </button>
            </div>
        </div>`;
    }

    // -------------------------------------------------------
    // Render products
    // -------------------------------------------------------
    function renderProducts() {
        if (!grid) return;

        const visible = filteredProducts.slice(0, displayCount);

        if (visible.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="#6b5e4f" stroke-width="1.5" style="margin:0 auto 16px;">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <h3 style="color:#d4c5a9;font-family:'Cormorant Garamond',serif;font-size:1.6rem;margin-bottom:8px;">No products found</h3>
                    <p style="color:#8a7e6b;font-size:0.9rem;">Try adjusting your filters or check back later for new arrivals.</p>
                </div>`;
        } else {
            grid.innerHTML = visible.map(p => productCardHTML(p)).join('');
        }

        // Update count
        if (resultsCount) {
            resultsCount.textContent = filteredProducts.length;
        }

        // Show/hide load more
        if (loadMoreSection) {
            loadMoreSection.style.display = filteredProducts.length > displayCount ? 'flex' : 'none';
        }
    }

    // -------------------------------------------------------
    // Filter & sort logic
    // -------------------------------------------------------
    function applyFiltersAndSort() {
        filteredProducts = allProducts.filter(p => {
            // Only show active products
            if (p.isActive === false) return false;

            // Category filter
            if (activeFilters.categories.length > 0) {
                if (!activeFilters.categories.includes(p.category?.toLowerCase())) return false;
            }

            // Color filter
            if (activeFilters.colors.length > 0) {
                if (!activeFilters.colors.includes(p.color?.toLowerCase())) return false;
            }

            // Occasion filter
            if (activeFilters.occasions.length > 0) {
                if (!activeFilters.occasions.includes(p.occasion?.toLowerCase())) return false;
            }

            // Price range filter
            if (activeFilters.priceRanges.length > 0) {
                const price = p.price || 0;
                const inRange = activeFilters.priceRanges.some(range => {
                    switch (range) {
                        case 'under-25000': return price < 25000;
                        case '25000-50000': return price >= 25000 && price <= 50000;
                        case '50000-100000': return price >= 50000 && price <= 100000;
                        case 'above-100000': return price > 100000;
                        default: return true;
                    }
                });
                if (!inRange) return false;
            }

            return true;
        });

        // Sort
        switch (currentSort) {
            case 'price-low':
                filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
                break;
            case 'price-high':
                filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case 'newest':
                filteredProducts.sort((a, b) => {
                    const da = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
                    const db = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
                    return db - da;
                });
                break;
            case 'bestselling':
                filteredProducts.sort((a, b) => {
                    const bScore = (b.badge === 'bestseller' ? 1 : 0);
                    const aScore = (a.badge === 'bestseller' ? 1 : 0);
                    return bScore - aScore;
                });
                break;
            case 'featured':
            default:
                filteredProducts.sort((a, b) => {
                    const aFeat = a.featured ? 1 : 0;
                    const bFeat = b.featured ? 1 : 0;
                    return bFeat - aFeat;
                });
                break;
        }

        displayCount = BATCH_SIZE;
        renderProducts();
    }

    // -------------------------------------------------------
    // Filter event listeners
    // -------------------------------------------------------
    function initFilters() {
        // Category checkboxes
        document.querySelectorAll('input[name="category"]').forEach(cb => {
            cb.addEventListener('change', () => {
                activeFilters.categories = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(el => el.value);
                applyFiltersAndSort();
            });
        });

        // Color swatches
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                swatch.classList.toggle('active');
                activeFilters.colors = Array.from(document.querySelectorAll('.color-swatch.active')).map(el => el.dataset.color);
                applyFiltersAndSort();
            });
        });

        // Price range checkboxes
        document.querySelectorAll('input[name="price"]').forEach(cb => {
            cb.addEventListener('change', () => {
                activeFilters.priceRanges = Array.from(document.querySelectorAll('input[name="price"]:checked')).map(el => el.value);
                applyFiltersAndSort();
            });
        });

        // Occasion checkboxes
        document.querySelectorAll('input[name="occasion"]').forEach(cb => {
            cb.addEventListener('change', () => {
                activeFilters.occasions = Array.from(document.querySelectorAll('input[name="occasion"]:checked')).map(el => el.value);
                applyFiltersAndSort();
            });
        });

        // Sort
        sortSelect?.addEventListener('change', (e) => {
            currentSort = e.target.value;
            applyFiltersAndSort();
        });

        // Clear filters
        clearFiltersBtn?.addEventListener('click', () => {
            document.querySelectorAll('.shop-sidebar input[type="checkbox"]:checked').forEach(cb => cb.checked = false);
            document.querySelectorAll('.color-swatch.active').forEach(s => s.classList.remove('active'));
            activeFilters.categories = [];
            activeFilters.colors = [];
            activeFilters.priceRanges = [];
            activeFilters.occasions = [];
            currentSort = 'featured';
            if (sortSelect) sortSelect.value = 'featured';
            applyFiltersAndSort();
        });

        // Filter toggle (mobile)
        filterToggle?.addEventListener('click', () => {
            filterSidebar?.classList.toggle('open');
        });

        // Load more
        loadMoreBtn?.addEventListener('click', () => {
            displayCount += BATCH_SIZE;
            renderProducts();
        });
    }

    // -------------------------------------------------------
    // Fetch products from Firestore
    // -------------------------------------------------------
    async function loadProducts() {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection('products')
                .where('isActive', '!=', false)
                .orderBy('isActive')
                .orderBy('createdAt', 'desc')
                .get();

            allProducts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            console.log(`🛍️ Loaded ${allProducts.length} products from Firestore`);
        } catch (err) {
            console.warn('Could not load products from Firestore, trying without filter:', err.message);

            try {
                const db = firebase.firestore();
                const snapshot = await db.collection('products').get();
                allProducts = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(p => p.isActive !== false);
                console.log(`🛍️ Loaded ${allProducts.length} products (fallback)`);
            } catch (err2) {
                console.error('Failed to load products:', err2);
                allProducts = [];
            }
        }

        applyFiltersAndSort();
    }

    // -------------------------------------------------------
    // Init
    // -------------------------------------------------------
    function init() {
        initFilters();
        initCartButtons();
        loadProducts();
    }

    // -------------------------------------------------------
    // Cart & Wishlist button handlers (delegated)
    // -------------------------------------------------------
    function initCartButtons() {
        if (!grid) return;
        grid.addEventListener('click', (e) => {
            // Cart button
            const cartBtn = e.target.closest('.add-to-cart-btn:not(.wishlist-heart-btn)');
            if (cartBtn) {
                e.stopPropagation();
                const product = {
                    id: cartBtn.dataset.productId,
                    name: cartBtn.dataset.productName,
                    price: Number(cartBtn.dataset.productPrice),
                    image: cartBtn.dataset.productImage,
                    category: cartBtn.dataset.productCategory
                };
                if (window.PremamCart && typeof window.PremamCart.add === 'function') {
                    window.PremamCart.add(product);
                    window.PremamCart.openSidebar();
                }
                return;
            }

            // Wishlist heart button
            const heartBtn = e.target.closest('.wishlist-heart-btn');
            if (heartBtn) {
                e.stopPropagation();
                const id = heartBtn.dataset.productId;
                if (window.PremamWishlist) {
                    if (window.PremamWishlist.has(id)) {
                        window.PremamWishlist.remove(id);
                        heartBtn.classList.remove('active');
                    } else {
                        window.PremamWishlist.add({
                            id: id,
                            name: heartBtn.dataset.productName,
                            price: Number(heartBtn.dataset.productPrice),
                            originalPrice: Number(heartBtn.dataset.productOriginalPrice),
                            image: heartBtn.dataset.productImage,
                            category: heartBtn.dataset.productCategory
                        });
                        heartBtn.classList.add('active');
                    }
                }
                return;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
