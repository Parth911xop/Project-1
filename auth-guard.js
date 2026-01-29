// Auth Guard - Checks if user is logged in
(function checkAuth() {
    const userId = localStorage.getItem('userId');
    const path = window.location.pathname;

    // Whitelist (pages that don't need auth)
    // Note: '/' matches root index.html effectively on many servers
    if (path.endsWith('/') || path.endsWith('index.html')) return;
    if (path.includes('auth.html')) {
        if (userId) window.location.href = 'shipments.html';
        return;
    }
    if (path.includes('prices.html') || path.includes('services.html') || path.includes('company.html') || path.includes('wizard.html')) return;

    if (!userId) {
        // Redirect to login
        console.warn("User not logged in, redirecting...");
        window.location.href = 'auth.html';
    }
})();

// Global Logout Helper
function logout() {
    localStorage.removeItem('userId');
    window.location.href = 'auth.html';
}
