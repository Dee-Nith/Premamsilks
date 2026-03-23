/**
 * PREMAM SILKS — Lightweight Page View Tracker
 *
 * Records page views to Firestore for admin dashboard analytics.
 * Uses daily aggregation to minimize Firestore writes.
 */
(function() {
    'use strict';

    function trackPageView() {
        // Wait for Firebase to be ready
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
            return; // Firebase not loaded, skip tracking
        }

        var db = firebase.firestore();
        var today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        var page = window.location.pathname.replace(/\/$/, '') || '/index';
        // Simplify page name
        var pageName = page.replace('.html', '').replace(/^\//, '') || 'home';

        // Increment daily total page views
        db.collection('pageViews').doc(today).set({
            date: today,
            totalViews: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(function() {});

        // Increment per-page views for today
        var pageField = 'pages.' + pageName.replace(/[\/\.\[\]]/g, '_');
        var updateData = {};
        updateData[pageField] = firebase.firestore.FieldValue.increment(1);
        db.collection('pageViews').doc(today).set(updateData, { merge: true }).catch(function() {});
    }

    // Track after page loads (don't block rendering)
    if (document.readyState === 'complete') {
        setTimeout(trackPageView, 1000);
    } else {
        window.addEventListener('load', function() {
            setTimeout(trackPageView, 1000);
        });
    }
})();
