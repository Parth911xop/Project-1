const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("🛠️  Manually adding 'file_name' column to 'user_kyc_documents'...");
        await pool.query("ALTER TABLE user_kyc_documents ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);");
        console.log("✅ Column added successfully!");
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
    } finally {
        await pool.end();
    }
}

migrate();
