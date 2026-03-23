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
        const ships = [
            { mmsi: "123456789", oLat: 18.94, oLng: 72.83, dLat: 1.35, dLng: 103.81 }, // Mumbai to Singapore
            { mmsi: "987654321", oLat: 25.20, oLng: 55.27, dLat: 51.50, dLng: -0.12 }, // Dubai to London
            { mmsi: "111222333", oLat: 1.35, oLng: 103.81, dLat: 31.23, dLng: 121.47 } // Singapore to Shanghai
        ];

        for (const s of rows) {
            const shipData = ships[count % ships.length];
            
            // Update shipment with MMSI and Port Coords
            await pool.query(
                `UPDATE shipments SET mmsi = $1, origin_lat = $2, origin_lng = $3, dest_lat = $4, dest_lng = $5 WHERE id = $6`,
                [shipData.mmsi, shipData.oLat, shipData.oLng, shipData.dLat, shipData.dLng, s.id]
            );

            const path = [
                { id: s.id, lat: shipData.oLat, lng: shipData.oLng, status: 'At Origin Port', note: 'Cargo received at source port' },
                { id: s.id, lat: (shipData.oLat + shipData.dLat) / 2, lng: (shipData.oLng + shipData.dLng) / 2, status: 'In Transit', note: 'Vessel in open waters' },
                { id: s.id, lat: shipData.dLat, lng: shipData.dLng, status: 'Arrived', note: 'Vessel docked at destination' }
            ];

            for (let i = 0; i < path.length; i++) {
                const log = path[i];
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
