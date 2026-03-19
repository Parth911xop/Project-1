const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { Pool } = require('pg');
const dns = require('dns');
const { URL } = require('url');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const { authenticateToken, authorizeRole, JWT_SECRET } = require('./middleware/auth');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'demo',
    api_key: process.env.CLOUDINARY_API_KEY || 'demo',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'demo'
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'smart_shipping_docs',
        resource_type: 'auto'
    }
});
const upload = multer({ storage: storage });

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your provider
    auth: {
        user: process.env.EMAIL_USER || 'test@example.com',
        pass: process.env.EMAIL_PASS || 'password'
    }
});

const app = express();
const httpServer = http.createServer(app);

// Socket.io – CORS must match the frontend origins
const corsOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

const io = new Server(httpServer, {
    cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));

// cookieParser MUST run before any route that needs JWT cookie auth
app.use(cookieParser());

// 🚨 CRITICAL: Stripe Webhook route uses express.raw() internally — mount payment router
// BEFORE express.json() so the webhook can capture the raw buffer.
// Non-webhook payment routes (create-checkout-session, refund) use express.json() per-route.
const paymentRouter = require('./routes/payment');
app.use('/api/payment', paymentRouter);

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Declare pool globally so routes can use it
let pool;

// Helper to resolve DB Host using Google DNS
const resolveDbConfig = async () => {
    const dbUrlStr = process.env.DATABASE_URL;
    if (!dbUrlStr) {
        throw new Error("DATABASE_URL is missing!");
    }

    const dbUrl = new URL(dbUrlStr);
    const hostname = dbUrl.hostname;

    console.log(`🔍 Resolving DB host: ${hostname} using native DNS...`);

    return new Promise((resolve, reject) => {
        // Use dns.lookup which uses the OS's native getaddrinfo (works with VPNs/Proxies)
        dns.lookup(hostname, (err, address, family) => {
            if (err) {
                return reject(err);
            }
            if (!address) {
                return reject(new Error("No IP address found for DB host"));
            }

            console.log(`✅ Resolved ${hostname} to ${address}`);

            const config = {
                user: dbUrl.username,
                password: dbUrl.password,
                host: address, // Use resolved IP
                port: dbUrl.port || 5432,
                database: dbUrl.pathname.split('/')[1], // remove leading slash
                ssl: {
                    rejectUnauthorized: false,
                    servername: hostname // Crucial for Neon SNI
                }
            };
            resolve(config);
        });
    });
};

// Create Users Table if not exists
const createUsersTable = async () => {
    const query = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        name VARCHAR(255),
        otp_code VARCHAR(10),
        role VARCHAR(20) DEFAULT 'customer',
        company_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;
    try {
        await pool.query(query);
        // Ensure new columns exist if table was created in an older version of the app
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'customer';`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_status VARCHAR(20) DEFAULT 'pending';`);

        console.log("✅ Table 'users' ready and schema updated");
    } catch (err) {
        console.error("❌ Error creating/updating 'users' table:", err);
    }
};

// Create Company Profiles Table
const createCompanyProfilesTable = async () => {
    const query = `
    CREATE TABLE IF NOT EXISTS company_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        company_name VARCHAR(255),
        documents_url VARCHAR(255),
        total_deliveries INTEGER DEFAULT 0,
        on_time_rate NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;
    try {
        await pool.query(query);
        // Ensure columns exist if table was created before Phase 2 enhancements
        await pool.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS documents_url VARCHAR(255);`);
        await pool.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0;`);
        await pool.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS on_time_rate NUMERIC DEFAULT 0;`);

        console.log("✅ Table 'company_profiles' ready");
    } catch (err) {
        console.error("❌ Error creating/updating 'company_profiles' table:", err);
    }
};

// Mount Notification Routes
let createNotification = async () => { }; // No-op fallback
const setupNotificationRoutes = async () => {
    try {
        const { router: notificationRouter, createNotification: createNotifyFn } = require('./notifications')(pool);
        createNotification = createNotifyFn;
        app.use('/api/notifications', authenticateToken, notificationRouter);
        console.log("✅ Notification routes loaded");
    } catch (err) {
        console.error("Failed to load notification routes:", err);
    }
}

// Mount Shipment Routes
const setupShipmentRoutes = async (io) => {
    try {
        const shipmentRouterFn = require('./shipment');
        const shipmentRouter = await shipmentRouterFn(pool, createNotification, io);
        app.use('/api/shipment', authenticateToken, shipmentRouter);
        console.log("✅ Shipment routes loaded (Socket.io aware)");
    } catch (err) {
        console.error("Failed to load shipment routes:", err);
    }
};

