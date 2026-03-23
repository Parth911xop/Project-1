const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query("SELECT * FROM support_tickets LIMIT 0");
    const fields = res.fields.map(f => f.name);
    process.stdout.write("FIELDS_START " + fields.join('|') + " FIELDS_END\n");
  } catch (err) {
    process.stdout.write("ERROR_START " + err.message + " ERROR_END\n");
  } finally {
    await pool.end();
  }
}

check();
