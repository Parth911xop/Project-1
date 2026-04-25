// config.js — Single source of truth for API URLs
// Works for both local development and production (Vercel → Render)
(function () {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    // Production backend URL (your Render deployment)
    const PRODUCTION_API = 'https://project-1-igtl.onrender.com';

    // Set the global API base URL
    window.API_BASE_URL = isLocal ? '' : PRODUCTION_API;

    // For socket.io connections
    window.SOCKET_BASE_URL = isLocal ? `http://${location.hostname}:3000` : PRODUCTION_API;
})();