// Mount Journey Routes
const setupJourneyRoutes = async () => {
    try {
        const journeyRouterFn = require('./journey');
        const journeyRouter = await journeyRouterFn(pool);

        app.use('/api/journey', authenticateToken, journeyRouter);

        // Handle /update-journey (legacy compatibility)
        app.post('/update-journey', authenticateToken, (req, res, next) => {
            req.url = '/update';
            journeyRouter(req, res, next);
        });
        console.log("✅ Journey routes loaded");

    } catch (err) {
    }
};

// Mount Finance Routes
// Mount Finance Routes
const setupFinanceRoutes = async () => {
    try {
        const financeRouterFn = require('./finance');
        const financeRouter = await financeRouterFn(pool);
        app.use('/api/finance', authenticateToken, financeRouter);
        console.log("✅ Finance routes loaded");
    } catch (err) {
        console.error("Failed to load finance routes:", err);
    }
};

// Mount Company Routes
const setupCompanyRoutes = async () => {
    try {
        const companyRouterFn = require('./routes/company');
        const companyRouter = await companyRouterFn(pool, createNotification);

        app.use('/api/company', authenticateToken, companyRouter);
        app.use('/api/company', authenticateToken, authorizeRole(['company']));
        console.log("✅ Company routes loaded");
    } catch (err) {
        console.error("Failed to load company routes:", err);
    }
};

// Mount Document Routes
const setupDocumentRoutes = async () => {
    try {
        const { router: documentRouter, createDocumentsTable } = require('./documents');
        await createDocumentsTable(pool);
        app.use('/api/documents', authenticateToken, documentRouter);
        console.log("✅ Document routes loaded");
    } catch (err) {
        console.error("Failed to load document routes:", err);
    }
};

// Mount Customs Routes
const setupCustomsRoutes = async () => {
    try {
        const { router: customsRouter, createCustomsTable } = require('./customs');
        await createCustomsTable(pool);
        app.use('/api/customs', authenticateToken, customsRouter);
        console.log("✅ Customs routes loaded");
    } catch (err) {
        console.error("Failed to load customs routes:", err);
    }
};

// Mount Packing List Routes
const setupPackingListRoutes = async () => {
    try {
        const { router: packingListRouter, createPackingTables } = require('./packingList');
        await createPackingTables(pool);
        app.use('/api/packing-list', authenticateToken, packingListRouter);
        console.log("✅ Packing List routes loaded");
    } catch (err) {
        console.error("Failed to load packing list routes:", err);
    }
};

// Mount Support Routes
const setupSupportRoutes = async () => {
    try {
        const supportRouterFn = require('./support');
        const supportRouter = await supportRouterFn(pool);
        app.use('/api/support', authenticateToken, supportRouter);
        console.log("✅ Support routes loaded");
    } catch (err) {
        console.error("Failed to load support routes:", err);
    }
};

// Create Admin Tables (Ports, Routes, Settings, Tickets)
const createAdminTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ports (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                country VARCHAR(100) NOT NULL,
                state VARCHAR(100),
                code VARCHAR(50) UNIQUE NOT NULL,
                congestion_index DECIMAL(3,2) DEFAULT 1.0,
                handling_fees_per_kg DECIMAL(10,2) DEFAULT 0,
                latitude DECIMAL(10,7),
                longitude DECIMAL(10,7),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Migration for existing tables to V2 Schema
        try { await pool.query("ALTER TABLE ports RENAME COLUMN cost_per_cbm TO handling_fees_per_kg;"); } catch(e){}
        try { await pool.query("ALTER TABLE ports RENAME COLUMN congestion TO congestion_index;"); } catch(e){}
        
        // Ensure cols exist and types are correct
        await pool.query("ALTER TABLE ports ADD COLUMN IF NOT EXISTS state VARCHAR(100);");
        await pool.query("ALTER TABLE ports ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);");
        await pool.query("ALTER TABLE ports ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);");
        await pool.query("ALTER TABLE ports ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;");
        
        // Explicitly force types for V2 compatibility
        try {
            await pool.query(`ALTER TABLE ports ALTER COLUMN congestion_index TYPE DECIMAL(3,2) 
                             USING (CASE 
                                 WHEN congestion_index::text = 'Low' THEN 1.0 
                                 WHEN congestion_index::text = 'Medium' THEN 1.5 
                                 WHEN congestion_index::text = 'High' THEN 2.0 
                                 WHEN congestion_index::text ~ '^[0-9.]+$' THEN congestion_index::decimal
                                 ELSE 1.0 
                             END)`);
        } catch(e) { console.error("Congestion type fix error:", e); }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                from_port_id INTEGER REFERENCES ports(id) ON DELETE CASCADE,
                to_port_id INTEGER REFERENCES ports(id) ON DELETE CASCADE,
                mode VARCHAR(50), 
                duration_days INTEGER,
                base_price_per_cbm DECIMAL(12,2),
                is_fastest BOOLEAN DEFAULT false,
                is_cheapest BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
                issue_type VARCHAR(100),
                description TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'Open',
                priority VARCHAR(20) DEFAULT 'Medium',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Initialize default settings if empty
        const checkSettings = await pool.query("SELECT COUNT(*) FROM system_settings");
        if (checkSettings.rows[0].count == 0) {
            const defaults = {
                currency: 'INR',
                unitSystem: 'metric',
                taxRate: 18,
                insuranceRate: 1.5,
                fuelSurcharge: 8,
                platformFee: 2
            };
            await pool.query("INSERT INTO system_settings (key, value) VALUES ('global_config', $1)", [defaults]);
            console.log("✅ Default system settings initialized");
        }

        console.log("✅ Admin management tables ready");
    } catch (err) {
        console.error("❌ Error creating admin tables:", err);
    }
};

