const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Pool } = require('pg');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000';
const TEST_PHONE = '9876543210';

async function runTest() {
    console.log("🚀 Starting Phone Auth Debug...");

    // 1. Request OTP
    console.log(`\n1️⃣  Requesting OTP for ${TEST_PHONE}...`);
    try {
        const reqRes = await fetch(`${BASE_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authMethod: 'phone',
                phone: TEST_PHONE,
                email: TEST_PHONE, // Frontend sends identifier as email field in request-top payload if logic is shared? checking auth.js
                // Actually auth.js sends: { email: identifier, authMethod: method }
                // So for phone, identifier is put in 'email' field in request-otp
                // Let's match frontend behavior exactly
                email: TEST_PHONE,
                fullName: "Debug User",
                useCase: "Test",
                location: "Test City"
            })
        });
        const reqData = await reqRes.json();
        console.log("Response:", reqData);

        if (!reqData.success) {
            throw new Error(`Request OTP Failed: ${reqData.message}`);
        }
    } catch (e) {
        console.error("❌ Error requesting OTP:", e.message);
        return;
    }

    // 2. Fetch OTP from DB
    console.log("\n2️⃣  Fetching OTP from DB...");
    const pool = new Pool({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        port: 5432,
        ssl: { rejectUnauthorized: false }
    });

    let otpCode;
    try {
        const res = await pool.query('SELECT * FROM users WHERE phone = $1', [TEST_PHONE]);
        if (res.rows.length === 0) {
            // Try querying by email column just in case it got saved there erroneously
            const res2 = await pool.query('SELECT * FROM users WHERE email = $1', [TEST_PHONE]);
            if (res2.rows.length > 0) {
                console.log("⚠️  User found in EMAIL column, not PHONE column!");
                otpCode = res2.rows[0].otp_code;
            } else {
                throw new Error("User not found in DB at all");
            }
        } else {
            console.log("✅ User found in DB correctly.");
            otpCode = res.rows[0].otp_code;
            console.log(`🔑 OTP Code in DB: ${otpCode}`);
        }
    } catch (e) {
        console.error("❌ DB Access Error:", e.message);
        await pool.end();
        return;
    }

    // 3. Verify OTP
    console.log(`\n3️⃣  Verifying OTP...`);
    try {
        const payload = { identifier: TEST_PHONE, otp: otpCode };
        console.log("Sending Verify Payload:", payload);

        const verRes = await fetch(`${BASE_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const verData = await verRes.json();

        if (verData.success) {
            console.log("✅ Login Verified Successfully!");
        } else {
            console.error("❌ Login Verification Failed:", verData.message);
        }

    } catch (e) {
        console.error("❌ Verification Request Error:", e.message);
    } finally {
        await pool.end();
    }
}

runTest();
