
const { Pool } = require("pg");
require("dotenv").config({ override: true });

const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: Number(process.env.PGPORT),
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.log("Checking DB...");
        const users = await pool.query("SELECT id, email, full_name, phone FROM users LIMIT 5");
        console.log("Users:", users.rows);

        const journey = await pool.query("SELECT * FROM journey_progress WHERE shipment_id = 15");
        console.log("Journey 15:", journey.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();
