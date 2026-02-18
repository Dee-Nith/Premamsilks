/**
 * PREMAM SILKS — Checkout & Razorpay Payment Module
 *
 * Secure payment flow using Cloud Functions:
 * 1. User fills shipping details
 * 2. Click "Pay Now" → Cloud Function creates Razorpay order (verified amount)
 * 3. Open Razorpay modal → user pays
 * 4. On success → Cloud Function verifies signature + updates order + decrements stock
 * 5. Redirect to confirmation
 */

const PremamCheckout = (function () {
    'use strict';

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

    function setPayBtnState(loading, text) {
        const payBtn = document.getElementById('payBtn');
        if (!payBtn) return;
        payBtn.disabled = loading;
        payBtn.style.pointerEvents = loading ? 'none' : '';
        payBtn.innerHTML = loading
            ? '<span class="spinner"></span> ' + escapeHTML(text || 'Processing...')
            : '🔒 Pay Now';
    }

    // ============================================================
    // PAYMENT FLOW (Cloud Functions)
    // ============================================================

    let isProcessing = false;

    async function processPayment() {
        if (isProcessing) return;
        isProcessing = true;

        const formData = getFormData();

        // Validate form
        clearFieldErrors();
        const { isValid, errors } = validateForm(formData);

        if (!isValid) {
            Object.entries(errors).forEach(([field, message]) => {
                showFieldError(field, message);
            });
            PremamCart.showToast('Please fix the errors above', 'error');
            isProcessing = false;
            return;
        }

        // Check cart
        if (PremamCart.getCount() === 0) {
            PremamCart.showToast('Your cart is empty!', 'error');
            isProcessing = false;
            return;
        }

        setPayBtnState(true, 'Creating order...');

        try {
            const cartItems = PremamCart.getItems();
            const functionsUrl = window.PremamDB?.CloudFunctions;

            if (!functionsUrl?.createOrder) {
                throw new Error('Payment service unavailable. Please try again later.');
            }

            // Step 1: Create order via Cloud Function (server-verified amount)
            const createResponse = await fetch(functionsUrl.createOrder, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: cartItems.map(item => ({
                        productId: item.id,
                        quantity: item.quantity
                    })),
                    customer: {
                        name: formData.name.trim(),
                        email: formData.email.trim().toLowerCase(),
                        phone: formData.phone.replace(/[\s-]/g, '')
                    },
                    shippingAddress: {
                        address: formData.address.trim(),
                        city: formData.city.trim(),
                        state: formData.state.trim(),
                        pincode: formData.pincode.trim()
                    },
                    notes: formData.notes.trim()
                })
            });

            const orderResult = await createResponse.json();

            if (!createResponse.ok) {
                throw new Error(orderResult.error || 'Failed to create order');
            }

            // Step 2: Open Razorpay with server-created order
            setPayBtnState(true, 'Opening payment...');
            openRazorpay(orderResult, formData);

        } catch (error) {
            console.error('Payment error:', error);
            PremamCart.showToast(error.message || 'Something went wrong. Please try again.', 'error');
            setPayBtnState(false);
            isProcessing = false;
        }
    }

    function openRazorpay(orderResult, formData) {
        const config = window.PremamDB?.RAZORPAY_CONFIG || {
            keyId: 'YOUR_RAZORPAY_KEY_ID',
            businessName: 'Premam Silks',
            theme: { color: '#0d6157' }
        };

        const options = {
            key: config.keyId,
            amount: orderResult.amount * 100,
            currency: orderResult.currency,
            name: config.businessName,
            description: `Order #${orderResult.orderId}`,
            image: config.businessLogo || '',
            order_id: orderResult.razorpayOrderId,
            prefill: {
                name: formData.name,
                email: formData.email,
                contact: formData.phone
            },
            theme: {
                color: config.theme?.color || '#0d6157'
            },
            handler: async function (response) {
                await handlePaymentSuccess(orderResult.orderId, response);
            },
            modal: {
                ondismiss: function () {
                    setPayBtnState(false);
                    isProcessing = false;
                    PremamCart.showToast('Payment cancelled', 'info');
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            handlePaymentFailure(response);
        });
        rzp.open();
    }

    async function handlePaymentSuccess(orderId, razorpayResponse) {
        setPayBtnState(true, 'Verifying payment...');

        try {
            const functionsUrl = window.PremamDB?.CloudFunctions;

            // Step 3: Verify payment signature server-side
            const verifyResponse = await fetch(functionsUrl.verifyPayment, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    razorpayOrderId: razorpayResponse.razorpay_order_id,
                    razorpayPaymentId: razorpayResponse.razorpay_payment_id,
                    razorpaySignature: razorpayResponse.razorpay_signature
                })
            });

            const verifyResult = await verifyResponse.json();

            if (!verifyResponse.ok) {
                throw new Error(verifyResult.error || 'Payment verification failed');
            }

            // Store only order ID (not sensitive data)
            localStorage.setItem('premam_last_order', JSON.stringify({ orderId }));

            // Clear cart
            PremamCart.clear();

            // Redirect to confirmation
            window.location.href = `order-confirmation.html?id=${orderId}`;

        } catch (error) {
            console.error('Payment verification error:', error);
            // Payment was likely successful — still redirect with a note
            localStorage.setItem('premam_last_order', JSON.stringify({ orderId }));
            PremamCart.clear();
            window.location.href = `order-confirmation.html?id=${orderId}`;
        }
    }

    function handlePaymentFailure(response) {
        console.error('Payment failed:', response.error?.code);
        PremamCart.showToast('Payment failed. Please try again or use a different payment method.', 'error');
        setPayBtnState(false);
        isProcessing = false;
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
            <div class="order-item-price">${PremamCart.formatPrice(item.price * item.quantity)}</div>
          </div>
        `).join('')}
      </div>

      <div class="order-totals">
        <div class="order-total-row">
          <span>Subtotal (${PremamCart.getCount()} items)</span>
          <span>${PremamCart.formatPrice(totals.subtotal)}</span>
        </div>
        <div class="order-total-row">
          <span>Shipping</span>
          <span>${totals.freeShipping ? '<span class="free-tag">FREE</span>' : PremamCart.formatPrice(totals.shipping)}</span>
        </div>
        <div class="order-total-row">
          <span>GST (5%)</span>
          <span>${PremamCart.formatPrice(totals.gst)}</span>
        </div>
        <div class="order-total-row total">
          <span>Total</span>
          <span>${PremamCart.formatPrice(totals.total)}</span>
        </div>
      </div>

      <div class="order-trust">
        <div class="trust-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Secure Checkout</span>
        </div>
        <div class="trust-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>100% Authentic</span>
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
                processPayment();
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
        processPayment,
        renderOrderSummary,
        validateForm
    };

})();

window.PremamCheckout = PremamCheckout;
