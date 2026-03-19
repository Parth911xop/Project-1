
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("🚀 Starting Company Dashboard Schema Migration...");

        // 1. Vessels table (extending vehicles or creating new one)
        // We'll use the existing 'vehicles' table but ensure it has the right columns 
        // Or better, create a 'vessels' table if the user specifically asked for vessels in the hub.
        // Actually, let's just use vehicles but add 'name' if missing.
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS name VARCHAR(255);`);
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity VARCHAR(100);`);
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location VARCHAR(255);`);
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_stop VARCHAR(255);`);

        // 2. Schedules
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                company_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                vessel_name VARCHAR(255),
                from_port VARCHAR(100),
                to_port VARCHAR(100),
                departure_time TIMESTAMP,
                arrival_time TIMESTAMP,
                status VARCHAR(20) DEFAULT 'Scheduled',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Pricing Rates
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pricing_rates (
                id SERIAL PRIMARY KEY,
                company_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                origin VARCHAR(100),
                destination VARCHAR(100),
                mode VARCHAR(50),
                rate_per_unit DECIMAL(12,2),
                min_charge DECIMAL(12,2),
                transit_days INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Migration completed successfully!");
    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await pool.end();
    }
}

migrate();
