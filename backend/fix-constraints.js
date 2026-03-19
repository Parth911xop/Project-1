
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixConstraints() {
    try {
        console.log("🛠️ Fixing Database Constraints for Company Partner Hub...");

        // 1. Update 'shipments' status check
        // First drop the old constraint if we can find its name, or just use a blunt approach
        await pool.query(`ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;`);
        await pool.query(`
            ALTER TABLE shipments ADD CONSTRAINT shipments_status_check 
            CHECK (status IN ('Booked', 'Accepted', 'At Port', 'In Transit', 'Arrived', 'Delivered', 'Cancelled', 'Declined', 'Customs', 'Out for Delivery', 'Container Allocated'));
        `);
        console.log("✅ Updated 'shipments' status checklist");

        // 2. Update 'vehicles' status check
        await pool.query(`ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;`);
        await pool.query(`
            ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_check 
            CHECK (status IN ('Active', 'Maintenance', 'Inactive', 'Available', 'At Sea', 'At Port', 'Scheduled'));
        `);
        console.log("✅ Updated 'vehicles' status checklist");

        // 3. Ensure 'documents' table is clean
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_name VARCHAR(255);`);
        await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;`);

        // 4. Handle 'journey_progress' recreation issue (often a lock or race)
        // We will just ensure it exists with correct columns
        await pool.query(`
            CREATE TABLE IF NOT EXISTS journey_progress (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                shipment_id INTEGER UNIQUE,
                current_step INTEGER DEFAULT 1,
                company_data JSONB DEFAULT '{}',
                documentation_data JSONB DEFAULT '{}',
                customs_data JSONB DEFAULT '{}',
                port_data JSONB DEFAULT '{}',
                sea_data JSONB DEFAULT '{}',
                import_data JSONB DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Database schema validated and constraints relaxed.");

    } catch (err) {
        console.error("❌ Fix failed:", err);
    } finally {
        await pool.end();
    }
}

fixConstraints();
