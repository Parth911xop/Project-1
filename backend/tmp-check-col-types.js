const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkCols() {
    try {
        const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'shipments'");
        r.rows.sort((a,b) => a.column_name.localeCompare(b.column_name)).forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
checkCols();
