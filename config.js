// config.js — Single source of truth for API URLs
// Works for both local development and production (Vercel → Render)
(function () {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    // If we are on local but NOT on port 3000 (e.g. Live Server on 5500), 
    // we must point to the backend on port 3000 explicitly.
    const LOCAL_BACKEND = location.port !== '3000' ? `http://${location.hostname}:3000` : '';

    // Production backend URL
    const PRODUCTION_API = 'https://project-1-igtl.onrender.com';

    // Set the global API base URL
    window.API_BASE_URL = isLocal ? LOCAL_BACKEND : PRODUCTION_API;

    // For socket.io connections
    window.SOCKET_BASE_URL = isLocal ? window.API_BASE_URL||"" : PRODUCTION_API;
})();
