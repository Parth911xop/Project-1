/**
 * Seed ports with accurate GPS coordinates
 * Run: node seed-ports-coords.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const PORTS = [
    { name: "Port of Los Angeles", country: "USA", state: "California", code: "US LAX", lat: 33.7361, lng: -118.2626 },
    { name: "Port of Singapore", country: "Singapore", state: null, code: "SG SIN", lat: 1.2644, lng: 103.8200 },
    { name: "Port of Dubai (Jebel Ali)", country: "UAE", state: "Dubai", code: "AE JEA", lat: 25.0657, lng: 55.1713 },
    { name: "Chennai Port", country: "India", state: "Tamil Nadu", code: "IN MAA", lat: 13.1067, lng: 80.3206 },
    { name: "Kolkata Port", country: "India", state: "West Bengal", code: "IN CCU", lat: 22.5726, lng: 88.3639 },
    { name: "JNPT Mumbai", country: "India", state: "Maharashtra", code: "IN BOM", lat: 18.9400, lng: 72.8350 },
    { name: "Port of Shanghai", country: "China", state: "Shanghai", code: "CN SHA", lat: 31.2304, lng: 121.4737 },
    { name: "Port of Rotterdam", country: "Netherlands", state: null, code: "NL RTM", lat: 51.9244, lng: 4.4777 },
    { name: "Port of Hamburg", country: "Germany", state: null, code: "DE HAM", lat: 53.5353, lng: 9.9700 },
    { name: "Port of New York", country: "USA", state: "New York", code: "US NYC", lat: 40.6700, lng: -74.0400 },
    { name: "Port of Tokyo", country: "Japan", state: null, code: "JP TYO", lat: 35.6260, lng: 139.7730 },
    { name: "Port of Le Havre", country: "France", state: null, code: "FR LEH", lat: 49.4938, lng: 0.1077 },
    { name: "Port of Busan", country: "South Korea", state: null, code: "KR PUS", lat: 35.1028, lng: 129.0403 },
    { name: "Port of Hong Kong", country: "China", state: "Hong Kong", code: "HK HKG", lat: 22.2860, lng: 114.1590 },
    { name: "Port of Colombo", country: "Sri Lanka", state: null, code: "LK CMB", lat: 6.9500, lng: 79.8500 },
    { name: "Cochin Port", country: "India", state: "Kerala", code: "IN COK", lat: 9.9680, lng: 76.2740 },
    { name: "Vizag Port", country: "India", state: "Andhra Pradesh", code: "IN VTZ", lat: 17.6867, lng: 83.2996 },
    { name: "Port of Jeddah", country: "Saudi Arabia", state: null, code: "SA JED", lat: 21.4854, lng: 39.1924 },
    { name: "Port of Durban", country: "South Africa", state: null, code: "ZA DUR", lat: -29.8720, lng: 31.0260 },
    { name: "Port of Santos", country: "Brazil", state: null, code: "BR SSZ", lat: -23.9608, lng: -46.2992 },
    { name: "Port of Vancouver", country: "Canada", state: "British Columbia", code: "CA VAN", lat: 49.2901, lng: -123.1120 },
    { name: "Port of Savannah", country: "USA", state: "Georgia", code: "US SAV", lat: 32.0809, lng: -81.0912 },
    { name: "Port of Houston", country: "USA", state: "Texas", code: "US HOU", lat: 29.7266, lng: -95.2698 },
    { name: "Port of Antwerp", country: "Belgium", state: null, code: "BE ANR", lat: 51.2340, lng: 4.3890 },
    { name: "Port of Piraeus", country: "Greece", state: null, code: "GR PIR", lat: 37.9476, lng: 23.6269 },
];

async function seed() {
    console.log('🌍 Seeding ports with GPS coordinates...\n');

    let added = 0, updated = 0, skipped = 0;

    for (const p of PORTS) {
        try {
            // Check if port with this code already exists
            const existing = await pool.query('SELECT id, latitude FROM ports WHERE code = $1', [p.code]);
            
            if (existing.rowCount > 0) {
                // Update coordinates if missing
                if (!existing.rows[0].latitude) {
                    await pool.query('UPDATE ports SET latitude = $1, longitude = $2 WHERE code = $3', [p.lat, p.lng, p.code]);
                    console.log(`  📍 Updated coords: ${p.name} (${p.lat}, ${p.lng})`);
                    updated++;
                } else {
                    console.log(`  ⏭️  ${p.name} already has coordinates`);
                    skipped++;
                }
            } else {
                // Insert new port
                await pool.query(
                    'INSERT INTO ports (name, country, state, code, latitude, longitude, congestion_index, handling_fees_per_kg) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                    [p.name, p.country, p.state, p.code, p.lat, p.lng, 1.0, 0.5]
                );
                console.log(`  ✅ Added: ${p.name} (${p.country}) [${p.code}]`);
                added++;
            }
        } catch (e) {
            console.error(`  ❌ ${p.name}: ${e.message}`);
        }
    }

    console.log(`\n✅ Done: ${added} added, ${updated} updated, ${skipped} skipped.`);
    await pool.end();
}

seed();
