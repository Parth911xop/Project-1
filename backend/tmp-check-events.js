const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'shipment_events'");
        if (r.rows.length === 0) {
            console.log("NOT_FOUND");
        } else {
            const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'shipment_events'");
            console.log(cols.rows.map(x => x.column_name).sort().join(', '));
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
check();
