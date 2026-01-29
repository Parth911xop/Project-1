const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test-script@example.com';

async function runTest() {
    console.log("🚀 Starting Auth Flow Test...");

    // 1. Request OTP
    console.log(`\n1️⃣  Requesting OTP for ${TEST_EMAIL}...`);
    try {
        const reqRes = await fetch(`${BASE_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: TEST_EMAIL })
        });
        const reqData = await reqRes.json();

        if (!reqData.success) {
            throw new Error(`Request OTP Failed: ${reqData.message}`);
        }
        console.log("✅ OTP Requested Successfully!");
    } catch (e) {
        console.error("❌ Error requesting OTP:", e.message);
        return;
    }

    // 2. We can't easily get the OTP from the backend without hacking/querying DB directly in this script.
    // However, since we are developing, we can cheat and query the DB using the pg client, OR
    // for this test, since the server logs it, we might just have to stop here or simulate a verification if we had the code.
    // BETTER APPROACH: Let's query the DB directly to get the OTP code for this test user.

    console.log("\n2️⃣  Fetching OTP from DB (Test only)...");
    const { Pool } = require('pg');
    require('dotenv').config({ path: './backend/.env' });

    // We need to point to the backend folder's .env. 
    // This script will likely run from root, so adjustments might be needed if env vars aren't loaded.
    // Assuming the user runs this with correct env vars or we hardcode for the test script (unsafe but effective for quick check).
    // Let's rely on the server being running and us picking up the same ENV if run from backend dir.

    const pool = new Pool({
        host: process.env.PGHOST || 'ep-plain-term-ahkfudkr-pooler.c-3.us-east-1.aws.neon.tech',
        user: process.env.PGUSER || 'neondb_owner',
        password: process.env.PGPASSWORD || 'npg_Zve69ckaCuJS',
        database: process.env.PGDATABASE || 'neondb',
        port: 5432,
        ssl: { rejectUnauthorized: false }
    });

    let otpCode;
    try {
        const res = await pool.query('SELECT otp_code FROM users WHERE email = $1', [TEST_EMAIL]);
        if (res.rows.length > 0) {
            otpCode = res.rows[0].otp_code;
            console.log(`✅ Found OTP in DB: ${otpCode}`);
        } else {
            throw new Error("User not found in DB");
        }
    } catch (e) {
        console.error("❌ DB Access Error:", e.message);
        await pool.end();
        return;
    }

    // 3. Verify OTP
    console.log(`\n3️⃣  Verifying OTP...`);
    try {
        const verRes = await fetch(`${BASE_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: TEST_EMAIL, otp: otpCode })
        });
        const verData = await verRes.json();

        if (verData.success) {
            console.log("✅ Login Verified Successfully!");
            console.log("🎉 User ID:", verData.userId);
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
