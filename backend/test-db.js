require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.connect()
    .then(client => {
        console.log("✅ Connection Verification Successful!");
        client.release();
        pool.end();
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Connection Verification Failed:", err.message);
        process.exit(1);
    });
