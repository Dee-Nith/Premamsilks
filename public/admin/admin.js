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
    let pendingImageFiles = []; // Files staged for upload
    let existingImageUrls = []; // Already-uploaded image URLs (for editing)
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
        const titles = { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', settings: 'Settings' };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = titles[tab] || tab;

        // Load tab-specific data
        if (tab === 'products') loadProducts();
        if (tab === 'orders') loadOrders();

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
            renderRecentOrders();
        } catch (error) {
            console.error('Error loading dashboard:', error);
            // Fallback to demo
            allOrders = getDemoOrders();
            allProducts = getDemoProducts();
            updateMetrics();
            renderRecentOrders();
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
    }

    function renderProducts(searchQuery = '') {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        let products = allProducts;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            products = products.filter(p =>
                p.name?.toLowerCase().includes(q) ||
                p.category?.toLowerCase().includes(q) ||
                p.sareeCode?.toLowerCase().includes(q)
            );
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

            pendingImageFiles.push(compressed);
        }

        renderImagePreviews();
        document.getElementById('imageFileInput').value = '';
    }

    function renderImagePreviews() {
        const container = document.getElementById('imagePreviews');
        if (!container) return;
        container.innerHTML = '';

        // Show existing uploaded image URLs
        existingImageUrls.forEach((url, idx) => {
            const item = document.createElement('div');
            item.className = 'image-preview-item';
            item.innerHTML = `
                <img src="${url}" alt="Image ${idx + 1}">
                <button type="button" class="image-preview-remove" data-type="existing" data-index="${idx}">&times;</button>
            `;
            container.appendChild(item);
        });

        // Show pending file previews
        pendingImageFiles.forEach((file, idx) => {
            const item = document.createElement('div');
            item.className = 'image-preview-item';
            const reader = new FileReader();
            reader.onload = (e) => {
                item.innerHTML = `
                    <img src="${e.target.result}" alt="${file.name}">
                    <button type="button" class="image-preview-remove" data-type="pending" data-index="${idx}">&times;</button>
                `;
            };
            reader.readAsDataURL(file);
            container.appendChild(item);
        });

        // Event delegation for remove buttons
        container.onclick = (e) => {
            const btn = e.target.closest('.image-preview-remove');
            if (!btn) return;
            const type = btn.dataset.type;
            const index = parseInt(btn.dataset.index);
            if (type === 'existing') {
                existingImageUrls.splice(index, 1);
            } else {
                pendingImageFiles.splice(index, 1);
            }
            renderImagePreviews();
        };
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
                existingImageUrls = [...product.images];
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

            // Combine existing + newly uploaded images
            const allImages = [...existingImageUrls, ...newImageUrls];

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
                    showNotification('Product updated successfully!', 'success');
                } else {
                    await db.collection('products').add({
                        ...productData,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
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

    async function deleteProduct(productId) {
        if (!confirm('Are you sure you want to delete this product?')) return;

        try {
            if (db) {
                await db.collection('products').doc(productId).delete();
            }
            allProducts = allProducts.filter(p => p.id !== productId);
            renderProducts();
            updateMetrics();
            showNotification('Product deleted', 'success');
        } catch (error) {
            console.error('Error deleting product:', error);
            showNotification('Error deleting product', 'error');
        }
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
        initOrderFilters();
        initSettings();
        initSidebar();

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
        updateOrderStatus,
        viewOrder
    };

})();

window.AdminApp = AdminApp;