// Auth Endpoints
app.post('/request-otp', async (req, res) => {
    console.log("Request OTP:", req.body);
    const { email, phone, fullName, authMethod, useCase } = req.body;
    const identifier = (authMethod === 'phone' && phone) ? phone : email;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    let role = 'customer';
    if (useCase === 'Shipping Company') role = 'company';
    if (useCase === 'Admin') {
        if (email.toLowerCase() === 'parthrathod912004@gmail.com') {
            role = 'admin';
        } else {
            return res.status(403).json({ success: false, message: 'Unauthorized email address for the Admin role.' });
        }
    }

    try {
        if (!pool) throw new Error("Database not connected");

        const check = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR phone = $2',
            [identifier, identifier]
        );

        if (check.rows.length === 0) {
            const insertUserResult = await pool.query(
                'INSERT INTO users (email, phone, name, otp_code, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [email || identifier, phone || null, fullName || 'User', otp, role]
            );

            if (role === 'company') {
                const userId = insertUserResult.rows[0].id;
                await pool.query(
                    'INSERT INTO company_profiles (user_id, company_name) VALUES ($1, $2)',
                    [userId, fullName] // simplified for now: using fullName as companyName
                );
            }

            // Notify Admin of NEW Company signup
            if (role === 'company') {
                const adminRes = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
                if (adminRes.rows.length > 0) {
                    await createNotification(
                        adminRes.rows[0].id,
                        'info',
                        'New Company Registration',
                        `Company "${fullName}" has registered and is pending approval.`,
                        '/admin-dashboard.html'
                    ).catch(e => console.error("Notif Error:", e));
                }
            }
        } else {
            if (useCase) {
                await pool.query(
                    'UPDATE users SET otp_code = $1, role = $4 WHERE email = $2 OR phone = $3',
                    [otp, identifier, identifier, role]
                );
            } else {
                await pool.query(
                    'UPDATE users SET otp_code = $1 WHERE email = $2 OR phone = $3',
                    [otp, identifier, identifier]
                );
            }
        }

        console.log(`Generated OTP for ${identifier}: ${otp}`);

        // Send Real Email OTP if identifier involves email
        if (authMethod !== 'phone' && identifier.includes('@')) {
            try {
                if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                    await transporter.sendMail({
                        from: `"Smart Shipping" <${process.env.EMAIL_USER}>`,
                        to: identifier,
                        subject: 'Your Smart Shipping Login Code',
                        text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
                        html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                                <h2>Smart Shipping Login</h2>
                                <p>Your verification code is: <strong style="font-size: 24px;">${otp}</strong></p>
                                <p>Do not share this code with anyone.</p>
                               </div>`
                    });
                    console.log(`📧 OTP Email sent successfully to ${identifier}`);
                }
            } catch (emailErr) {
                console.error("Failed to send OTP email:", emailErr);
            }
        }

        res.json({ success: true, message: 'OTP Sent', otp: otp }); // kept otp in response for ease of dev testing without real email

    } catch (err) {
        console.error("Auth Error:", err);
        res.status(500).json({ success: false, message: 'Server Auth Error: ' + err.message });
    }
});

app.post('/verify-otp', async (req, res) => {
    const { identifier, otp } = req.body;
    try {
        if (!pool) throw new Error("Database not connected");

        const result = await pool.query(
            'SELECT id, email, phone, name, role, company_status FROM users WHERE (email = $1 OR phone = $1) AND otp_code = $2',
            [identifier, otp]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log(`[VERIFY-OTP] Success for ${user.email}. Role: ${user.role}`);

            // Generate Access Token (8 hours)
            const token = jwt.sign(
                { userId: user.id, role: user.role, companyStatus: user.company_status, name: user.name, email: user.email },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            // Generate Refresh Token (7 days)
            const refreshToken = jwt.sign(
                { userId: user.id },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            // Set HttpOnly Cookies
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 8 * 60 * 60 * 1000 // 8 hours
            });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/api/auth/refresh',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.json({ success: true, userId: user.id, user: user, role: user.role, companyStatus: user.company_status });
        } else {
            console.log(`[VERIFY-OTP] Invalid OTP for ${identifier}. OTP: ${otp}`);
            res.json({ success: false, message: 'Invalid OTP' });
        }
    } catch (err) {
        console.error("[VERIFY-OTP] Setup/Verify Error:", err);
        res.status(500).json({ success: false, message: 'Verification Error' });
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    // If the middleware passes, req.user contains the decoded JWT
    res.json({ success: true, user: req.user });
});

app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token' });

    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);

        // Fetch fresh user data just in case roles/status changed
        const userRes = await pool.query('SELECT id, name, email, role, company_status FROM users WHERE id = $1', [decoded.userId]);
        if (userRes.rows.length === 0) return res.status(403).json({ success: false, message: 'User not found' });
        const user = userRes.rows[0];

        // Generate new Access Token
        const newToken = jwt.sign(
            { userId: user.id, role: user.role, companyStatus: user.company_status, name: user.name, email: user.email },
            JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.cookie('token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 8 * 60 * 60 * 1000 // 8 hours
        });

        res.json({ success: true, message: 'Token refreshed' });
    } catch (err) {
        console.error("Refresh Error:", err);
        res.status(403).json({ success: false, message: 'Invalid refresh token' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.json({ success: true, message: 'Logged out successfully' });
});

// User Profile Endpoint
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const role = req.user.role;
    try {
        // Get base user data
        const userRes = await pool.query(
            'SELECT id, name, email, phone, role, company_status, created_at FROM users WHERE id = $1',
            [userId]
        );
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

        const user = userRes.rows[0];
        let profile = null;

        // Get role-specific profile
        if (role === 'company') {
            const compRes = await pool.query(
                'SELECT * FROM company_profiles WHERE user_id = $1',
                [userId]
            );
            profile = compRes.rows[0] || null;
        } else if (role === 'customer') {
            const custRes = await pool.query(
                'SELECT * FROM customer_profiles WHERE user_id = $1',
                [userId]
            );
            profile = custRes.rows[0] || null;
        }

        res.json({ success: true, user, profile });
    } catch (err) {
        console.error('Profile Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update Profile Endpoint
app.put('/api/user/profile', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { name, phone } = req.body;
    try {
        await pool.query(
            'UPDATE users SET name = $1, phone = $2 WHERE id = $3',
            [name, phone, userId]
        );
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Notifications Endpoint for all users
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
            [req.user.userId]
        );
        res.json({ success: true, notifications: r.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
});

// Admin Routes
app.use('/api/admin', authenticateToken, authorizeRole(['admin']));

app.get('/api/admin/pending-companies', async (req, res) => {
    try {
        if (!pool) throw new Error("Database not connected");

        // In a real app, verify the req context has admin role.
        const query = `
            SELECT u.id, c.company_name, u.email, c.created_at, c.documents_url 
            FROM users u 
            JOIN company_profiles c ON u.id = c.user_id 
            WHERE u.company_status = 'pending' AND u.role = 'company'
        `;
        const result = await pool.query(query);
        res.json({ success: true, companies: result.rows });
    } catch (err) {
        console.error("Admin Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch pending companies' });
    }
});

app.post('/api/admin/approve-company', async (req, res) => {
    const { companyId } = req.body;
    try {
        if (!pool) throw new Error("Database not connected");

        await pool.query(
            "UPDATE users SET company_status = 'approved' WHERE id = $1 AND role = 'company'",
            [companyId]
        );

        // Notify Company
        await createNotification(
            companyId,
            'success',
            'Account Approved',
            'Congratulations! Your company account has been approved. You can now access all features.',
            '/company-dashboard.html'
        ).catch(e => { });

        res.json({ success: true, message: 'Company approved successfully' });
    } catch (err) {
        console.error("Admin Approve Error:", err);
        res.status(500).json({ success: false, message: 'Failed to approve company' });
    }
});

app.get('/api/admin/recent-shipments', async (req, res) => {
    try {
        if (!pool) throw new Error("Database not connected");

        const query = `
            SELECT s.id, s.type, s.origin_address, s.destination_address, s.status, s.estimated_cost, s.created_at,
                   u.name as customer_name, cp.company_name
            FROM shipments s
            LEFT JOIN users u ON s.customer_id = u.id
            LEFT JOIN company_profiles cp ON s.company_id = cp.user_id
            ORDER BY s.created_at DESC
            LIMIT 20
        `;
        const result = await pool.query(query);
        res.json({ success: true, shipments: result.rows });
    } catch (err) {
        console.error("Admin Recent Shipments Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch recent shipments' });
    }
});

app.get('/api/admin/stats', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        if (!pool) throw new Error("Database not connected");
        const [usersRes, companiesRes, shipmentsRes, revenueRes] = await Promise.all([
            pool.query("SELECT COUNT(*) as count FROM users"),
            pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'company' AND company_status = 'approved'"),
            pool.query("SELECT COUNT(*) as count FROM shipments"),
            pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE status = 'Completed'"),
        ]);
        res.json({
            success: true,
            stats: {
                users: parseInt(usersRes.rows[0].count),
                companies: parseInt(companiesRes.rows[0].count),
                shipments: parseInt(shipmentsRes.rows[0].count),
                revenue: parseFloat(revenueRes.rows[0].total)
            }
        });
    } catch (err) {
        console.error("Admin Stats Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

app.post('/api/admin/reject-company', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { companyId } = req.body;
    try {
        await pool.query(
            "UPDATE users SET company_status = 'rejected' WHERE id = $1 AND role = 'company'",
            [companyId]
        );

        // Notify Company
        await createNotification(
            companyId,
            'error',
            'Account Rejected',
            'Your company account registration was unsuccessful. Please check your documents or contact support.',
            '/'
        ).catch(e => { });

        res.json({ success: true, message: 'Company rejected successfully' });
    } catch (err) {
        console.error("Admin Reject Error:", err);
        res.status(500).json({ success: false, message: 'Failed to reject company' });
    }
});

// Company Routes
app.use('/api/company', authenticateToken, authorizeRole(['company']));

app.get('/api/company/pending-requests', async (req, res) => {
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error("Database not connected");
        const query = `
            SELECT s.*, u.name as customer_name, u.email as customer_email
            FROM shipments s
            JOIN users u ON s.customer_id = u.id
            WHERE s.company_id = $1 AND s.status = 'Booked'
            ORDER BY s.created_at DESC
        `;
        const result = await pool.query(query, [companyId]);
        res.json({ success: true, shipments: result.rows });
    } catch (err) {
        console.error("Company Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch pending requests' });
    }
});

app.get('/api/company/active-shipments', async (req, res) => {
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error("Database not connected");
        const query = `
            SELECT s.*, u.name as customer_name, u.email as customer_email
            FROM shipments s
            JOIN users u ON s.customer_id = u.id
            WHERE s.company_id = $1 AND s.status != 'Booked' AND s.status != 'Delivered'
            ORDER BY s.created_at DESC
        `;
        const result = await pool.query(query, [companyId]);
        res.json({ success: true, shipments: result.rows });
    } catch (err) {
        console.error("Company Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch active shipments' });
    }
});

app.post('/api/company/accept-request', async (req, res) => {
    const { shipmentId } = req.body;
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error("Database not connected");
        const checkQuery = await pool.query("SELECT status FROM shipments WHERE id = $1 AND company_id = $2", [shipmentId, companyId]);
        if (checkQuery.rows.length === 0 || checkQuery.rows[0].status !== 'Booked') {
            return res.status(400).json({ success: false, message: 'Invalid shipment or status' });
        }
        await pool.query("UPDATE shipments SET status = 'Accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND company_id = $2", [shipmentId, companyId]);
        res.json({ success: true, message: 'Shipment accepted successfully' });
    } catch (err) {
        console.error("Company Accept Error:", err);
        res.status(500).json({ success: false, message: 'Failed to accept shipment' });
    }
});

app.post('/api/company/decline-request', async (req, res) => {
    const { shipmentId } = req.body;
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error("Database not connected");
        await pool.query("UPDATE shipments SET status = 'Declined', company_id = NULL WHERE id = $1 AND company_id = $2", [shipmentId, companyId]);
        res.json({ success: true, message: 'Shipment declined' });
    } catch (err) {
        console.error("Company Decline Error:", err);
        res.status(500).json({ success: false, message: 'Failed to decline shipment' });
    }
});

app.post('/api/company/update-shipment-status', async (req, res) => {
    const { shipmentId, status } = req.body;
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error('Database not connected');
        const validStatuses = ['Accepted', 'In Transit', 'Delivered', 'Customs Clearance', 'Customs', 'Ship Allocated', 'Cargo Ready', 'At Port', 'Out for Delivery'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const rows = await pool.query(
            "UPDATE shipments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3 RETURNING id",
            [status, shipmentId, companyId]
        );
        if (rows.rowCount === 0) return res.status(404).json({ success: false, message: 'Shipment not found or not assigned to you' });
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        console.error('Update Status Error:', err);
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});

app.post('/api/company/assign-vehicle', async (req, res) => {
    const { shipmentId, vehicleType } = req.body;
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error('Database not connected');
        const rows = await pool.query(
            "UPDATE shipments SET vehicle_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3 RETURNING id",
            [vehicleType, shipmentId, companyId]
        );
        if (rows.rowCount === 0) return res.status(404).json({ success: false, message: 'Shipment not found or not assigned to you' });
        res.json({ success: true, message: 'Vehicle assigned successfully' });
    } catch (err) {
        console.error('Assign Vehicle Error:', err);
        res.status(500).json({ success: false, message: 'Failed to assign vehicle' });
    }
});

app.get('/api/company/analytics', async (req, res) => {
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error('Database not connected');
        const result = await pool.query(
            "SELECT COUNT(*) as total_deliveries FROM shipments WHERE company_id = $1 AND status = 'Delivered'",
            [companyId]
        );
        const profile = await pool.query('SELECT on_time_rate FROM company_profiles WHERE user_id = $1', [companyId]);
        const onTimeRate = profile.rows[0]?.on_time_rate ?? 98.5;
        res.json({
            success: true,
            analytics: {
                totalDeliveries: result.rows[0].total_deliveries,
                onTimeRate,
                customerRating: 4.8,
                carbonEfficiency: 'A+'
            }
        });
    } catch (err) {
        console.error('Company Analytics Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
});

app.get('/api/company/earnings', authenticateToken, authorizeRole(['company']), async (req, res) => {
    const companyId = req.user?.userId;
    try {
        if (!pool) throw new Error('Database not connected');

        // Fetch real transactions for shipments assigned to this company (with user prefix)
        const query = `
            SELECT t.*, s.origin_address, s.destination_address,
                   UPPER(LEFT(u.email, 2)) as user_prefix
            FROM transactions t
            JOIN shipments s ON t.shipment_id = s.id
            JOIN users u ON s.customer_id = u.id
            WHERE s.company_id = $1
            ORDER BY t.created_at DESC
        `;
        const result = await pool.query(query, [companyId]);

        const totalRevenue = result.rows.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const commission = totalRevenue * 0.05;
        const netEarnings = totalRevenue - commission;

        res.json({
            success: true,
            transactions: result.rows,
            summary: { totalRevenue, commission, netEarnings }
        });
    } catch (err) {
        console.error('Company Earnings Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch earnings' });
    }
});

app.post('/api/company/upload-documents', authenticateToken, upload.single('document'), async (req, res) => {
    const companyId = req.user.userId;

    try {
        if (!pool) throw new Error("Database not connected");

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const documentUrl = req.file.path; // Cloudinary URL

        await pool.query(
            "UPDATE company_profiles SET documents_url = $1 WHERE user_id = $2",
            [documentUrl, companyId]
        );
        res.json({ success: true, message: 'Documents submitted successfully', url: documentUrl });
    } catch (err) {
        console.error("Upload Documents Error:", err);
        res.status(500).json({ success: false, message: 'Failed to upload documents' });
    }
});

// Setup Initial Sync Routes (HS Code, Quote)
const hscodeRouter = require('./hscode');
app.use('/api/hscode', hscodeRouter);

const setupQuoteRouter = async () => {
    try {
        const quoteRouterFn = require('./quote');
        const quoteRouter = await quoteRouterFn(pool);
        app.use('/api/quote', quoteRouter);
        console.log("✅ Quote router loaded");
    } catch (err) {
        console.error("Failed to load quote routes:", err);
    }
};

// Mount Payment Routes (No verifyToken here usually, but handled inside)
const setupPaymentRoutes = async () => {
    try {
        const paymentRouter = require('./routes/payment');
        app.use('/api/payment', paymentRouter);
        // Payment router might need createNotification, but it's a plain object usually
        // We'll see if we can inject it or use it globally
        console.log("✅ Payment routes loaded");
    } catch (err) {
        console.error("Failed to load payment routes:", err);
    }
};



// Schedules Search Endpoint
app.get('/api/schedules/search', (req, res) => {
    const { origin, dest } = req.query;
    console.log(`Searching schedules: ${origin} -> ${dest}`);

    // Mock realistic data
    const carriers = ['Maersk', 'CMA CGM', 'MSC', 'Hapag-Lloyd', 'ONE'];
    const vessels = ['MARCO POLO', 'GULSUN', 'SEOUL', 'MADRID', 'AL ZUBARA'];

    // Generate 3-5 results
    const results = [];
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i++) {
        const depDate = new Date();
        depDate.setDate(depDate.getDate() + Math.floor(Math.random() * 14) + 2); // 2-16 days from now

        const transit = 18 + Math.floor(Math.random() * 15); // 18-33 days
        const arrDate = new Date(depDate);
        arrDate.setDate(arrDate.getDate() + transit);

        const carrier = carriers[Math.floor(Math.random() * carriers.length)];

        results.push({
            id: (carrier.substring(0, 2) + Math.floor(Math.random() * 9000 + 1000)).toUpperCase(),
            carrier: carrier,
            vessel: `${carrier} ${vessels[Math.floor(Math.random() * vessels.length)]}`,
            voyage: `VY${Math.floor(Math.random() * 100)}W`,
            departure: depDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            arrival: arrDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            transitTime: transit,
            service: 'AE-1' // Asia-Europe Loop 1
        });
    }

    // Simulate network delay
    setTimeout(() => res.json({ success: true, results }), 800);
});

// Real-time Tracking Endpoint (Real Implementation Bridge)
app.get('/api/tracking/search', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: "Tracking ID required" });
    
    try {
        const sid = parseInt(id.includes('-') ? id.split('-').pop() : id);
        if (isNaN(sid)) return res.status(400).json({ success: false, message: "Invalid ID" });

        // Redirect to the V3 high-fidelity tracking endpoint logic
        const response = await fetch(`http://localhost:${PORT}/api/v3/tracking/live/${sid}`, {
            headers: { 'Internal-Request': 'true' } // bypass auth checks for internal bridge if needed, or better, fetch direct from pool
        }).catch(() => null);
        
        if (response) {
            const data = await response.json();
            return res.json(data);
        }
        
        res.status(404).json({ success: false, message: "Shipment not found" });
    } catch (e) {
        res.status(500).json({ success: false, message: "Internal error" });
    }
});



// Serve Static Files
app.use(express.static(path.join(__dirname, '../')));

// Main Startup Function
const startServer = async () => {
    try {
        // 1. Initialize Database
        const dbConfig = await resolveDbConfig();
        pool = new Pool(dbConfig);

        // Test connection
        await pool.query('SELECT NOW()');
        console.log("✅ Database Connected Successfully via Resolved IP");

        // 2. Run Migrations/Setup
        await createUsersTable();
        await createCompanyProfilesTable();
        await createAdminTables(); // Ensure tables are created before routes that depend on them

        // Initialize all specialized functional routes
        await setupNotificationRoutes();
        await setupShipmentRoutes(io);
        await setupJourneyRoutes();
        await setupFinanceRoutes();
        await setupCompanyRoutes();
        await setupDocumentRoutes();
        await setupCustomsRoutes();
        await setupPackingListRoutes();
        await setupSupportRoutes();
        await setupQuoteRouter();
        await setupPaymentRoutes();

        // 2.1 Extended Multi-modal & Admin Routes
        const registerAdminRoutes = require('./admin-routes');
        registerAdminRoutes(app, pool, authenticateToken, authorizeRole, createNotification, io);

        const registerCompanyRoutes = require('./company-routes-extended');
        registerCompanyRoutes(app, pool, authenticateToken, authorizeRole, io);

        // 2.2 V3 Workflow Routes (Ship Allocation, Gated Docs/Payment, Receipts, Tracking)
        const registerV3Routes = require('./v3-workflow-routes');
        registerV3Routes(app, pool, authenticateToken, authorizeRole, createNotification, io);

        // 3. Socket.io – JWT Auth Middleware
        io.use((socket, next) => {
            // Client sends token via socket.handshake.auth.token or cookie
            const token = socket.handshake.auth?.token ||
                (socket.handshake.headers?.cookie || '')
                    .split(';').find(c => c.trim().startsWith('token='))
                    ?.split('=')?.[1];

            if (!token) return next(new Error('Authentication required'));

            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                socket.user = decoded;
                next();
            } catch (err) {
                next(new Error('Invalid token'));
            }
        });

        // 4. Socket.io – Event Handlers
        io.on('connection', (socket) => {
            const user = socket.user;
            console.log(`🔌 Socket connected: ${user?.name || user?.userId} (${user?.role})`);

            // Customer joins a shipment room to watch live updates
            socket.on('join_shipment', ({ shipmentId }) => {
                const room = `shipment:${shipmentId}`;
                socket.join(room);
                console.log(`📡 User ${user?.userId} joined room ${room}`);
                socket.emit('joined', { shipmentId, message: 'Now watching live tracking.' });
            });

            // Company emits a location update
            socket.on('location_update', async ({ shipmentId, lat, lng, status, message }) => {
                if (user?.role !== 'company') {
                    socket.emit('error', { message: 'Only companies can send location updates.' });
                    return;
                }

                try {
                    // Fetch prefix for broadcast
                    const shipRes = await pool.query(`
                        SELECT UPPER(LEFT(u.email, 2)) as prefix 
                        FROM shipments s 
                        JOIN users u ON s.customer_id = u.id 
                        WHERE s.id = $1`, [shipmentId]);
                    const prefix = shipRes.rows[0]?.prefix || 'SS';

                    const payload = { shipmentId, lat, lng, status, message, timestamp: new Date(), user_prefix: prefix };

                    // Write to tracking_logs table
                    await pool.query(
                        `INSERT INTO tracking_logs (shipment_id, lat, lng, status, location_note)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [shipmentId, lat, lng, status || 'In Transit', message || '']
                    );

                    // Optionally update the shipment status
                    if (status) {
                        await pool.query(
                            `UPDATE shipments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                            [status, shipmentId]
                        );
                    }

                    // Broadcast to all customers watching this shipment
                    io.to(`shipment:${shipmentId}`).emit('tracking_event', payload);
                    socket.emit('tracking_log_saved', { success: true });
                    console.log(`📍 Tracking event for shipment ${prefix}-${shipmentId}: ${lat}, ${lng}`);

                } catch (err) {
                    console.error('Tracking log error:', err);
                    socket.emit('tracking_log_saved', { success: false, error: err.message });
                }
            });

            socket.on('disconnect', () => {
                console.log(`🔌 Socket disconnected: ${user?.userId}`);
            });
        });

        // ── AIS SIMULATION ENGINE ───────────────────────────────────────
        /**
         * Simulates automatic vessel movement every 5 minutes.
         * Moves ships currently "In Transit" towards their next port stop.
         */
        setInterval(async () => {
            try {
                // Find ships that are 'Active' or have 'In Transit' shipments
                const res = await pool.query(`
                    SELECT DISTINCT v.id, v.name, v.current_lat, v.current_lng, v.current_port
                    FROM vehicles v
                    JOIN shipments s ON s.allocated_ship_id = v.id
                    WHERE s.status = 'In Transit' AND v.status = 'Active'
                `);

                for (const ship of res.rows) {
                    const lat = parseFloat(ship.current_lat || 0);
                    const lng = parseFloat(ship.current_lng || 0);

                    // Get next stop for this ship
                    const stopsRes = await pool.query(
                        `SELECT * FROM ship_route_stops WHERE ship_id = $1 ORDER BY stop_order ASC`,
                        [ship.id]
                    );
                    
                    if (stopsRes.rows.length < 2) continue;

                    // Find which stop we are currently near, and move to next
                    let nextStop = null;
                    for (const stop of stopsRes.rows) {
                        if (stop.port_name !== ship.current_port) {
                            // Simple logic: pick first stop that isn't current
                            nextStop = stop;
                            break;
                        }
                    }

                    if (nextStop && nextStop.lat && nextStop.lng) {
                        // Move 5% towards next stop (simulating travel)
                        const targetLat = parseFloat(nextStop.lat);
                        const targetLng = parseFloat(nextStop.lng);
                        
                        const newLat = lat + (targetLat - lat) * 0.05;
                        const newLng = lng + (targetLng - lng) * 0.05;

                        // Update DB
                        await pool.query(
                            `UPDATE vehicles SET current_lat = $1, current_lng = $2, updated_at = NOW() WHERE id = $3`,
                            [newLat, newLng, ship.id]
                        );

                        // Broadcast to all shipments on this ship
                        const shipId = ship.id;
                        const sR = await pool.query(`SELECT id FROM shipments WHERE allocated_ship_id = $1`, [shipId]);
                        sR.rows.forEach(s => {
                            io.to(`shipment:${s.id}`).emit('tracking_event', {
                                shipmentId: s.id, lat: newLat, lng: newLng,
                                status: 'In Transit', message: `Vessel "${ship.name}" moving towards ${nextStop.port_name}`,
                                timestamp: new Date()
                            });
                        });
                    }
                }
            } catch (e) { console.error('AIS Engine Error:', e.message); }
        }, 300000); // 5 minutes

        // 5. Start Server — with EADDRINUSE retry to handle node --watch restarts
        const PORT = process.env.PORT || 3000;

        httpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} already in use. Exiting so node --watch can restart cleanly.`);
                process.exit(1);
            } else {
                console.error('❌ Server error:', err);
                process.exit(1);
            }
        });

        httpServer.listen(PORT, () => {
            console.log(`🚀 Server + Socket.io running on port ${PORT}`);
            console.log(`Serving static files from: ${path.join(__dirname, '../')}`);
        });

    } catch (err) {
        console.error("❌ Critical Server Startup Error:", err);
        process.exit(1);
    }
};

startServer();