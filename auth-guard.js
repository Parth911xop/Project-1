// Auth Guard - Checks if user session via JWT is valid, with auto-refresh
(async function checkAuth() {
    const path = window.location.pathname;
    const API = window.API_BASE_URL || '';

    // Whitelist (public pages that don't need auth)
    const publicPages = ['/', 'index.html', 'prices.html', 'services.html', 'company.html'];
    if (publicPages.some(p => path.endsWith(p))) return;

    // Hide body while authenticating to prevent flash of content
    document.documentElement.style.display = 'none';

    async function getSession() {
        try {
            const res = await fetch(`${API}/api/auth/me`, {
                method: 'GET',
                credentials: 'include'
            });
            if (!res.ok) return { success: false };
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return await res.json();
            }
            return { success: false };
        } catch (e) {
            return { success: false };
        }
    }

    async function refreshSession() {
        try {
            const res = await fetch(`${API}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });
            if (!res.ok) return { success: false };
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return await res.json();
            }
            return { success: false };
        } catch (e) {
            return { success: false };
        }
    }

    try {
        let data = await getSession();

        // If access token expired, try refresh token automatically
        if (!data.success) {
            const refreshResult = await refreshSession();
            if (refreshResult.success) {
                data = await getSession(); // Retry with new access token
            }
        }

        if (path.includes('auth.html')) {
            if (data.success && data.user) {
                routeUser(data.user.role); // Already logged in
            } else {
                document.documentElement.style.display = '';
            }
            return;
        }

        if (!data.success || !data.user) {
            console.warn('Session invalid, redirecting to login...');
            // Save current email in localStorage so auth.html can pre-fill it
            window.location.href = 'auth.html';
            return;
        }

        // Valid session — store safe display metadata
        const user = data.user;
        const role = user.role;
        localStorage.setItem('userId', user.userId);
        localStorage.setItem('userName', user.name || '');
        localStorage.setItem('userEmail', user.email || '');
        if (user.companyStatus) localStorage.setItem('companyStatus', user.companyStatus);

        // Role-Based Page Access Control
        const allowedPages = {
            customer: ['shipments.html', 'track.html', 'wizard.html', 'finance.html', 'analytics.html', 'profile.html', 'documents.html', 'schedules.html', 'support.html', 'settings.html'],
            company: ['company-dashboard.html', 'vehicles.html', 'earnings.html', 'profile.html', 'analytics.html', 'documents.html', 'schedules.html', 'support.html', 'settings.html', 'shipments.html', 'wizard.html'],
            admin: ['admin-dashboard.html', 'shipments.html', 'finance.html', 'analytics.html', 'profile.html', 'documents.html', 'schedules.html', 'support.html', 'settings.html', 'track.html']
        };

        const currentPage = path.split('/').pop();

        if (allowedPages[role] && !allowedPages[role].includes(currentPage)) {
            console.warn(`Role "${role}" cannot access "${currentPage}", redirecting...`);
            routeUser(role);
            return;
        }

        document.documentElement.style.display = '';

    } catch (error) {
        console.error('Auth Guard Error:', error);
        document.documentElement.style.display = '';
        // Only redirect to auth if we're on a protected page
        if (!path.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
})();

function routeUser(role) {
    if (role === 'admin') window.location.href = 'admin-dashboard.html';
    else if (role === 'company') window.location.href = 'company-dashboard.html';
    else window.location.href = 'shipments.html';
}

// Global Logout Helper
async function handleLogout() {
    const API = window.API_BASE_URL || '';
    try {
        await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) { }
    localStorage.clear();
    window.location.href = 'auth.html';
}

async function logout() { return handleLogout(); }

// Global Fetch Interceptor — auto-attach credentials to all API calls
const originalFetch = window.fetch;
window.fetch = async function () {
    let [resource, config] = arguments;
    if (typeof resource === 'string' && resource.includes('/api/')) {
        if (!config) config = {};
        config.credentials = 'include';
    }
    return originalFetch(resource, config);
};

const AuthGuard = {
    verifySession: async function () {
        const API = window.API_BASE_URL || '';
        const res = await fetch(`${API}/api/auth/me`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await res.json();
        if (!data.success || !data.user) throw new Error('Session invalid');
        return data.user;
    },
    logout: async function () { return handleLogout(); }
};
