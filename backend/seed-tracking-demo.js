require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seed() {
        try {
        console.log("🌱 Generating Live Tracking Data for All Un-tracked Shipments...");

        // Get all shipments that have NO tracking logs
        const { rows } = await pool.query(`
            SELECT id FROM shipments 
            WHERE id NOT IN (SELECT DISTINCT shipment_id FROM tracking_logs)
        `);

        if (rows.length === 0) {
            console.log("⚡ All shipments already have tracking data!");
            return;
        }

        console.log(`Found ${rows.length} un-tracked shipments. Adding generic global tracking route...`);

        let count = 0;
        for (const s of rows) {
            const path = [
                { id: s.id, lat: 18.9438, lng: 72.8387, status: 'At Origin Port', note: 'Cargo received and cleared for export at Mumbai JNPT' },
                { id: s.id, lat: 1.3521, lng: 103.8198, status: 'In Transit', note: 'Vessel crossing the Malacca Strait' },
                { id: s.id, lat: 34.0522, lng: -118.2437, status: 'Customs Clearance', note: 'Arrived at Los Angeles Port and awaiting customs' },
                { id: s.id, lat: 36.1699, lng: -115.1398, status: 'Out for Delivery', note: 'Loaded onto regional carrier truck' }
            ];

            for (let i = 0; i < path.length; i++) {
                const log = path[i];
                // Space out the timestamps so they look realistic (older logs first)
                await pool.query(
                    `INSERT INTO tracking_logs (shipment_id, lat, lng, status, location_note, timestamp)
                     VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 day' * $6)`,
                    [log.id, log.lat, log.lng, log.status, log.note, (path.length - i)]
                );
            }
            count++;
        }

        console.log(`✅ Successfully seeded full tracking path for ${count} shipments!`);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

seed();
