
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixConstraints() {
    try {
        console.log("🛠️ Relaxing Database Constraints for Comprehensive Tracking...");

        // 1. Shipments Table status constraint
        await pool.query(`ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;`);
        // We'll allow a much wider list to accommodate all UI options
        const shipmentStatuses = [
            'Booked', 'Accepted', 'At Port', 'In Transit', 'Arrived', 'Delivered',
            'Cancelled', 'Declined', 'Customs', 'Out for Delivery', 'Container Allocated',
            'Container Loaded', 'Vessel Departed', 'At Origin Port', 'Customs Clearance',
            'Arrived at Destination', 'Processing', 'Document Uploaded', 'Verified'
        ];
        const statusList = shipmentStatuses.map(s => `'${s}'`).join(', ');
        await pool.query(`ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (status IN (${statusList}));`);
        console.log("✅ Updated 'shipments' status checklist with 19 states.");

        // 2. Vehicles Table status constraint
        await pool.query(`ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;`);
        const vehicleStatuses = ['Active', 'Maintenance', 'Inactive', 'Available', 'At Sea', 'At Port', 'Scheduled', 'In Transit'];
        const vStatusList = vehicleStatuses.map(s => `'${s}'`).join(', ');
        await pool.query(`ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_check CHECK (status IN (${vStatusList}));`);
        console.log("✅ Updated 'vehicles' status checklist.");

        console.log("🚀 All constraints successfully relaxed to match UI requirements.");

    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await pool.end();
    }
}

fixConstraints();
