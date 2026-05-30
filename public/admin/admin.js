/**
 * PREMAM SILKS — Admin Dashboard JavaScript
 * 
 * Handles authentication, tab navigation, product CRUD,
 * order management, and dashboard statistics.
 */

const AdminApp = (function () {
    'use strict';

    let currentUser = null;
    let currentTab = 'dashboard';
    let allProducts = [];
    let allOrders = [];
    let allCoupons = [];
    let pendingImageFiles = []; // Files staged for upload (derived from imageItems on save)
    let existingImageUrls = []; // Already-uploaded image URLs (derived from imageItems on save)
    let imageItems = []; // Unified ordered list: { kind: 'url'|'file', value: string|File }
    let dragSrcIndex = null;
    let storage = null; // Firebase Storage reference

    // ============================================================
    // AUTHENTICATION
    // ============================================================

    function initAuth() {
        const signInBtn = document.getElementById('googleSignInBtn');
        const logoutBtn = document.getElementById('logoutBtn');

        signInBtn?.addEventListener('click', async () => {
            try {
                signInBtn.textContent = 'Signing in...';
                signInBtn.disabled = true;

                if (window.PremamDB && typeof window.PremamDB.signInWithGoogle === 'function') {
                    const result = await window.PremamDB.signInWithGoogle();
                    handleAuthSuccess(result.user);
                } else {
                    // Offline/demo mode
                    handleOfflineLogin();
                }
            } catch (error) {
                console.warn('Sign-in failed, entering demo mode:', error.message);
                // Fallback to demo mode when Firebase auth fails (e.g. placeholder API keys)
                handleOfflineLogin();
            }
        });

        logoutBtn?.addEventListener('click', async () => {
            try {
                if (window.PremamDB) await window.PremamDB.signOut();
                currentUser = null;
                showLogin();
                showNotification('Signed out successfully', 'info');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });

        // Listen for auth state changes (Firebase)
        if (window.PremamDB && typeof window.PremamDB.onAuthStateChange === 'function') {
            window.PremamDB.onAuthStateChange((user, isAdmin) => {
                if (user && isAdmin) {
                    handleAuthSuccess(user);
                } else if (user && !isAdmin) {
                    showNotification('Access denied. Your email is not authorized.', 'error');
                    if (window.PremamDB) window.PremamDB.signOut();
                    showLogin();
                }
            });
        }
    }

    function handleAuthSuccess(user) {
        currentUser = user;

        // Update UI
        const nameEl = document.getElementById('adminName');
        const emailEl = document.getElementById('adminEmail');
        const avatarEl = document.getElementById('adminAvatar');

        if (nameEl) nameEl.textContent = user.displayName || 'Admin';
        if (emailEl) emailEl.textContent = user.email || '';
        if (avatarEl) avatarEl.textContent = (user.displayName || 'A').charAt(0).toUpperCase();

        showAdmin();
        loadDashboardData();
    }

    function handleOfflineLogin() {
        // Demo mode disabled in production — show error instead
        showLogin();
        showNotification('Firebase connection required. Please check your internet connection and try again.', 'error');
    }

    function showLogin() {
        document.getElementById('loginScreen').style.display = '';
        document.getElementById('adminLayout').style.display = 'none';
    }

    function showAdmin() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminLayout').style.display = 'flex';
    }

    // ============================================================
    // TAB NAVIGATION
    // ============================================================

    function initTabs() {
        document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.dataset.tab;
                switchTab(tab);
            });
        });

        // "View All" links on dashboard
        document.querySelectorAll('[data-goto]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(link.dataset.goto);
            });
        });
    }

    function switchTab(tab) {
        currentTab = tab;

        // Update sidebar active state
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.sidebar-link[data-tab="${tab}"]`)?.classList.add('active');

        // Show tab content
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tab}`)?.classList.add('active');

        // Update page title
        const titles = { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', coupons: 'Coupons', activity: 'Activity Log', settings: 'Settings' };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = titles[tab] || tab;

        // Load tab-specific data
        if (tab === 'products') loadProducts();
        if (tab === 'orders') loadOrders();
        if (tab === 'coupons') loadCoupons();
        if (tab === 'activity') loadActivity();

        // Close mobile sidebar
        document.getElementById('adminSidebar')?.classList.remove('open');
    }

    // ============================================================
    // DASHBOARD DATA
    // ============================================================

    async function loadDashboardData() {
        try {
            if (db) {
                // Load from Firestore
                const [ordersSnap, productsSnap] = await Promise.all([
                    db.collection('orders').orderBy('createdAt', 'desc').limit(50).get(),
                    db.collection('products').get()
                ]);

                allOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                allProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                // Demo data
                allOrders = getDemoOrders();
                allProducts = getDemoProducts();
            }

            updateMetrics();
            updateProductStats();
            renderRecentOrders();
            renderAllCharts();
        } catch (error) {
            console.error('Error loading dashboard:', error);
            // Fallback to demo
            allOrders = getDemoOrders();
            allProducts = getDemoProducts();
            updateMetrics();
            updateProductStats();
            renderRecentOrders();
            renderAllCharts();
        }
    }

    function updateMetrics() {
        const totalRev = allOrders
            .filter(o => o.status === 'paid' || o.status === 'delivered' || o.status === 'shipped')
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        document.getElementById('totalRevenue').textContent = formatPrice(totalRev);
        document.getElementById('totalOrders').textContent = allOrders.length;
        document.getElementById('totalProducts').textContent = allProducts.length;

        // Unique customers
        const customers = new Set(allOrders.map(o => o.customer?.email || o.customer?.phone).filter(Boolean));
        document.getElementById('totalCustomers').textContent = customers.size;

        // Quick stats
        const paidOrders = allOrders.filter(o => ['paid', 'delivered', 'shipped', 'processing'].includes(o.status));
        document.getElementById('avgOrderValue').textContent = paidOrders.length
            ? formatPrice(Math.round(totalRev / paidOrders.length))
            : '₹0';
        document.getElementById('pendingOrders').textContent = allOrders.filter(o => o.status === 'pending').length;
        document.getElementById('completedOrders').textContent = allOrders.filter(o => o.status === 'delivered').length;

        // Top category
        const catCount = {};
        allProducts.forEach(p => { catCount[p.category] = (catCount[p.category] || 0) + 1; });
        const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('topCategory').textContent = topCat ? topCat[0] : '—';
    }

    function renderRecentOrders() {
        const tbody = document.getElementById('recentOrdersBody');
        if (!tbody) return;

        const recent = allOrders.slice(0, 5);

        if (recent.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state-small">No orders yet.</div></td></tr>';
            return;
        }

        tbody.innerHTML = recent.map(order => `
      <tr>
        <td><strong>#${(order.id || '').slice(-8).toUpperCase()}</strong></td>
        <td>${order.customer?.name || '—'}</td>
        <td>${order.itemCount || (order.items?.length || '—')}</td>
        <td>${formatPrice(order.totalAmount || 0)}</td>
        <td><span class="status-badge status-${order.status}">${order.status}</span></td>
        <td>${formatDate(order.createdAt)}</td>
      </tr>
    `).join('');
    }

    // ============================================================
    // PRODUCTS MANAGEMENT
    // ============================================================

    async function loadProducts() {
        try {
            if (db) {
                const snap = await db.collection('products').orderBy('createdAt', 'desc').get();
                allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error loading products:', error);
        }

        renderProducts();
        updateProductStats();
    }

    function updateProductStats() {
        const total = allProducts.length;
        const active = allProducts.filter(p => p.isActive !== false).length;
        const inactive = total - active;

        // Count sold from orders
        let soldCount = 0;
        allOrders.forEach(o => {
            if (['paid', 'delivered', 'shipped', 'processing'].includes(o.status)) {
                if (o.items) soldCount += o.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                else soldCount++;
            }
        });

        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('statTotalProducts', total);
        el('statActiveProducts', active);
        el('statInactiveProducts', inactive);
        el('statSoldProducts', soldCount);
    }

    function renderProducts(searchQuery = '') {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        let products = allProducts;

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            products = products.filter(p =>
                p.name?.toLowerCase().includes(q) ||
                p.category?.toLowerCase().includes(q) ||
                p.sareeCode?.toLowerCase().includes(q)
            );
        }

        // Price range filter
        const priceFilter = document.getElementById('productPriceFilter')?.value;
        if (priceFilter) {
            products = products.filter(p => {
                const price = p.price || 0;
                switch (priceFilter) {
                    case 'under-10000': return price < 10000;
                    case '10000-25000': return price >= 10000 && price <= 25000;
                    case '25000-50000': return price >= 25000 && price <= 50000;
                    case '50000-100000': return price >= 50000 && price <= 100000;
                    case 'above-100000': return price > 100000;
                    default: return true;
                }
            });
        }

        // Category filter
        const catFilter = document.getElementById('productCategoryFilter')?.value;
        if (catFilter) {
            products = products.filter(p => p.category?.toLowerCase() === catFilter);
        }

        // Status filter
        const statusFilter = document.getElementById('productStatusFilter')?.value;
        if (statusFilter) {
            if (statusFilter === 'active') products = products.filter(p => p.isActive !== false);
            else if (statusFilter === 'inactive') products = products.filter(p => p.isActive === false);
        }

        if (products.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state-small">No products found.</div></td></tr>';
            return;
        }

        const mainImage = (p) => {
            if (p.images && p.images.length > 0) return p.images[0];
            return p.image || '../images/placeholder.png';
        };

        const badgeHtml = (badge) => {
            if (!badge) return '';
            const colors = { new: '#4299e1', sale: '#e53e3e', bestseller: '#d4a853', exclusive: '#9f7aea' };
            return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:${colors[badge] || '#666'}20;color:${colors[badge] || '#666'};margin-left:6px;">${badge}</span>`;
        };

        tbody.innerHTML = products.map(p => `
      <tr>
        <td><img class="table-product-img" src="${mainImage(p)}" alt="${p.name}" onerror="this.src='../images/placeholder.png'"></td>
        <td>
            <strong>${p.name || 'Untitled'}</strong>${badgeHtml(p.badge)}
            ${p.sareeCode ? `<br><small style="color:var(--admin-text-muted);font-size:0.72rem;">${p.sareeCode}</small>` : ''}
        </td>
        <td>${p.category || '—'}</td>
        <td>${formatPrice(p.price || 0)}</td>
        <td>${p.stock ?? '—'}</td>
        <td><span class="status-badge ${p.isActive !== false ? 'status-active' : 'status-inactive'}">${p.isActive !== false ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="table-actions">
            <button class="table-action-btn" onclick="AdminApp.editProduct('${p.id}')" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button class="table-action-btn danger" onclick="AdminApp.deleteProduct('${p.id}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    }

    function initProductModal() {
        const addBtn = document.getElementById('addProductBtn');
        const overlay = document.getElementById('productModalOverlay');
        const closeBtn = document.getElementById('modalClose');
        const cancelBtn = document.getElementById('modalCancelBtn');
        const form = document.getElementById('productForm');
        const searchInput = document.getElementById('productSearch');

        addBtn?.addEventListener('click', () => openProductModal());
        closeBtn?.addEventListener('click', () => closeProductModal());
        cancelBtn?.addEventListener('click', () => closeProductModal());
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) closeProductModal();
        });

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            saveProduct();
        });

        searchInput?.addEventListener('input', (e) => {
            renderProducts(e.target.value);
        });

        // Filter dropdowns
        document.getElementById('productPriceFilter')?.addEventListener('change', () => {
            renderProducts(searchInput?.value || '');
        });
        document.getElementById('productCategoryFilter')?.addEventListener('change', () => {
            renderProducts(searchInput?.value || '');
        });
        document.getElementById('productStatusFilter')?.addEventListener('change', () => {
            renderProducts(searchInput?.value || '');
        });

        // Image upload handlers
        initImageUpload();
    }

    function initImageUpload() {
        const zone = document.getElementById('imageUploadZone');
        const fileInput = document.getElementById('imageFileInput');
        if (!zone || !fileInput) return;

        zone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            handleFileSelect(e.dataTransfer.files);
        });
    }

    async function compressImage(file, quality = 0.85, maxDim = 2400) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width > maxDim || height > maxDim) {
                        const ratio = Math.min(maxDim / width, maxDim / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (!blob || blob.size >= file.size) {
                            resolve(file);
                            return;
                        }
                        const originalMB = (file.size / 1024 / 1024).toFixed(1);
                        const newMB = (blob.size / 1024 / 1024).toFixed(1);
                        console.log(`Compressed ${file.name}: ${originalMB}MB → ${newMB}MB`);
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    }, 'image/jpeg', quality);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function handleFileSelect(files) {
        if (!files || files.length === 0) return;
        const maxSize = 10 * 1024 * 1024; // 10MB hard limit after compression

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                showNotification(`${file.name} is not an image file.`, 'error');
                continue;
            }

            const compressed = await compressImage(file);

            if (compressed.size > maxSize) {
                showNotification(`${file.name} is too large even after compression. Please use a smaller image.`, 'error');
                continue;
            }

            imageItems.push({ kind: 'file', value: compressed });
        }

        renderImagePreviews();
        document.getElementById('imageFileInput').value = '';
    }

    function renderImagePreviews() {
        const container = document.getElementById('imagePreviews');
        if (!container) return;
        container.innerHTML = '';

        imageItems.forEach((it, idx) => {
            const item = document.createElement('div');
            item.className = 'image-preview-item';
            item.draggable = true;
            item.dataset.index = idx;
            item.title = 'Drag to reorder. First image is the main image.';
            item.innerHTML = `
                <img alt="Image ${idx + 1}">
                <button type="button" class="image-preview-remove" data-index="${idx}" title="Remove">&times;</button>
            `;
            const imgEl = item.querySelector('img');
            if (it.kind === 'url') {
                imgEl.src = it.value;
            } else {
                const reader = new FileReader();
                reader.onload = (e) => { imgEl.src = e.target.result; };
                reader.readAsDataURL(it.value);
                imgEl.alt = it.value.name || `Image ${idx + 1}`;
            }
            attachDragHandlers(item);
            container.appendChild(item);
        });

        // Event delegation for remove buttons
        container.onclick = (e) => {
            const btn = e.target.closest('.image-preview-remove');
            if (!btn) return;
            const index = parseInt(btn.dataset.index);
            imageItems.splice(index, 1);
            renderImagePreviews();
        };
    }

    function attachDragHandlers(el) {
        el.addEventListener('dragstart', (e) => {
            dragSrcIndex = parseInt(el.dataset.index);
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            // Required for Firefox to start drag
            try { e.dataTransfer.setData('text/plain', String(dragSrcIndex)); } catch (_) {}
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            document.querySelectorAll('.image-preview-item.drag-over').forEach(n => n.classList.remove('drag-over'));
            dragSrcIndex = null;
        });
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => {
            el.classList.remove('drag-over');
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const targetIndex = parseInt(el.dataset.index);
            if (dragSrcIndex === null || isNaN(targetIndex) || dragSrcIndex === targetIndex) return;
            const [moved] = imageItems.splice(dragSrcIndex, 1);
            imageItems.splice(targetIndex, 0, moved);
            renderImagePreviews();
        });
    }

    // Cloudinary configuration
    const CLOUDINARY_CLOUD_NAME = 'dpcrthldo';
    const CLOUDINARY_UPLOAD_PRESET = 'premam_silks';

    async function uploadImages(sareeCode) {
        if (pendingImageFiles.length === 0) return [];

        const uploadedUrls = [];
        const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

        for (let i = 0; i < pendingImageFiles.length; i++) {
            const file = pendingImageFiles[i];

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                formData.append('folder', `premam-silks/${sareeCode}`);

                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `Upload failed: ${response.statusText}`);
                }

                const data = await response.json();
                // Use Cloudinary auto-optimized URL
                const optimizedUrl = data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
                uploadedUrls.push(optimizedUrl);
                console.log(`✅ Uploaded to Cloudinary: ${file.name}`);
            } catch (err) {
                console.error('Cloudinary upload error:', err);
                showNotification(`Failed to upload ${file.name}: ${err.message}`, 'error');
                logActivity('upload_failed', file.name, `Error: ${err.message} | Saree: ${sareeCode}`);
                // Don't fall back to base64 — it exceeds Firestore limits
            }
        }

        return uploadedUrls;
    }

    function fileToDataUrl(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    // Auto-calculate discount % in admin form
    function updateDiscountDisplay() {
        const price = Number(document.getElementById('productPrice').value) || 0;
        const originalPrice = Number(document.getElementById('productOriginalPrice').value) || 0;
        const display = document.getElementById('discountDisplay');
        const percentEl = document.getElementById('discountPercent');
        if (!display || !percentEl) return;

        if (originalPrice > price && price > 0) {
            const discount = Math.round(((originalPrice - price) / originalPrice) * 100);
            percentEl.textContent = discount;
            display.style.display = 'block';
        } else {
            display.style.display = 'none';
        }
    }

    // Attach listeners for live discount calculation
    document.getElementById('productPrice')?.addEventListener('input', updateDiscountDisplay);
    document.getElementById('productOriginalPrice')?.addEventListener('input', updateDiscountDisplay);

    function openProductModal(product = null) {
        const overlay = document.getElementById('productModalOverlay');
        const title = document.getElementById('modalTitle');

        // Reset form & image state
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        document.getElementById('productActive').checked = true;
        pendingImageFiles = [];
        existingImageUrls = [];
        imageItems = [];
        renderImagePreviews();
        updateDiscountDisplay();

        if (product) {
            title.textContent = 'Edit Product';
            document.getElementById('productId').value = product.id;
            document.getElementById('productCode').value = product.sareeCode || '';
            document.getElementById('productName').value = product.name || '';
            document.getElementById('productCategory').value = product.category || '';
            document.getElementById('productColor').value = product.color || '';
            document.getElementById('productPrice').value = product.price || '';
            document.getElementById('productOriginalPrice').value = product.originalPrice || '';
            document.getElementById('productStock').value = product.stock ?? 10;
            document.getElementById('productOccasion').value = product.occasion || '';
            document.getElementById('productBadge').value = product.badge || '';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productFeatured').checked = product.featured || false;
            document.getElementById('productActive').checked = product.isActive !== false;

            // Auto-calculate discount
            updateDiscountDisplay();

            // Handle images
            if (product.images && product.images.length > 0) {
                imageItems = product.images.map(url => ({ kind: 'url', value: url }));
                renderImagePreviews();
            } else if (product.image) {
                document.getElementById('productImage').value = product.image;
            }
        } else {
            title.textContent = 'Add New Product';
        }

        renderImagePreviews();
        overlay.classList.add('open');
    }

    function closeProductModal() {
        document.getElementById('productModalOverlay').classList.remove('open');
    }

    async function saveProduct() {
        const id = document.getElementById('productId').value;
        const sareeCode = document.getElementById('productCode').value.trim();
        const urlImage = document.getElementById('productImage').value.trim();

        const productData = {
            sareeCode: sareeCode,
            name: document.getElementById('productName').value.trim(),
            category: document.getElementById('productCategory').value,
            color: document.getElementById('productColor').value,
            price: Number(document.getElementById('productPrice').value) || 0,
            originalPrice: Number(document.getElementById('productOriginalPrice').value) || null,
            stock: Number(document.getElementById('productStock').value) || 0,
            occasion: document.getElementById('productOccasion').value,
            badge: document.getElementById('productBadge').value,
            description: document.getElementById('productDescription').value.trim(),
            featured: document.getElementById('productFeatured').checked,
            isActive: document.getElementById('productActive').checked,
        };

        if (!sareeCode || !productData.name || !productData.category || !productData.price) {
            showNotification('Please fill in saree code, name, category, and price.', 'error');
            return;
        }

        // Show saving state
        const saveBtn = document.getElementById('modalSaveBtn');
        const origText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        try {
            // Sync derived arrays from the unified ordered list
            pendingImageFiles = imageItems.filter(it => it.kind === 'file').map(it => it.value);
            existingImageUrls = imageItems.filter(it => it.kind === 'url').map(it => it.value);

            // Upload any pending images
            let newImageUrls = [];
            if (pendingImageFiles.length > 0) {
                saveBtn.textContent = 'Uploading images...';
                newImageUrls = await uploadImages(sareeCode);
            }

            // Gate: If images were pending but all failed, abort the save
            if (pendingImageFiles.length > 0 && newImageUrls.length === 0) {
                showNotification('Image upload failed. Please try a smaller image (under 10MB) and save again.', 'error');
                saveBtn.textContent = origText;
                saveBtn.disabled = false;
                return;
            }

            // Warn if only some images failed
            if (pendingImageFiles.length > 0 && newImageUrls.length < pendingImageFiles.length) {
                showNotification(`${pendingImageFiles.length - newImageUrls.length} image(s) failed to upload. Product saved with ${newImageUrls.length} image(s).`, 'warning');
            }

            // Weave uploaded URLs back into the user-defined order
            let uploadIdx = 0;
            const allImages = imageItems.map(it => {
                if (it.kind === 'url') return it.value;
                return newImageUrls[uploadIdx++] || null;
            }).filter(Boolean);

            // Set images array and backwards-compatible image field
            if (allImages.length > 0) {
                productData.images = allImages;
                productData.image = allImages[0];
            } else if (urlImage) {
                productData.image = urlImage;
                productData.images = [urlImage];
            }

            if (db) {
                if (id) {
                    await db.collection('products').doc(id).update({
                        ...productData,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    logActivity('product_updated', productData.name, `Code: ${sareeCode} | Price: ${formatPrice(productData.price)} | Category: ${productData.category}`);
                    showNotification('Product updated successfully!', 'success');
                } else {
                    await db.collection('products').add({
                        ...productData,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    logActivity('product_added', productData.name, `Code: ${sareeCode} | Price: ${formatPrice(productData.price)} | Category: ${productData.category}`);
                    showNotification('Product added successfully!', 'success');
                }
            } else {
                if (id) {
                    const idx = allProducts.findIndex(p => p.id === id);
                    if (idx >= 0) allProducts[idx] = { ...allProducts[idx], ...productData };
                } else {
                    allProducts.unshift({ id: 'demo-' + Date.now(), ...productData, createdAt: new Date() });
                }
                showNotification(id ? 'Product updated (demo mode)' : 'Product added (demo mode)', 'success');
            }

            closeProductModal();
            loadProducts();
            updateMetrics();
        } catch (error) {
            console.error('Error saving product:', error);
            showNotification('Error saving product: ' + error.message, 'error');
        } finally {
            saveBtn.textContent = origText;
            saveBtn.disabled = false;
        }
    }

    function editProduct(productId) {
        const product = allProducts.find(p => p.id === productId);
        if (!product) return;
        openProductModal(product);
    }

    function deleteProduct(productId) {
        const product = allProducts.find(p => p.id === productId);
        const productName = product?.name || 'this product';

        // Custom confirmation dialog that won't disappear
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--admin-surface, #1e1e2e);border:1px solid var(--admin-border, #333);border-radius:12px;padding:28px;max-width:400px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                <div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
                <h3 style="color:#fff;margin:0 0 8px;font-size:1.1rem;">Delete Product?</h3>
                <p style="color:#aaa;font-size:0.85rem;margin:0 0 24px;line-height:1.5;">Are you sure you want to delete <strong style="color:#fff;">${productName}</strong>? This action cannot be undone.</p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="confirmDeleteCancel" style="padding:10px 24px;border-radius:8px;border:1px solid var(--admin-border, #444);background:transparent;color:#ccc;cursor:pointer;font-size:0.85rem;font-weight:500;">Cancel</button>
                    <button id="confirmDeleteYes" style="padding:10px 24px;border-radius:8px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:0.85rem;font-weight:600;">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#confirmDeleteCancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#confirmDeleteYes').addEventListener('click', async () => {
            overlay.remove();
            try {
                if (db) {
                    await db.collection('products').doc(productId).delete();
                }
                logActivity('product_deleted', productName, `ID: ${productId}`);
                allProducts = allProducts.filter(p => p.id !== productId);
                renderProducts();
                updateMetrics();
                updateProductStats();
                showNotification('Product deleted', 'success');
            } catch (error) {
                console.error('Error deleting product:', error);
                showNotification('Error deleting product', 'error');
            }
        });
    }

    // ============================================================
    // ORDERS MANAGEMENT
    // ============================================================

    async function loadOrders() {
        try {
            if (db) {
                const snap = await db.collection('orders').orderBy('createdAt', 'desc').get();
                allOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error loading orders:', error);
        }

        renderOrders();
    }

    function renderOrders(statusFilter = '', searchQuery = '') {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        let orders = allOrders;
        if (statusFilter) orders = orders.filter(o => o.status === statusFilter);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            orders = orders.filter(o =>
                o.customer?.name?.toLowerCase().includes(q) ||
                o.customer?.phone?.includes(q) ||
                o.id?.toLowerCase().includes(q)
            );
        }

        if (orders.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><div class="empty-state-small">No orders found.</div></td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => `
      <tr>
        <td><strong>#${(order.id || '').slice(-8).toUpperCase()}</strong></td>
        <td>${order.customer?.name || '—'}</td>
        <td>${order.customer?.phone || '—'}</td>
        <td>${order.itemCount || order.items?.length || '—'}</td>
        <td>${formatPrice(order.totalAmount || 0)}</td>
        <td>${order.razorpayPaymentId ? '✅ Paid' : '⏳ Pending'}</td>
        <td>
          <select class="order-status-select" onchange="AdminApp.updateOrderStatus('${order.id}', this.value)">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
        <td>${formatDate(order.createdAt)}</td>
        <td>
          <button class="table-action-btn" onclick="AdminApp.viewOrder('${order.id}')" title="View Details">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        </td>
      </tr>
    `).join('');
    }

    async function updateOrderStatus(orderId, newStatus) {
        try {
            if (db) {
                await db.collection('orders').doc(orderId).update({
                    status: newStatus,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            const order = allOrders.find(o => o.id === orderId);
            if (order) order.status = newStatus;
            updateMetrics();
            showNotification(`Order status updated to "${newStatus}"`, 'success');
        } catch (error) {
            console.error('Error updating order:', error);
            showNotification('Error updating order status', 'error');
        }
    }

    function viewOrder(orderId) {
        const order = allOrders.find(o => o.id === orderId);
        if (!order) return;

        const overlay = document.getElementById('orderModalOverlay');
        const body = document.getElementById('orderModalBody');
        const title = document.getElementById('orderModalTitle');

        title.textContent = `Order #${(order.id || '').slice(-8).toUpperCase()}`;

        body.innerHTML = `
      <div class="order-detail-section">
        <h4>Customer Information</h4>
        <div class="order-detail-grid">
          <div class="order-detail-item"><span class="label">Name</span><span class="value">${order.customer?.name || '—'}</span></div>
          <div class="order-detail-item"><span class="label">Email</span><span class="value">${order.customer?.email || '—'}</span></div>
          <div class="order-detail-item"><span class="label">Phone</span><span class="value">${order.customer?.phone || '—'}</span></div>
        </div>
      </div>

      <div class="order-detail-section">
        <h4>Shipping Address</h4>
        <p style="color: var(--admin-text); font-size: 0.9rem; line-height: 1.5;">
          ${order.shippingAddress?.address || '—'}<br>
          ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} — ${order.shippingAddress?.pincode || ''}<br>
          ${order.shippingAddress?.country || 'India'}
        </p>
      </div>

      <div class="order-detail-section">
        <h4>Items Ordered</h4>
        ${(order.items || []).map(item => `
          <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--admin-border);">
            <img src="${item.image || ''}" style="width: 40px; height: 50px; border-radius: 4px; object-fit: cover; background: var(--admin-surface-2);" onerror="this.style.display='none'">
            <div style="flex: 1;"><strong>${item.name}</strong> <span style="color: var(--admin-text-muted);">× ${item.quantity}</span></div>
            <span>${formatPrice(item.price * item.quantity)}</span>
          </div>
        `).join('')}
      </div>

      <div class="order-detail-section">
        <h4>Payment Summary</h4>
        <div class="order-detail-grid">
          <div class="order-detail-item"><span class="label">Subtotal</span><span class="value">${formatPrice(order.subtotal || 0)}</span></div>
          <div class="order-detail-item"><span class="label">Shipping</span><span class="value">${order.shipping === 0 ? 'FREE' : formatPrice(order.shipping || 0)}</span></div>
          <div class="order-detail-item"><span class="label">GST</span><span class="value">${formatPrice(order.gst || 0)}</span></div>
          <div class="order-detail-item"><span class="label"><strong>Total</strong></span><span class="value" style="color: var(--admin-success);"><strong>${formatPrice(order.totalAmount || 0)}</strong></span></div>
        </div>
      </div>

      <div class="order-detail-section">
        <h4>Payment Details</h4>
        <div class="order-detail-grid">
          <div class="order-detail-item"><span class="label">Razorpay ID</span><span class="value">${order.razorpayPaymentId || '—'}</span></div>
          <div class="order-detail-item"><span class="label">Status</span><span class="value"><span class="status-badge status-${order.status}">${order.status}</span></span></div>
          <div class="order-detail-item"><span class="label">Paid At</span><span class="value">${order.paidAt ? new Date(order.paidAt).toLocaleString('en-IN') : '—'}</span></div>
        </div>
      </div>

      ${order.notes ? `<div class="order-detail-section"><h4>Order Notes</h4><p style="color: var(--admin-text); font-size: 0.9rem;">${order.notes}</p></div>` : ''}
    `;

        overlay.classList.add('open');

        // Close handlers
        document.getElementById('orderModalClose').onclick = () => overlay.classList.remove('open');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('open'); };
    }

    function initOrderFilters() {
        const statusFilter = document.getElementById('orderStatusFilter');
        const searchInput = document.getElementById('orderSearch');

        statusFilter?.addEventListener('change', () => {
            renderOrders(statusFilter.value, searchInput?.value || '');
        });

        searchInput?.addEventListener('input', () => {
            renderOrders(statusFilter?.value || '', searchInput.value);
        });
    }

    // ============================================================
    // SETTINGS
    // ============================================================

    function initSettings() {
        const storeForm = document.getElementById('storeSettingsForm');
        const razorpayForm = document.getElementById('razorpaySettingsForm');

        storeForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const settings = {
                    storeName: document.getElementById('settingStoreName').value,
                    email: document.getElementById('settingEmail').value,
                    whatsapp: document.getElementById('settingWhatsApp').value,
                    freeShippingThreshold: Number(document.getElementById('settingFreeShipping').value),
                    shippingCost: Number(document.getElementById('settingShippingCost').value),
                    gst: Number(document.getElementById('settingGST').value),
                };

                if (db) {
                    await db.collection('settings').doc('store').set(settings, { merge: true });
                }
                showNotification('Store settings saved!', 'success');
            } catch (error) {
                showNotification('Error saving settings: ' + error.message, 'error');
            }
        });

        razorpayForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const settings = {
                    keyId: document.getElementById('settingRazorpayKey').value,
                    mode: document.getElementById('settingRazorpayMode').value,
                };

                if (db) {
                    await db.collection('settings').doc('razorpay').set(settings, { merge: true });
                }
                showNotification('Razorpay settings saved!', 'success');
            } catch (error) {
                showNotification('Error saving Razorpay settings: ' + error.message, 'error');
            }
        });
    }

    // ============================================================
    // DEMO DATA (for when Firebase is not configured)
    // ============================================================

    function getDemoProducts() {
        return [
            { id: 'p1', name: 'Teal Heritage Silk Masterpiece', category: 'Kanjivaram', price: 45999, stock: 5, color: 'Teal', image: '../images/hero-1.png', isActive: true, featured: true, createdAt: new Date() },
            { id: 'p2', name: 'Red Bridal Brocade Silk Saree', category: 'Bridal', price: 52499, originalPrice: 59999, stock: 3, color: 'Red', image: '../images/hero-2.png', isActive: true, featured: true, createdAt: new Date() },
            { id: 'p3', name: 'Royal Purple Banarasi Silk Saree', category: 'Banarasi', price: 48999, stock: 8, color: 'Purple', image: '../images/hero-3.png', isActive: true, createdAt: new Date() },
            { id: 'p4', name: 'Royal Purple Zari Silk Saree', category: 'Kanjivaram', price: 45999, stock: 4, color: 'Purple', image: '../images/product-1.png', isActive: true, createdAt: new Date() },
            { id: 'p5', name: 'Royal Blue Brocade Silk Saree', category: 'Banarasi', price: 56999, stock: 6, color: 'Blue', image: '../images/product-2.png', isActive: true, createdAt: new Date() },
            { id: 'p6', name: 'Sunset Orange Temple Border Saree', category: 'Kanjivaram', price: 38999, stock: 7, color: 'Orange', image: '../images/product-3.png', isActive: true, createdAt: new Date() },
        ];
    }

    function getDemoOrders() {
        return [
            {
                id: 'ORD-DEMO-001', status: 'delivered', totalAmount: 45999, itemCount: 1,
                customer: { name: 'Priya Venkatesh', email: 'priya@example.com', phone: '9876543210' },
                shippingAddress: { address: '12 Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040' },
                items: [{ name: 'Teal Heritage Silk Masterpiece', price: 45999, quantity: 1, image: '../images/hero-1.png' }],
                subtotal: 45999, shipping: 0, gst: 2300, razorpayPaymentId: 'pay_demo001',
                createdAt: new Date(Date.now() - 86400000 * 5), paidAt: new Date(Date.now() - 86400000 * 5).toISOString()
            },
            {
                id: 'ORD-DEMO-002', status: 'shipped', totalAmount: 52499, itemCount: 1,
                customer: { name: 'Meena Krishnan', email: 'meena@example.com', phone: '9876543211' },
                shippingAddress: { address: '45 T Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600017' },
                items: [{ name: 'Red Bridal Brocade Silk Saree', price: 52499, quantity: 1, image: '../images/hero-2.png' }],
                subtotal: 52499, shipping: 0, gst: 2625, razorpayPaymentId: 'pay_demo002',
                createdAt: new Date(Date.now() - 86400000 * 2), paidAt: new Date(Date.now() - 86400000 * 2).toISOString()
            },
            {
                id: 'ORD-DEMO-003', status: 'paid', totalAmount: 94998, itemCount: 2,
                customer: { name: 'Lakshmi Sundaram', email: 'lakshmi@example.com', phone: '9876543212' },
                shippingAddress: { address: '78 Adyar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600020' },
                items: [
                    { name: 'Royal Purple Banarasi Silk', price: 48999, quantity: 1, image: '../images/hero-3.png' },
                    { name: 'Teal Heritage Silk', price: 45999, quantity: 1, image: '../images/hero-1.png' }
                ],
                subtotal: 94998, shipping: 0, gst: 4750, razorpayPaymentId: 'pay_demo003',
                createdAt: new Date(Date.now() - 86400000), paidAt: new Date(Date.now() - 86400000).toISOString()
            },
        ];
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    function formatPrice(amount) {
        return '₹' + Number(amount).toLocaleString('en-IN');
    }

    function formatDate(dateVal) {
        if (!dateVal) return '—';
        let date;
        if (dateVal.toDate) date = dateVal.toDate(); // Firestore timestamp
        else if (dateVal instanceof Date) date = dateVal;
        else date = new Date(dateVal);

        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.admin-notification');
        if (existing) existing.remove();

        const colors = {
            success: 'var(--admin-success)',
            error: 'var(--admin-danger)',
            info: 'var(--admin-info)',
            warning: 'var(--admin-warning)'
        };

        const el = document.createElement('div');
        el.className = 'admin-notification';
        el.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      background: var(--admin-surface); border: 1px solid ${colors[type] || colors.info};
      border-left: 4px solid ${colors[type] || colors.info};
      border-radius: 8px; padding: 14px 20px; color: #fff;
      font-size: 0.85rem; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      transform: translateX(120%); transition: transform 0.3s ease;
      font-family: var(--admin-font); max-width: 400px;
    `;
        el.textContent = message;
        document.body.appendChild(el);

        requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; });
        setTimeout(() => {
            el.style.transform = 'translateX(120%)';
            setTimeout(() => el.remove(), 300);
        }, 3500);
    }

    // ============================================================
    // SIDEBAR & MOBILE
    // ============================================================

    function initSidebar() {
        const toggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('adminSidebar');

        toggle?.addEventListener('click', () => {
            sidebar?.classList.toggle('open');
        });

        // Close sidebar on outside click (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && sidebar?.classList.contains('open')) {
                if (!sidebar.contains(e.target) && e.target !== toggle) {
                    sidebar.classList.remove('open');
                }
            }
        });
    }

    // ============================================================
    // COUPONS MANAGEMENT
    // ============================================================

    async function loadCoupons() {
        try {
            if (db) {
                const snap = await db.collection('coupons').orderBy('createdAt', 'desc').get();
                allCoupons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error loading coupons:', error);
        }
        renderCoupons();
    }

    function renderCoupons(searchQuery = '') {
        const tbody = document.getElementById('couponsTableBody');
        if (!tbody) return;

        let coupons = allCoupons;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            coupons = coupons.filter(c => c.code?.toLowerCase().includes(q));
        }

        if (coupons.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state-small">No coupons found. Click "Add Coupon" to create one.</div></td></tr>';
            return;
        }

        tbody.innerHTML = coupons.map(c => {
            const isExpired = c.expiryDate && c.expiryDate.toDate && c.expiryDate.toDate() < new Date();
            const statusClass = c.isActive && !isExpired ? 'status-active' : 'status-inactive';
            const statusText = !c.isActive ? 'Inactive' : isExpired ? 'Expired' : 'Active';
            const expiryStr = c.expiryDate && c.expiryDate.toDate
                ? c.expiryDate.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'No expiry';
            const usesStr = c.maxUses > 0 ? `${c.currentUses || 0}/${c.maxUses}` : `${c.currentUses || 0}/∞`;

            return `
            <tr>
                <td><strong style="letter-spacing:0.05em;">${c.code}</strong></td>
                <td>${c.discountType === 'percentage' ? 'Percentage' : 'Fixed'}</td>
                <td>${c.discountType === 'percentage' ? c.discountValue + '%' : formatPrice(c.discountValue)}</td>
                <td>${usesStr}</td>
                <td>${c.minOrderValue ? formatPrice(c.minOrderValue) : '—'}</td>
                <td>${expiryStr}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn" onclick="AdminApp.editCoupon('${c.id}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button class="table-action-btn danger" onclick="AdminApp.deleteCoupon('${c.id}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    function openCouponModal(coupon = null) {
        const overlay = document.getElementById('couponModalOverlay');
        const title = document.getElementById('couponModalTitle');

        document.getElementById('couponId').value = coupon?.id || '';
        document.getElementById('couponCode').value = coupon?.code || '';
        document.getElementById('couponActive').value = coupon ? String(coupon.isActive !== false) : 'true';
        document.getElementById('couponType').value = coupon?.discountType || 'fixed';
        document.getElementById('couponValue').value = coupon?.discountValue || '';
        document.getElementById('couponMinOrder').value = coupon?.minOrderValue || 0;
        document.getElementById('couponMaxDiscount').value = coupon?.maxDiscount || 0;
        document.getElementById('couponMaxUses').value = coupon?.maxUses || 0;
        document.getElementById('couponExpiry').value = coupon?.expiryDate && coupon.expiryDate.toDate
            ? coupon.expiryDate.toDate().toISOString().split('T')[0]
            : '';

        if (title) title.textContent = coupon ? 'Edit Coupon' : 'Add Coupon';
        overlay?.classList.add('open');
    }

    function closeCouponModal() {
        document.getElementById('couponModalOverlay')?.classList.remove('open');
        document.getElementById('couponForm')?.reset();
        document.getElementById('couponId').value = '';
    }

    async function saveCoupon() {
        const id = document.getElementById('couponId').value;
        const code = document.getElementById('couponCode').value.trim().toUpperCase();
        const discountType = document.getElementById('couponType').value;
        const discountValue = Number(document.getElementById('couponValue').value);
        const minOrderValue = Number(document.getElementById('couponMinOrder').value) || 0;
        const maxDiscount = Number(document.getElementById('couponMaxDiscount').value) || 0;
        const maxUses = Number(document.getElementById('couponMaxUses').value) || 0;
        const isActive = document.getElementById('couponActive').value === 'true';
        const expiryStr = document.getElementById('couponExpiry').value;

        if (!code || !discountValue) {
            showNotification('Please fill in code and discount value', 'error');
            return;
        }

        const data = {
            code,
            discountType,
            discountValue,
            minOrderValue,
            maxDiscount,
            maxUses,
            isActive,
            expiryDate: expiryStr ? firebase.firestore.Timestamp.fromDate(new Date(expiryStr + 'T23:59:59')) : null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (id) {
                await db.collection('coupons').doc(id).update(data);
                logActivity('coupon_updated', code, `${discountType === 'percentage' ? discountValue + '%' : formatPrice(discountValue)} off`);
                showNotification('Coupon updated successfully', 'success');
            } else {
                data.currentUses = 0;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('coupons').add(data);
                logActivity('coupon_created', code, `${discountType === 'percentage' ? discountValue + '%' : formatPrice(discountValue)} off | Min: ${formatPrice(minOrderValue)}`);
                showNotification('Coupon created successfully', 'success');
            }

            closeCouponModal();
            loadCoupons();
        } catch (error) {
            console.error('Error saving coupon:', error);
            showNotification('Error saving coupon', 'error');
        }
    }

    function editCoupon(couponId) {
        const coupon = allCoupons.find(c => c.id === couponId);
        if (!coupon) return;
        openCouponModal(coupon);
    }

    function deleteCoupon(couponId) {
        const coupon = allCoupons.find(c => c.id === couponId);
        const couponCode = coupon?.code || 'this coupon';

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--admin-surface, #1e1e2e);border:1px solid var(--admin-border, #333);border-radius:12px;padding:28px;max-width:400px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                <h3 style="color:#fff;margin:0 0 8px;font-size:1.1rem;">Delete Coupon?</h3>
                <p style="color:#aaa;font-size:0.85rem;margin:0 0 24px;line-height:1.5;">Delete coupon <strong style="color:#fff;">${couponCode}</strong>? This cannot be undone.</p>
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button id="confirmCouponDeleteCancel" style="padding:10px 24px;border-radius:8px;border:1px solid var(--admin-border, #444);background:transparent;color:#ccc;cursor:pointer;font-size:0.85rem;font-weight:500;">Cancel</button>
                    <button id="confirmCouponDeleteYes" style="padding:10px 24px;border-radius:8px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:0.85rem;font-weight:600;">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#confirmCouponDeleteCancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#confirmCouponDeleteYes').addEventListener('click', async () => {
            overlay.remove();
            try {
                if (db) await db.collection('coupons').doc(couponId).delete();
                logActivity('coupon_deleted', couponCode, `ID: ${couponId}`);
                allCoupons = allCoupons.filter(c => c.id !== couponId);
                renderCoupons();
                showNotification('Coupon deleted', 'success');
            } catch (error) {
                console.error('Error deleting coupon:', error);
                showNotification('Error deleting coupon', 'error');
            }
        });
    }

    function initCouponModal() {
        const addBtn = document.getElementById('addCouponBtn');
        const overlay = document.getElementById('couponModalOverlay');
        const closeBtn = document.getElementById('couponModalClose');
        const cancelBtn = document.getElementById('couponCancelBtn');
        const form = document.getElementById('couponForm');
        const searchInput = document.getElementById('couponSearch');

        addBtn?.addEventListener('click', () => openCouponModal());
        closeBtn?.addEventListener('click', () => closeCouponModal());
        cancelBtn?.addEventListener('click', () => closeCouponModal());
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) closeCouponModal();
        });

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            saveCoupon();
        });

        searchInput?.addEventListener('input', (e) => {
            renderCoupons(e.target.value);
        });
    }

    // ============================================================
    // ACTIVITY LOG
    // ============================================================

    let allActivities = [];

    async function logActivity(action, itemName, details) {
        if (!db) return;
        try {
            await db.collection('activityLog').add({
                action: action,
                itemName: itemName || '',
                details: details || '',
                user: currentUser?.email || 'Unknown',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.warn('Failed to log activity:', e);
        }
    }

    async function loadActivity() {
        try {
            if (db) {
                const snap = await db.collection('activityLog').orderBy('timestamp', 'desc').limit(200).get();
                allActivities = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error loading activity:', error);
        }
        renderActivity();
        updateActivityStats();
    }

    function updateActivityStats() {
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('statTotalActions', allActivities.length);
        el('statProductsAdded', allActivities.filter(a => a.action === 'product_added').length);
        el('statProductsDeleted', allActivities.filter(a => a.action === 'product_deleted').length);
        el('statCouponsCreated', allActivities.filter(a => a.action === 'coupon_created').length);
    }

    function renderActivity() {
        const tbody = document.getElementById('activityTableBody');
        if (!tbody) return;

        let activities = allActivities;

        const typeFilter = document.getElementById('activityTypeFilter')?.value;
        if (typeFilter) {
            activities = activities.filter(a => a.action === typeFilter);
        }

        if (activities.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-state-small">No activity found.</div></td></tr>';
            return;
        }

        const actionLabels = {
            product_added: '<span style="color:#22c55e;">+ Added</span>',
            product_updated: '<span style="color:#3b82f6;">&#9998; Updated</span>',
            product_deleted: '<span style="color:#ef4444;">&#10005; Deleted</span>',
            coupon_created: '<span style="color:#22c55e;">+ Created</span>',
            coupon_updated: '<span style="color:#3b82f6;">&#9998; Updated</span>',
            coupon_deleted: '<span style="color:#ef4444;">&#10005; Deleted</span>',
            upload_failed: '<span style="color:#f59e0b;">&#9888; Upload Failed</span>'
        };

        const actionCategory = (a) => {
            if (a.startsWith('product_')) return 'Product';
            if (a.startsWith('coupon_')) return 'Coupon';
            if (a === 'upload_failed') return 'Image Upload';
            return 'Other';
        };

        tbody.innerHTML = activities.map(a => {
            const ts = a.timestamp?.toDate?.() || new Date();
            const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            return `
            <tr>
                <td>${actionLabels[a.action] || a.action}</td>
                <td><strong>${a.itemName || '—'}</strong><br><small style="color:var(--admin-text-muted);">${actionCategory(a.action)}</small></td>
                <td style="font-size:0.8rem;color:var(--admin-text-muted);">${a.details || '—'}</td>
                <td>${a.user || '—'}</td>
                <td>${dateStr}<br><small style="color:var(--admin-text-muted);">${timeStr}</small></td>
            </tr>`;
        }).join('');
    }

    function initActivityFilter() {
        document.getElementById('activityTypeFilter')?.addEventListener('change', () => {
            renderActivity();
        });
    }

    // ============================================================
    // CHARTS — Dashboard Analytics
    // ============================================================

    let revenueChartInstance = null;
    let orderStatusChartInstance = null;
    let topProductsChartInstance = null;
    let categoryChartInstance = null;
    let salesTrendChartInstance = null;

    const CHART_COLORS = {
        gold: '#d4a853',
        primary: '#1a7a6e',
        palette: ['#d4a853', '#1a7a6e', '#4299e1', '#25D366', '#f0b429', '#e53e3e', '#9f7aea', '#ed64a6']
    };

    const STATUS_COLORS = {
        pending: '#f0b429',
        paid: '#4299e1',
        processing: '#1a7a6e',
        shipped: '#25D366',
        delivered: '#0d6157',
        cancelled: '#e53e3e',
        unknown: '#8a9e99'
    };

    function configureChartDefaults() {
        if (typeof Chart === 'undefined') return;
        Chart.defaults.color = '#8a9e99';
        Chart.defaults.borderColor = 'rgba(212, 168, 83, 0.08)';
        Chart.defaults.font.family = "'Inter', 'Montserrat', sans-serif";
        Chart.defaults.font.size = 11;
        Chart.defaults.plugins.legend.labels.usePointStyle = true;
        Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
        Chart.defaults.plugins.legend.labels.padding = 16;
        Chart.defaults.plugins.tooltip.backgroundColor = '#132e29';
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(212, 168, 83, 0.2)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.titleColor = '#f4e5c3';
        Chart.defaults.plugins.tooltip.bodyColor = '#e8e4dc';
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
    }

    function getDateKey(date) {
        let d;
        if (date && date.toDate) d = date.toDate();
        else if (date instanceof Date) d = date;
        else d = new Date(date);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
    }

    function getRevenueByDay(days) {
        const now = new Date();
        const dayMap = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400000);
            dayMap[getDateKey(d)] = 0;
        }
        allOrders
            .filter(o => ['paid', 'delivered', 'shipped', 'processing'].includes(o.status))
            .forEach(o => {
                const key = getDateKey(o.createdAt);
                if (key && dayMap.hasOwnProperty(key)) dayMap[key] += (o.totalAmount || 0);
            });
        const labels = Object.keys(dayMap).map(k => {
            const d = new Date(k);
            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        });
        return { labels, data: Object.values(dayMap) };
    }

    function getOrdersByDay(days) {
        const now = new Date();
        const dayMap = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400000);
            dayMap[getDateKey(d)] = 0;
        }
        allOrders.forEach(o => {
            const key = getDateKey(o.createdAt);
            if (key && dayMap.hasOwnProperty(key)) dayMap[key]++;
        });
        const labels = Object.keys(dayMap).map(k => {
            const d = new Date(k);
            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        });
        return { labels, data: Object.values(dayMap) };
    }

    function getOrderStatusData() {
        const statusMap = {};
        allOrders.forEach(o => {
            const s = o.status || 'unknown';
            statusMap[s] = (statusMap[s] || 0) + 1;
        });
        return {
            labels: Object.keys(statusMap).map(s => s.charAt(0).toUpperCase() + s.slice(1)),
            data: Object.values(statusMap),
            keys: Object.keys(statusMap)
        };
    }

    function getTopProductsData() {
        const productRevenue = {};
        allOrders
            .filter(o => ['paid', 'delivered', 'shipped', 'processing'].includes(o.status))
            .forEach(o => {
                (o.items || []).forEach(item => {
                    const name = item.name || 'Unknown';
                    productRevenue[name] = (productRevenue[name] || 0) + ((item.price || 0) * (item.quantity || 1));
                });
            });
        const sorted = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return {
            labels: sorted.map(([name]) => name.length > 25 ? name.slice(0, 25) + '...' : name),
            data: sorted.map(([, rev]) => rev)
        };
    }

    function getCategoryData() {
        const catMap = {};
        allProducts.forEach(p => {
            const cat = (p.category || 'Uncategorized');
            const label = cat.charAt(0).toUpperCase() + cat.slice(1);
            catMap[label] = (catMap[label] || 0) + 1;
        });
        return { labels: Object.keys(catMap), data: Object.values(catMap) };
    }

    function renderRevenueChart(days) {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;
        const { labels, data } = getRevenueByDay(days || 7);
        if (revenueChartInstance) revenueChartInstance.destroy();
        revenueChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Revenue',
                    data,
                    borderColor: CHART_COLORS.gold,
                    backgroundColor: function(context) {
                        const chart = context.chart;
                        const { ctx: c, chartArea } = chart;
                        if (!chartArea) return 'rgba(212, 168, 83, 0.15)';
                        const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, 'rgba(212, 168, 83, 0.25)');
                        gradient.addColorStop(1, 'rgba(212, 168, 83, 0.02)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: CHART_COLORS.gold,
                    pointBorderColor: '#132e29',
                    pointBorderWidth: 2,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(ctx) { return ' Revenue: ' + formatPrice(ctx.parsed.y); } } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(212, 168, 83, 0.06)' },
                        ticks: { callback: function(val) { return val >= 1000 ? '₹' + (val / 1000).toFixed(0) + 'K' : '₹' + val; } }
                    }
                }
            }
        });
    }

    function renderOrderStatusChart() {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('orderStatusChart');
        if (!ctx) return;
        const { labels, data, keys } = getOrderStatusData();
        if (data.length === 0) return;
        const colors = keys.map(function(k) { return STATUS_COLORS[k] || STATUS_COLORS.unknown; });
        if (orderStatusChartInstance) orderStatusChartInstance.destroy();
        orderStatusChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors, borderColor: '#132e29', borderWidth: 3, hoverOffset: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'right', labels: { padding: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.parsed + ' orders'; } } }
                }
            }
        });
    }

    function renderTopProductsChart() {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('topProductsChart');
        if (!ctx) return;
        const { labels, data } = getTopProductsData();
        if (data.length === 0) return;
        if (topProductsChartInstance) topProductsChartInstance.destroy();
        topProductsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Revenue',
                    data,
                    backgroundColor: function(context) {
                        var idx = context.dataIndex;
                        var total = context.dataset.data.length;
                        var ratio = idx / Math.max(total - 1, 1);
                        return 'rgba(' + Math.round(212 - ratio * 186) + ',' + Math.round(168 - ratio * 46) + ',' + Math.round(83 + ratio * 27) + ',0.8)';
                    },
                    borderColor: 'transparent',
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 22,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(ctx) { return ' Revenue: ' + formatPrice(ctx.parsed.x); } } }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(212, 168, 83, 0.06)' },
                        ticks: { callback: function(val) { return val >= 1000 ? '₹' + (val / 1000).toFixed(0) + 'K' : '₹' + val; } }
                    },
                    y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    function renderCategoryChart() {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;
        const { labels, data } = getCategoryData();
        if (data.length === 0) return;
        if (categoryChartInstance) categoryChartInstance.destroy();
        categoryChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: CHART_COLORS.palette.slice(0, labels.length), borderColor: '#132e29', borderWidth: 3, hoverOffset: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'right', labels: { padding: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.parsed + ' products'; } } }
                }
            }
        });
    }

    function renderSalesTrendChart(days) {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('salesTrendChart');
        if (!ctx) return;
        const { labels, data } = getOrdersByDay(days || 7);
        if (salesTrendChartInstance) salesTrendChartInstance.destroy();
        salesTrendChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Orders',
                    data,
                    backgroundColor: 'rgba(26, 122, 110, 0.6)',
                    hoverBackgroundColor: 'rgba(26, 122, 110, 0.85)',
                    borderColor: 'transparent',
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.parsed.y + ' order' + (ctx.parsed.y !== 1 ? 's' : ''); } } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 10 } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(212, 168, 83, 0.06)' },
                        ticks: { stepSize: 1, precision: 0 }
                    }
                }
            }
        });
    }

    function renderAllCharts() {
        if (typeof Chart === 'undefined') return;
        configureChartDefaults();
        renderRevenueChart(7);
        renderOrderStatusChart();
        renderTopProductsChart();
        renderCategoryChart();
        renderSalesTrendChart(7);
        renderVisitorsChart(7);
        renderPopularPagesChart();
    }

    // ============================================================
    // VISITOR ANALYTICS CHARTS
    // ============================================================

    let visitorsChartInstance = null;
    let popularPagesChartInstance = null;
    let cachedPageViewDocs = null;

    async function loadPageViewData() {
        if (cachedPageViewDocs) return cachedPageViewDocs;
        if (!db) return [];
        try {
            const snap = await db.collection('pageViews').orderBy('date', 'desc').limit(90).get();
            cachedPageViewDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return cachedPageViewDocs;
        } catch (e) {
            console.warn('Could not load page views:', e);
            return [];
        }
    }

    async function renderVisitorsChart(days) {
        const canvas = document.getElementById('visitorsChart');
        if (!canvas) return;

        const allData = await loadPageViewData();

        // Build date labels for last N days
        const labels = [];
        const data = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const shortLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            labels.push(shortLabel);
            const doc = allData.find(v => v.id === dateStr);
            data.push(doc ? (doc.totalViews || 0) : 0);
        }

        // Update metric card
        const totalViews = data.reduce((a, b) => a + b, 0);
        const todayViews = data[data.length - 1] || 0;
        const el = document.getElementById('totalPageViews');
        if (el) el.textContent = totalViews.toLocaleString('en-IN');
        const todayEl = document.getElementById('todayPageViews');
        if (todayEl) todayEl.textContent = todayViews + ' today';

        if (visitorsChartInstance) visitorsChartInstance.destroy();
        visitorsChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Page Views',
                    data: data,
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#0284c7'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    async function renderPopularPagesChart() {
        const canvas = document.getElementById('popularPagesChart');
        if (!canvas) return;

        const allData = await loadPageViewData();

        // Aggregate page views across all days (last 30 days)
        const pageTotals = {};
        const now = new Date();
        allData.forEach(doc => {
            const docDate = new Date(doc.id);
            const diffDays = (now - docDate) / (1000 * 60 * 60 * 24);
            if (diffDays <= 30 && doc.pages) {
                Object.keys(doc.pages).forEach(page => {
                    pageTotals[page] = (pageTotals[page] || 0) + doc.pages[page];
                });
            }
        });

        // Sort and take top 8
        const sorted = Object.entries(pageTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (sorted.length === 0) {
            sorted.push(['No data yet', 0]);
        }

        const pageNames = {
            'home': 'Home', 'index': 'Home', 'shop': 'Shop', 'product': 'Product',
            'checkout': 'Checkout', 'about': 'About', 'contact': 'Contact',
            'care-guide': 'Care Guide', 'size-guide': 'Size Guide',
            'shipping': 'Shipping', 'returns': 'Returns', 'privacy': 'Privacy',
            'terms': 'Terms', 'invitation': 'Invitation', 'launch': 'Launch'
        };

        const labels = sorted.map(s => pageNames[s[0]] || s[0]);
        const data = sorted.map(s => s[1]);
        const colors = ['#0d6157', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0891b2', '#6366f1'];

        if (popularPagesChartInstance) popularPagesChartInstance.destroy();
        popularPagesChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Views (30d)',
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    function initChartToggles() {
        document.querySelectorAll('.chart-period-toggle .period-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var toggle = btn.closest('.chart-period-toggle');
                toggle.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                var period = btn.dataset.period;
                var days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
                var chartType = btn.dataset.chart;
                if (chartType === 'revenue') renderRevenueChart(days);
                if (chartType === 'sales') renderSalesTrendChart(days);
                if (chartType === 'visitors') { cachedPageViewDocs = null; renderVisitorsChart(days); }
            });
        });
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        // Set current date
        const dateEl = document.getElementById('currentDate');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
        }

        // Initialize Firebase Storage
        try {
            if (typeof firebase !== 'undefined' && firebase.storage) {
                storage = firebase.storage();
                console.log('📦 Firebase Storage initialized');
            }
        } catch (e) {
            console.warn('Firebase Storage not available, using fallback:', e.message);
        }

        initAuth();
        initTabs();
        initProductModal();
        initCouponModal();
        initOrderFilters();
        initActivityFilter();
        initSettings();
        initSidebar();
        initChartToggles();

        console.log('🛡️ Admin Dashboard initialized');
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // PUBLIC API (for onclick handlers)
    // ============================================================

    return {
        editProduct,
        deleteProduct,
        editCoupon,
        deleteCoupon,
        updateOrderStatus,
        viewOrder
    };

})();

window.AdminApp = AdminApp;
