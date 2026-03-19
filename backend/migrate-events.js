const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log("🚀 Starting Database Upgrade: Shipment Events...");
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shipment_events (
                id SERIAL PRIMARY KEY,
                shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
                status VARCHAR(50) NOT NULL,
                location VARCHAR(255),
                notes TEXT,
                updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id);
        `);
        console.log("✅ Table 'shipment_events' created successfully.");
    } catch (err) {
        console.error("❌ Failed to create table:", err);
    } finally {
        await pool.end();
    }
}

run();
