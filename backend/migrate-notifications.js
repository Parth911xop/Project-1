const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log("🚀 Starting Integration Upgrade: Notifications Table...");
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50), -- 'SHIPMENT_UPDATE', 'NEW_BOOKING', 'PAYMENT_RECEIVED', 'SYSTEM'
                title VARCHAR(255),
                message TEXT,
                link VARCHAR(255),
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
        `);
        console.log("✅ Table 'notifications' created successfully.");
    } catch (err) {
        console.error("❌ Failed to create table:", err);
    } finally {
        await pool.end();
    }
}

run();
