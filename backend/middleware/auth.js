const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key_for_dev';

// Middleware to authenticate JWT via HttpOnly Cookie
const authenticateToken = (req, res, next) => {
    // Check cookies first, fallback to Auth header if needed (for mobile/external API clients)
    const token = req.cookies.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }

        req.user = user; // Attach payload { userId, role, companyStatus, etc. }
        next();
    });
};

// Middleware to authorize specific roles
const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

module.exports = {
    authenticateToken,
    authorizeRole,
    JWT_SECRET
};
