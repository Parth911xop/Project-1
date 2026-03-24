const { Pool } = require('pg');
require('dotenv').config();

const dbUrlStr = process.env.DATABASE_URL;
const dbUrl = new URL(dbUrlStr);

const pool = new Pool({
    user: dbUrl.username,
    password: dbUrl.password,
    host: dbUrl.hostname,
    port: dbUrl.port || 5432,
    database: dbUrl.pathname.split('/')[1],
    ssl: { rejectUnauthorized: false }
});

async function checkShipment() {
    try {
        const r = await pool.query('SELECT id, customer_id, status, plan_options, negotiated_quotes FROM shipments WHERE id = 62');
        console.log(JSON.stringify(r.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
checkShipment();
