/**
 * PREMAM SILKS — Checkout & Razorpay Payment Module
 * 
 * Handles checkout form, address collection, order creation,
 * and Razorpay payment processing.
 * 
 * Flow:
 * 1. User fills shipping details
 * 2. Click "Pay Now" → create order in Firestore
 * 3. Open Razorpay modal → user pays
 * 4. On success → update order with payment ID → redirect to confirmation
 * 5. On failure → show error, allow retry
 */

const PremamCheckout = (function () {
    'use strict';

    // ============================================================
    // FORM VALIDATION
    // ============================================================

    const validators = {
        name: (val) => val.trim().length >= 2 ? '' : 'Name must be at least 2 characters',
        email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? '' : 'Enter a valid email address',
        phone: (val) => /^[6-9]\d{9}$/.test(val.replace(/\s/g, '')) ? '' : 'Enter a valid 10-digit phone number',
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

        // Remove existing error
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
    // ORDER CREATION
    // ============================================================

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

    function buildOrderData(formData) {
        const cartItems = PremamCart.getItems();
        const totals = PremamCart.getTotal();

        return {
            customer: {
                name: formData.name.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: formData.phone.replace(/\s/g, ''),
            },
            shippingAddress: {
                address: formData.address.trim(),
                city: formData.city.trim(),
                state: formData.state.trim(),
                pincode: formData.pincode.trim(),
                country: 'India'
            },
            items: cartItems.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            itemCount: PremamCart.getCount(),
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            gst: totals.gst,
            totalAmount: totals.total,
            notes: formData.notes.trim(),
            paymentMethod: 'razorpay',
            status: 'pending'
        };
    }

    // ============================================================
    // RAZORPAY PAYMENT
    // ============================================================

    async function processPayment() {
        const formData = getFormData();

        // Validate
        clearFieldErrors();
        const { isValid, errors } = validateForm(formData);

        if (!isValid) {
            Object.entries(errors).forEach(([field, message]) => {
                showFieldError(field, message);
            });
            PremamCart.showToast('Please fix the errors above', 'error');
            return;
        }

        // Check cart
        if (PremamCart.getCount() === 0) {
            PremamCart.showToast('Your cart is empty!', 'error');
            return;
        }

        const orderData = buildOrderData(formData);
        const payBtn = document.getElementById('payBtn');

        try {
            // Disable button
            if (payBtn) {
                payBtn.disabled = true;
                payBtn.innerHTML = '<span class="spinner"></span> Processing...';
            }

            // Create order in Firestore (if available)
            let orderId = 'ORD-' + Date.now();

            if (window.PremamDB && typeof window.PremamDB.createOrder === 'function') {
                try {
                    orderId = await window.PremamDB.createOrder(orderData);
                } catch (dbError) {
                    console.warn('Firestore order creation failed, using local ID:', dbError);
                }
            }

            // Open Razorpay checkout
            openRazorpay(orderId, orderData);

        } catch (error) {
            console.error('Payment error:', error);
            PremamCart.showToast('Something went wrong. Please try again.', 'error');

            if (payBtn) {
                payBtn.disabled = false;
                payBtn.innerHTML = '🔒 Pay Now';
            }
        }
    }

    function openRazorpay(orderId, orderData) {
        const config = window.PremamDB?.RAZORPAY_CONFIG || {
            keyId: 'YOUR_RAZORPAY_KEY_ID',
            businessName: 'Premam Silks',
            theme: { color: '#8B1A2B' }
        };

        const options = {
            key: config.keyId,
            amount: orderData.totalAmount * 100, // Razorpay expects amount in paise
            currency: 'INR',
            name: config.businessName,
            description: `Order #${orderId} — ${orderData.itemCount} item(s)`,
            image: config.businessLogo || '',
            order_id: '', // Will be set when using Firebase Functions for order creation
            prefill: {
                name: orderData.customer.name,
                email: orderData.customer.email,
                contact: orderData.customer.phone
            },
            notes: {
                orderId: orderId,
                address: `${orderData.shippingAddress.address}, ${orderData.shippingAddress.city}`
            },
            theme: {
                color: config.theme.color
            },
            handler: async function (response) {
                // Payment successful
                await handlePaymentSuccess(orderId, response, orderData);
            },
            modal: {
                ondismiss: function () {
                    // Payment cancelled
                    const payBtn = document.getElementById('payBtn');
                    if (payBtn) {
                        payBtn.disabled = false;
                        payBtn.innerHTML = '🔒 Pay Now';
                    }
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

    async function handlePaymentSuccess(orderId, razorpayResponse, orderData) {
        try {
            // Update order in Firestore with payment details
            if (window.PremamDB && typeof window.PremamDB.updateOrderPayment === 'function') {
                await window.PremamDB.updateOrderPayment(orderId, {
                    razorpayPaymentId: razorpayResponse.razorpay_payment_id,
                    razorpayOrderId: razorpayResponse.razorpay_order_id || '',
                    razorpaySignature: razorpayResponse.razorpay_signature || ''
                });
            }

            // Save order to localStorage for confirmation page
            const completedOrder = {
                orderId,
                ...orderData,
                razorpayPaymentId: razorpayResponse.razorpay_payment_id,
                paidAt: new Date().toISOString(),
                status: 'paid'
            };

            localStorage.setItem('premam_last_order', JSON.stringify(completedOrder));

            // Clear cart
            PremamCart.clear();

            // Send WhatsApp notification (optional)
            sendWhatsAppNotification(completedOrder);

            // Redirect to confirmation page
            window.location.href = `order-confirmation.html?id=${orderId}`;

        } catch (error) {
            console.error('Post-payment processing error:', error);
            // Payment was successful, so still redirect
            window.location.href = `order-confirmation.html?id=${orderId}`;
        }
    }

    function handlePaymentFailure(response) {
        console.error('Payment failed:', response.error);
        PremamCart.showToast('Payment failed: ' + response.error.description, 'error');

        const payBtn = document.getElementById('payBtn');
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '🔒 Pay Now';
        }
    }

    /**
     * Send WhatsApp notification to business about new order
     */
    function sendWhatsAppNotification(order) {
        const config = window.PremamDB?.APP_CONFIG || { whatsappNumber: '917200123457' };
        const itemsList = order.items.map(i => `${i.name} × ${i.quantity}`).join(', ');
        const msg = `🎉 New Order #${order.orderId}!\n\nCustomer: ${order.customer.name}\nPhone: ${order.customer.phone}\nItems: ${itemsList}\nTotal: ₹${order.totalAmount.toLocaleString('en-IN')}\nPayment: ${order.razorpayPaymentId}`;

        // Open WhatsApp in new tab (silent notification)
        const url = `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(msg)}`;
        // Don't auto-open — this can be triggered from admin
        console.log('WhatsApp notification ready:', url);
    }

    // ============================================================
    // CHECKOUT PAGE RENDERER
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
              <img src="${item.image}" alt="${item.name}">
              <span class="order-item-qty-badge">${item.quantity}</span>
            </div>
            <div class="order-item-info">
              <span class="order-item-category">${item.category}</span>
              <h4>${item.name}</h4>
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
        // Render order summary
        renderOrderSummary();

        // Bind pay button
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

    // Auto-init
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
