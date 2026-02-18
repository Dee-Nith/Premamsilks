/**
 * PREMAM SILKS — Shared Utilities
 */

window.PremamUtils = {
    /**
     * Escape HTML entities to prevent XSS
     */
    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
};
