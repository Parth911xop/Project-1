const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Applying DB Fixes...");
    await pool.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS documents_url VARCHAR(255);`);
    await pool.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS on_time_rate NUMERIC DEFAULT 0;`);
    console.log("✅ Fixed company_profiles schema");
    
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'company_profiles';
    `);
    console.log("Current company_profiles columns:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}
run();
