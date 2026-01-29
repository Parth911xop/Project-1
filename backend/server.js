const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database Connection
// Database Connection
const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT || 5432,
    ssl: { rejectUnauthorized: false }
});

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
createUsersTable();

// Mount Shipment Routes
// shipment.js exports a function: async (pool) => router
const setupShipmentRoutes = async () => {
    try {
        const shipmentRouterFn = require('./shipment');
        const shipmentRouter = await shipmentRouterFn(pool);
        app.use('/api/shipment', shipmentRouter);
    } catch (err) {
        console.error("Failed to load shipment routes:", err);
    }
};
setupShipmentRoutes();

// Mount HS Code Routes
const hscodeRouter = require('./hscode');
app.use('/api/hscode', hscodeRouter);

// Mount Quote Routes
const quoteRouter = require('./quote');
app.use('/api/quote', quoteRouter);

// Mount Journey Routes (Process Flow)
const setupJourneyRoutes = async () => {
    try {
        const journeyRouterFn = require('./journey');
        const journeyRouter = await journeyRouterFn(pool);

        // Mount at /api/journey
        app.use('/api/journey', journeyRouter);

        // Handle /update-journey (legacy compatibility)
        app.post('/update-journey', (req, res, next) => {
            req.url = '/update';
            journeyRouter(req, res, next);
        });

    } catch (err) {
        console.error("Failed to load journey routes:", err);
    }
};
setupJourneyRoutes();

// We will modify the journey.js above to be mounted at /api so checking /api/journey works. 
// AND we will add specific handlers for the quirks of the frontend if needed.

// WAIT: process-flow.js : fetch(`${API_URL}/update-journey`
// server.js : matches /update-journey relative to host root.
// So we need `app.post('/update-journey', ...)`


// Serve Static Files (Root Directory)
app.use(express.static(path.join(__dirname, '../')));

// Auth Endpoints (Reconstructed)
app.post('/request-otp', async (req, res) => {
    console.log("Request OTP:", req.body);
    const { email, phone, fullName, authMethod } = req.body;
    // Identifier logic: if authMethod is 'phone', use phone, else email
    // But frontend might send 'email' field containing phone if logic was shared.
    // We'll treat email or phone as identifier.

    const identifier = (authMethod === 'phone' && phone) ? phone : email;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // Build query to find user
        // We check if user exists.
        // Schema: users(id, email, phone, name, otp_code)

        // Simple upsert logic
        // Check by email OR phone
        const check = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR phone = $2',
            [identifier, identifier]
        );

        if (check.rows.length === 0) {
            // New User
            await pool.query(
                'INSERT INTO users (email, phone, name, otp_code) VALUES ($1, $2, $3, $4)',
                [email || identifier, phone || null, fullName || 'User', otp]
            );
        } else {
            // Update OTP
            await pool.query(
                'UPDATE users SET otp_code = $1 WHERE email = $2 OR phone = $3',
                [otp, identifier, identifier]
            );
        }

        console.log(`Generated OTP for ${identifier}: ${otp}`);

        // In production, send Email/SMS here.
        // For now, response success so frontend proceeds.
        res.json({ success: true, message: 'OTP Sent', otp: otp });

    } catch (err) {
        console.error("Auth Error:", err);
        res.status(500).json({ success: false, message: 'Server Auth Error' });
    }
});

app.post('/verify-otp', async (req, res) => {
    const { identifier, otp } = req.body;
    try {
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, '../')}`);
});