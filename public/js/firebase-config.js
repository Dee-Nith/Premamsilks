/**
 * PREMAM SILKS — Firebase Configuration
 * 
 * Production-grade Firebase setup with Firestore, Auth, and Functions.
 * Replace the config values below with your actual Firebase project credentials.
 * 
 * Setup Instructions:
 * 1. Go to https://console.firebase.google.com
 * 2. Create project "PremamSilks"
 * 3. Enable Firestore Database
 * 4. Enable Authentication → Google Sign-In
 * 5. Copy your web app config below
 */

// ============================================================
// FIREBASE CONFIG — Replace with your project credentials
// ============================================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB5IC5VZx6crO3LiUNvXjKs5eM081L6ihA",
    authDomain: "premamsilks-ae138.firebaseapp.com",
    projectId: "premamsilks-ae138",
    storageBucket: "premamsilks-ae138.firebasestorage.app",
    messagingSenderId: "796854948336",
    appId: "1:796854948336:web:6ae436baa131812b014d35",
    measurementId: "G-CQ5DZVP8MZ"
};

// ============================================================
// RAZORPAY CONFIG
// ============================================================
const RAZORPAY_CONFIG = {
    keyId: "rzp_test_SH7h25wJ8JNUWJ",
    currency: "INR",
    businessName: "Premam Silks",
    businessLogo: "/images/logo.png",
    theme: {
        color: "#0d6157"  // Matches brand emerald green
    }
};

// ============================================================
// ADMIN CONFIG
// ============================================================
const ADMIN_CONFIG = {
    allowedEmails: ["premamsilks@gmail.com"],  // Emails allowed admin access
    sessionTimeout: 24 * 60 * 60 * 1000       // 24 hours in ms
};

// ============================================================
// APP CONFIG
// ============================================================
const APP_CONFIG = {
    siteName: "Premam Silks",
    currency: "₹",
    currencyCode: "INR",
    freeShippingThreshold: 25000,
    shippingCost: 500,
    gst: 0,                     // GST percentage (set to 0 until GST registration)
    whatsappNumber: "917200123457",
    contactEmail: "premamsilks@gmail.com",
    contactPhone: "+91 7200123457"
};

// ============================================================
// FIREBASE INITIALIZATION
// ============================================================
let db, auth, app;

function initializeFirebase() {
    try {
        // Check if Firebase SDK is loaded
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK not loaded. Running in offline mode.');
            return false;
        }

        app = firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        auth = firebase.auth();

        // Enable offline persistence for Firestore
        db.enablePersistence({ synchronizeTabs: true })
            .catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.warn('Firestore persistence failed: Multiple tabs open.');
                } else if (err.code === 'unimplemented') {
                    console.warn('Firestore persistence not supported in this browser.');
                }
            });

        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// ============================================================
// AUTH HELPERS
// ============================================================

/**
 * Sign in with Google popup
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });
    return auth.signInWithPopup(provider);
}

/**
 * Sign out current user
 */
async function signOut() {
    return auth.signOut();
}

/**
 * Check if user email is in admin list
 * @param {string} email 
 * @returns {boolean}
 */
function isAdminEmail(email) {
    return ADMIN_CONFIG.allowedEmails.includes(email.toLowerCase());
}

/**
 * Listen for auth state changes
 * @param {Function} callback - receives (user, isAdmin) 
 */
function onAuthStateChange(callback) {
    auth.onAuthStateChanged((user) => {
        if (user) {
            const isAdmin = isAdminEmail(user.email);
            callback(user, isAdmin);
        } else {
            callback(null, false);
        }
    });
}

// ============================================================
// FIRESTORE HELPERS
// ============================================================

const Collections = {
    PRODUCTS: 'products',
    ORDERS: 'orders',
    CATEGORIES: 'categories',
    SETTINGS: 'settings'
};

/**
 * Get all products with optional filters
 * @param {Object} filters - { category, color, minPrice, maxPrice, occasion, sortBy }
 * @returns {Promise<Array>}
 */
async function getProducts(filters = {}) {
    let query = db.collection(Collections.PRODUCTS)
        .where('isActive', '==', true);

    if (filters.category) {
        query = query.where('category', '==', filters.category);
    }
    if (filters.occasion) {
        query = query.where('occasion', '==', filters.occasion);
    }

    const snapshot = await query.get();
    let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Client-side filters (Firestore doesn't support multiple range queries)
    if (filters.minPrice) {
        products = products.filter(p => p.price >= filters.minPrice);
    }
    if (filters.maxPrice) {
        products = products.filter(p => p.price <= filters.maxPrice);
    }
    if (filters.color) {
        products = products.filter(p =>
            p.color && p.color.toLowerCase() === filters.color.toLowerCase()
        );
    }

    // Sorting
    switch (filters.sortBy) {
        case 'price-low':
            products.sort((a, b) => a.price - b.price);
            break;
        case 'price-high':
            products.sort((a, b) => b.price - a.price);
            break;
        case 'newest':
            products.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            break;
        case 'name':
            products.sort((a, b) => a.name.localeCompare(b.name));
            break;
        default:
            // Default: featured first, then newest
            products.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return products;
}

/**
 * Get single product by ID
 * @param {string} productId 
 * @returns {Promise<Object|null>}
 */
async function getProduct(productId) {
    const doc = await db.collection(Collections.PRODUCTS).doc(productId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

/**
 * Create a new order in Firestore
 * @param {Object} orderData 
 * @returns {Promise<string>} order ID
 */
async function createOrder(orderData) {
    const orderRef = await db.collection(Collections.ORDERS).add({
        ...orderData,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return orderRef.id;
}

/**
 * Update order with payment details
 * @param {string} orderId 
 * @param {Object} paymentData 
 */
async function updateOrderPayment(orderId, paymentData) {
    await db.collection(Collections.ORDERS).doc(orderId).update({
        ...paymentData,
        status: 'paid',
        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initializeFirebase);

// ============================================================
// CLOUD FUNCTIONS CONFIG
// ============================================================
const FUNCTIONS_BASE_URL = `https://asia-south1-${FIREBASE_CONFIG.projectId}.cloudfunctions.net`;

const CloudFunctions = {
    createOrder: `${FUNCTIONS_BASE_URL}/createOrder`,
    verifyPayment: `${FUNCTIONS_BASE_URL}/verifyPayment`,
    submitContact: `${FUNCTIONS_BASE_URL}/submitContact`,
    subscribeNewsletter: `${FUNCTIONS_BASE_URL}/subscribeNewsletter`
};

// Export for use across modules
window.PremamDB = {
    getProducts,
    getProduct,
    createOrder,
    updateOrderPayment,
    signInWithGoogle,
    signOut,
    isAdminEmail,
    onAuthStateChange,
    Collections,
    CloudFunctions,
    FIREBASE_CONFIG,
    RAZORPAY_CONFIG,
    ADMIN_CONFIG,
    APP_CONFIG
};
