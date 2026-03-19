require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    console.log("🚀 Starting V2 Enterprise Upgrade Migration...");
    const client = await pool.connect();

    try {
        const migrationPath = path.join(__dirname, 'migrations', 'v2_enterprise_upgrade.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');

        console.log("📄 Read v2_enterprise_upgrade.sql successfully.");

        await client.query('BEGIN');
        await client.query(migrationSql);
        await client.query('COMMIT');

        console.log("✅ Enterprise Upgrade applied successfully!");
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Migration failed:", error);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log("🔌 Database connection closed.");
    }
}

runMigration();
