require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function applySchema() {
    console.log("🚀 Starting Enterprise Database Migration...");
    const client = await pool.connect();

    try {
        const schemaPath = path.join(__dirname, 'db-schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log("📄 Read db-schema.sql successfully. Applying DDL...");

        await client.query('BEGIN');
        await client.query(schemaSql);
        await client.query('COMMIT');

        console.log("✅ Production Schema applied successfully!");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Migration failed:", error);
    } finally {
        client.release();
        await pool.end();
        console.log("🔌 Database connection closed.");
    }
}

applySchema();
