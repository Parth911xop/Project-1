const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const dns = require('dns');
const { URL } = require('url');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

    console.log(`🔍 Resolving DB host: ${hostname} using Google DNS...`);

    // Set Google DNS servers explicitly
    dns.setServers(['8.8.8.8', '8.8.4.4']);

    return new Promise((resolve, reject) => {
        dns.resolve4(hostname, (err, addresses) => {
            if (err) {
                return reject(err);
            }
            if (!addresses || addresses.length === 0) {
                return reject(new Error("No IP addresses found for DB host"));
            }

            const ip = addresses[0];
            console.log(`✅ Resolved ${hostname} to ${ip}`);

            const config = {
                user: dbUrl.username,
                password: dbUrl.password,
                host: ip, // Use resolved IP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;
    try {
        await pool.query(query);
        console.log("✅ Table 'users' ready");
    } catch (err) {
        console.error("❌ Error creating 'users' table:", err);
    }
};

// Mount Shipment Routes
const setupShipmentRoutes = async () => {
    try {
        const shipmentRouterFn = require('./shipment');
        const shipmentRouter = await shipmentRouterFn(pool);
        app.use('/api/shipment', shipmentRouter);
        console.log("✅ Shipment routes loaded");
    } catch (err) {
        console.error("Failed to load shipment routes:", err);
    }
};

// Mount Journey Routes
const setupJourneyRoutes = async () => {
    try {
        const journeyRouterFn = require('./journey');
        const journeyRouter = await journeyRouterFn(pool);

        app.use('/api/journey', journeyRouter);

        // Handle /update-journey (legacy compatibility)
        app.post('/update-journey', (req, res, next) => {
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
        app.use('/api/finance', financeRouter);
        console.log("✅ Finance routes loaded");
    } catch (err) {
        console.error("Failed to load finance routes:", err);
    }
};

// Mount Document Routes
const setupDocumentRoutes = async () => {
    try {
        const { router: documentRouter, createDocumentsTable } = require('./documents');
        await createDocumentsTable(pool);
        app.use('/api/documents', documentRouter);
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
        app.use('/api/customs', customsRouter);
        console.log("✅ Customs routes loaded");
    } catch (err) {
        console.error("Failed to load customs routes:", err);
    }
};

// Auth Endpoints
app.post('/request-otp', async (req, res) => {
    console.log("Request OTP:", req.body);
    const { email, phone, fullName, authMethod } = req.body;
    const identifier = (authMethod === 'phone' && phone) ? phone : email;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        if (!pool) throw new Error("Database not connected");

        const check = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR phone = $2',
            [identifier, identifier]
        );

        if (check.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (email, phone, name, otp_code) VALUES ($1, $2, $3, $4)',
                [email || identifier, phone || null, fullName || 'User', otp]
            );
        } else {
            await pool.query(
                'UPDATE users SET otp_code = $1 WHERE email = $2 OR phone = $3',
                [otp, identifier, identifier]
            );
        }

        console.log(`Generated OTP for ${identifier}: ${otp}`);
        res.json({ success: true, message: 'OTP Sent', otp: otp });

    } catch (err) {
        console.error("Auth Error:", err);
        res.status(500).json({ success: false, message: 'Server Auth Error' });
    }
});

app.post('/verify-otp', async (req, res) => {
    const { identifier, otp } = req.body;
    try {
        if (!pool) throw new Error("Database not connected");

        const result = await pool.query(
            'SELECT * FROM users WHERE (email = $1 OR phone = $1) AND otp_code = $2',
            [identifier, otp]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ success: true, userId: user.id, user: user });
        } else {
            res.json({ success: false, message: 'Invalid OTP' });
        }
    } catch (err) {
        console.error("Verify Error:", err);
        res.status(500).json({ success: false, message: 'Verification Error' });
    }
});

// Setup Initial Sync Routes (HS Code, Quote)
const hscodeRouter = require('./hscode');
app.use('/api/hscode', hscodeRouter);

const quoteRouter = require('./quote');
app.use('/api/quote', quoteRouter);

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

// Real-time Tracking Endpoint (Detailed)
app.get('/api/tracking/search', (req, res) => {
    const { id } = req.query;
    console.log(`📡 Tracking request for ID: ${id}`);

    if (!id) {
        return res.status(400).json({ success: false, message: "Tracking ID is required" });
    }

    // Deterministic Mock Data Generation based on ID
    // visible to user, so we use the ID to seed the random-like values
    const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const mockRandom = (offset) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };

    // 1. Status & Basic Info
    const statuses = ['In Transit', 'In Transit', 'In Transit', 'Pending', 'Delivered', 'Customs Hold'];
    const status = statuses[Math.floor(mockRandom(1) * statuses.length)];

    // 2. Location (Start: Mumbai 18.9, 72.8 | End: Le Havre 49.4, 0.1)
    // Interpolate based on mock progress
    const progress = mockRandom(2); // 0.0 to 1.0
    const lat = 18.9 + (49.4 - 18.9) * progress;
    const lng = 72.8 + (0.1 - 72.8) * progress; // Simplified linear path (not real maritime route, but sufficient for visual)

    // 3. Speed & ETA
    const speed = 16 + Math.floor(mockRandom(3) * 8); // 16-24 knots
    const remainingDays = Math.floor((1 - progress) * 20) + 1;

    // 4. Timeline Generation
    const timeline = [
        { status: "completed", title: "Booking Confirmed", date: "Jan 28, 2026", loc: "System" },
        { status: "completed", title: "Cargo Picked Up", date: "Jan 30, 2026", loc: "Origin Warehouse" },
        { status: progress > 0.1 ? "completed" : "active", title: "Vessel Departure", date: "Feb 02, 2026", loc: "Mumbai Port, IN" },
        { status: progress > 0.9 ? "completed" : (status === 'Delivered' ? "completed" : "active"), title: "In Transit", date: "Live", loc: "Ocean" },
        { status: status === 'Delivered' ? "completed" : "pending", title: "Arrival", date: `Est. in ${remainingDays} Days`, loc: "Le Havre, FR" }
    ];

    const data = {
        id: id,
        route: { origin: "Mumbai, IN", dest: "Le Havre, FR" }, // Hardcoded for demo/simplicity or could be stored db fields
        cargo: "Electronics & Machinery",
        status: status,
        eta: new Date(Date.now() + remainingDays * 86400000).toLocaleDateString(),
        progress: Math.floor(progress * 100),
        speed: `${speed} knots`,
        nextPort: "Suez Canal, EG", // Mock intermediate
        distanceLeft: `${Math.floor((1 - progress) * 6000)} nm`,
        coordinates: { lat, lng },
        timeline: timeline,
        lastUpdated: new Date().toISOString()
    };

    setTimeout(() => res.json({ success: true, tracking: data }), 600);
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
        await setupShipmentRoutes();
        await setupJourneyRoutes();
        await setupFinanceRoutes();
        await setupDocumentRoutes(); // New
        await setupCustomsRoutes(); // New

        // 3. Start Server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Serving static files from: ${path.join(__dirname, '../')}`);
        });

    } catch (err) {
        console.error("❌ Crtical Server Startup Error:", err);
        process.exit(1);
    }
};

startServer();