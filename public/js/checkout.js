/**
 * PREMAM SILKS — Checkout via WhatsApp
 *
 * Flow:
 * 1. User fills shipping details
 * 2. Click "Place Order via WhatsApp" → validates form
 * 3. Builds a formatted WhatsApp message with order details
 * 4. Opens WhatsApp with pre-filled message to Premam Silks team
 */

const PremamCheckout = (function () {
    'use strict';

    const WHATSAPP_NUMBER = '917200123457';

    // Coupon state
    let appliedCoupon = null; // { code, discountType, discountValue, discountAmount, couponId }

    // ============================================================
    // FORM VALIDATION
    // ============================================================

    const validators = {
        name: (val) => val.trim().length >= 2 ? '' : 'Name must be at least 2 characters',
        email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? '' : 'Enter a valid email address',
        phone: (val) => /^(\+91)?[6-9]\d{9}$/.test(val.replace(/[\s-]/g, '')) ? '' : 'Enter a valid 10-digit mobile number',
        address: (val) => val.trim().length >= 10 ? '' : 'Enter your full address',
        city: (val) => val.trim().length >= 2 ? '' : 'Enter your city',
        state: (val) => val.trim().length >= 2 ? '' : 'Select your state',
        pincode: (val) => /^\d{6}$/.test(val.trim()) ? '' : 'Enter a valid 6-digit pincode'
    };

    function validateForm(formData) {
        const errors = {};
        let isValid = true;

        for (const [field, validator] of Object.entries(validators)) {
            const error = validator(formData[field] || '');
            if (error) {
                errors[field] = error;
                isValid = false;
            }
        }

        return { isValid, errors };
    }

    function showFieldError(field, message) {
        const input = document.getElementById(`checkout-${field}`);
        if (!input) return;

        input.classList.add('input-error');

        const existingError = input.parentElement.querySelector('.field-error');
        if (existingError) existingError.remove();

        if (message) {
            const errorEl = document.createElement('span');
            errorEl.className = 'field-error';
            errorEl.textContent = message;
            input.parentElement.appendChild(errorEl);
        }
    }

    function clearFieldErrors() {
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
        document.querySelectorAll('.field-error').forEach(el => el.remove());
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatPrice(amount) {
        return '₹' + Number(amount).toLocaleString('en-IN');
    }

    function getFormData() {
        return {
            name: document.getElementById('checkout-name')?.value || '',
            email: document.getElementById('checkout-email')?.value || '',
            phone: document.getElementById('checkout-phone')?.value || '',
            address: document.getElementById('checkout-address')?.value || '',
            city: document.getElementById('checkout-city')?.value || '',
            state: document.getElementById('checkout-state')?.value || '',
            pincode: document.getElementById('checkout-pincode')?.value || '',
            notes: document.getElementById('checkout-notes')?.value || ''
        };
    }

    // ============================================================
    // COUPON LOGIC
    // ============================================================

    async function applyCoupon() {
        const input = document.getElementById('couponInput');
        const msgEl = document.getElementById('couponMessage');
        if (!input || !msgEl) return;

        const code = input.value.trim().toUpperCase();
        if (!code) {
            showCouponMessage(msgEl, 'Please enter a coupon code', 'error');
            return;
        }

        if (!window.PremamDB || !db) {
            showCouponMessage(msgEl, 'Unable to verify coupon. Please try again.', 'error');
            return;
        }

        try {
            const snap = await db.collection('coupons').where('code', '==', code).get();
            if (snap.empty) {
                showCouponMessage(msgEl, 'Invalid coupon code', 'error');
                return;
            }

            const doc = snap.docs[0];
            const coupon = { id: doc.id, ...doc.data() };

            // Validate coupon
            if (!coupon.isActive) {
                showCouponMessage(msgEl, 'This coupon is no longer active', 'error');
                return;
            }
            if (coupon.expiryDate && coupon.expiryDate.toDate() < new Date()) {
                showCouponMessage(msgEl, 'This coupon has expired', 'error');
                return;
            }
            if (coupon.maxUses > 0 && (coupon.currentUses || 0) >= coupon.maxUses) {
                showCouponMessage(msgEl, 'This coupon has reached its usage limit', 'error');
                return;
            }

            const totals = PremamCart.getTotal();
            if (coupon.minOrderValue > 0 && totals.subtotal < coupon.minOrderValue) {
                showCouponMessage(msgEl, `Minimum order of ${formatPrice(coupon.minOrderValue)} required`, 'error');
                return;
            }

            // Calculate discount
            let discountAmount = 0;
            if (coupon.discountType === 'percentage') {
                discountAmount = Math.round(totals.subtotal * coupon.discountValue / 100);
                if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
                    discountAmount = coupon.maxDiscount;
                }
            } else {
                discountAmount = coupon.discountValue;
            }

            // Don't let discount exceed subtotal
            if (discountAmount > totals.subtotal) {
                discountAmount = totals.subtotal;
            }

            appliedCoupon = {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                discountAmount,
                couponId: coupon.id
            };

            showCouponMessage(msgEl, `Coupon applied! You save ${formatPrice(discountAmount)}`, 'success');
            renderOrderSummary();
        } catch (error) {
            console.error('Coupon error:', error);
            showCouponMessage(msgEl, 'Error verifying coupon. Please try again.', 'error');
        }
    }

    function removeCoupon() {
        appliedCoupon = null;
        const input = document.getElementById('couponInput');
        const msgEl = document.getElementById('couponMessage');
        if (input) input.value = '';
        if (msgEl) { msgEl.textContent = ''; msgEl.className = 'coupon-message'; }
        renderOrderSummary();
    }

    function showCouponMessage(el, msg, type) {
        el.textContent = msg;
        el.className = `coupon-message coupon-${type}`;
    }

    // ============================================================
    // WHATSAPP ORDER FLOW
    // ============================================================

    function processOrder() {
        const formData = getFormData();

        // Validate form
        clearFieldErrors();
        const { isValid, errors } = validateForm(formData);

        if (!isValid) {
            Object.entries(errors).forEach(([field, message]) => {
                showFieldError(field, message);
            });
            if (window.PremamCart) PremamCart.showToast('Please fix the errors above', 'error');
            return;
        }

        // Check cart
        if (!window.PremamCart || PremamCart.getCount() === 0) {
            if (window.PremamCart) PremamCart.showToast('Your cart is empty!', 'error');
            return;
        }

        const items = PremamCart.getItems();
        const totals = PremamCart.getTotal();

        // Build WhatsApp message
        let msg = `🛍️ *NEW ORDER — Premam Silks*\n`;
        msg += `━━━━━━━━━━━━━━━━━━\n\n`;

        // Items
        msg += `*Order Items:*\n`;
        items.forEach((item, i) => {
            msg += `${i + 1}. *${item.name}*\n`;
            msg += `   Qty: ${item.quantity} × ${formatPrice(item.price)} = ${formatPrice(item.price * item.quantity)}\n`;
            if (item.id) {
                msg += `   🔗 ${window.location.origin}/product.html?id=${item.id}\n`;
            }
            msg += `\n`;
        });

        // Totals
        msg += `━━━━━━━━━━━━━━━━━━\n`;
        msg += `*Subtotal:* ${formatPrice(totals.subtotal)}\n`;
        if (appliedCoupon) {
            msg += `*Coupon (${appliedCoupon.code}):* -${formatPrice(appliedCoupon.discountAmount)} 🎉\n`;
        }
        msg += `*Shipping:* ${totals.freeShipping ? 'FREE ✅' : formatPrice(totals.shipping)}\n`;
        if (totals.gst > 0) msg += `*GST (${window.PremamDB?.APP_CONFIG?.gst || 0}%):* ${formatPrice(totals.gst)}\n`;
        const finalTotal = totals.total - (appliedCoupon ? appliedCoupon.discountAmount : 0);
        msg += `*Total: ${formatPrice(finalTotal)}*\n`;
        msg += `━━━━━━━━━━━━━━━━━━\n\n`;

        // Customer details
        msg += `*Customer Details:*\n`;
        msg += `👤 ${formData.name.trim()}\n`;
        msg += `📧 ${formData.email.trim()}\n`;
        msg += `📞 ${formData.phone.trim()}\n\n`;

        // Shipping address
        msg += `*Shipping Address:*\n`;
        msg += `📍 ${formData.address.trim()}\n`;
        msg += `${formData.city.trim()}, ${formData.state.trim()} - ${formData.pincode.trim()}\n`;

        // Notes
        if (formData.notes.trim()) {
            msg += `\n📝 *Notes:* ${formData.notes.trim()}\n`;
        }

        msg += `\n━━━━━━━━━━━━━━━━━━\n`;
        msg += `_Sent from premamsilks.com_`;

        // Open WhatsApp
        const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');

        // Increment coupon usage
        if (appliedCoupon && db) {
            try {
                db.collection('coupons').doc(appliedCoupon.couponId).update({
                    currentUses: firebase.firestore.FieldValue.increment(1)
                });
            } catch (e) { console.warn('Could not increment coupon usage:', e); }
            appliedCoupon = null;
        }

        // Clear cart after sending
        PremamCart.clear();

        // Show success message
        PremamCart.showToast('Order sent to WhatsApp! Our team will contact you shortly.', 'success');

        // Redirect to a thank you state after a short delay
        setTimeout(() => {
            document.querySelector('.checkout-form-section').innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366" width="80" height="80" style="margin-bottom: 20px;">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654z"/>
                    </svg>
                    <h2 style="color: #166534; margin-bottom: 12px;">Order Sent Successfully!</h2>
                    <p style="color: #4b5563; font-size: 1.05rem; line-height: 1.6; max-width: 450px; margin: 0 auto 24px;">
                        Your order details have been sent to our WhatsApp. Our team will reach out to you shortly to confirm the order and arrange payment.
                    </p>
                    <a href="shop.html" class="btn btn-primary" style="display: inline-block; padding: 12px 32px; border-radius: 8px; text-decoration: none;">Continue Shopping</a>
                </div>
            `;
        }, 1500);
    }

    // ============================================================
    // ORDER SUMMARY RENDERER
    // ============================================================

    function renderOrderSummary() {
        const container = document.getElementById('orderSummary');
        if (!container) return;

        const items = PremamCart.getItems();
        const totals = PremamCart.getTotal();

        if (items.length === 0) {
            container.innerHTML = `
                <div class="checkout-empty">
                    <p>Your cart is empty</p>
                    <a href="shop.html" class="btn btn-primary">Browse Sarees</a>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="order-items">
                ${items.map(item => `
                    <div class="order-item">
                        <div class="order-item-img">
                            <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
                            <span class="order-item-qty-badge">${item.quantity}</span>
                        </div>
                        <div class="order-item-info">
                            <span class="order-item-category">${escapeHTML(item.category || '')}</span>
                            <h4>${escapeHTML(item.name)}</h4>
                        </div>
                        <div class="order-item-price">${formatPrice(item.price * item.quantity)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="coupon-section">
                <label class="coupon-label">Have a coupon code?</label>
                <div class="coupon-input-row">
                    <input type="text" id="couponInput" class="coupon-input" placeholder="Enter code" value="${appliedCoupon ? appliedCoupon.code : ''}" ${appliedCoupon ? 'readonly' : ''}>
                    ${appliedCoupon
                        ? '<button type="button" class="coupon-btn coupon-remove-btn" onclick="PremamCheckout.removeCoupon()">Remove</button>'
                        : '<button type="button" class="coupon-btn coupon-apply-btn" onclick="PremamCheckout.applyCoupon()">Apply</button>'
                    }
                </div>
                <div id="couponMessage" class="coupon-message ${appliedCoupon ? 'coupon-success' : ''}">
                    ${appliedCoupon ? `Coupon applied! You save ${formatPrice(appliedCoupon.discountAmount)}` : ''}
                </div>
            </div>

            <div class="order-totals">
                <div class="order-total-row">
                    <span>Subtotal (${PremamCart.getCount()} items)</span>
                    <span>${formatPrice(totals.subtotal)}</span>
                </div>
                ${appliedCoupon ? `<div class="order-total-row discount-row">
                    <span>Discount (${appliedCoupon.code})</span>
                    <span>-${formatPrice(appliedCoupon.discountAmount)}</span>
                </div>` : ''}
                <div class="order-total-row">
                    <span>Shipping</span>
                    <span>${totals.freeShipping ? '<span class="free-tag">FREE</span>' : formatPrice(totals.shipping)}</span>
                </div>
                ${totals.gst > 0 ? `<div class="order-total-row">
                    <span>GST (${window.PremamDB?.APP_CONFIG?.gst || 0}%)</span>
                    <span>${formatPrice(totals.gst)}</span>
                </div>` : ''}
                <div class="order-total-row total">
                    <span>Total</span>
                    <span>${formatPrice(totals.total - (appliedCoupon ? appliedCoupon.discountAmount : 0))}</span>
                </div>
            </div>

            <div class="order-trust">
                <div class="trust-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>100% Authentic</span>
                </div>
                <div class="trust-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>Free Shipping Above ₹25,000</span>
                </div>
            </div>
        `;
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        renderOrderSummary();

        const payBtn = document.getElementById('payBtn');
        if (payBtn) {
            payBtn.addEventListener('click', (e) => {
                e.preventDefault();
                processOrder();
            });
        }

        // Real-time validation
        Object.keys(validators).forEach(field => {
            const input = document.getElementById(`checkout-${field}`);
            if (input) {
                input.addEventListener('blur', () => {
                    const error = validators[field](input.value);
                    showFieldError(field, error);
                });
                input.addEventListener('input', () => {
                    input.classList.remove('input-error');
                    const errorEl = input.parentElement.querySelector('.field-error');
                    if (errorEl) errorEl.remove();
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        processOrder,
        renderOrderSummary,
        validateForm,
        applyCoupon,
        removeCoupon
    };

})();

window.PremamCheckout = PremamCheckout;
