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

async function checkCols() {
    try {
        const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'shipments'");
        console.log(r.rows.map(x => x.column_name).sort().join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
checkCols();
