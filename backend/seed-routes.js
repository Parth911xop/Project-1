require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seedRoutes() {
    console.log("🌱 Seeding Global Ports and Routes...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Clear existing data (optional, but good for fresh seed)
        // await client.query('TRUNCATE routes, ports CASCADE');

        // 2. Insert Ports
        const ports = [
            ['Jawaharlal Nehru Port', 'INBOM', 'India', 'Mumbai', 18.9489, 72.9511, 1.2, 0.45],
            ['Port of Mundra', 'INMUN', 'India', 'Mundra', 22.7381, 69.7042, 1.1, 0.40],
            ['Port of Jebel Ali', 'AEJEA', 'UAE', 'Dubai', 25.0113, 55.0612, 1.0, 0.50],
            ['Port of Singapore', 'SGSIN', 'Singapore', 'Singapore', 1.2762, 103.8014, 1.1, 0.60],
            ['Port of Shanghai', 'CNSHA', 'China', 'Shanghai', 31.2222, 121.4581, 1.4, 0.65],
            ['Port of Rotterdam', 'NLRTM', 'Netherlands', 'Rotterdam', 51.9225, 4.4792, 1.0, 0.55],
            ['Port of Los Angeles', 'USLAX', 'USA', 'Los Angeles', 33.7288, -118.2620, 1.5, 0.70]
        ];

        for (const p of ports) {
            await client.query(
                `INSERT INTO ports (name, code, country, city, latitude, longitude, congestion_index, handling_fees_per_kg)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
                p
            );
        }

        const portIds = {};
        const res = await client.query("SELECT id, code FROM ports");
        res.rows.forEach(r => portIds[r.code] = r.id);

        // 3. Insert Routes (Mumbai to Dubai, Shanghai, Rotterdam)
        const routes = [
            // Mumbai to Dubai
            [portIds['INBOM'], portIds['AEJEA'], 'Ocean', 0.15, 1930, 4, 0.015, 'Maersk'],
            [portIds['INBOM'], portIds['AEJEA'], 'Air', 2.50, 1930, 1, 0.55, 'Emirates SkyCargo'],
            
            // Mumbai to Singapore
            [portIds['INBOM'], portIds['SGSIN'], 'Ocean', 0.22, 3900, 7, 0.016, 'CMA CGM'],
            
            // Shanghai to Rotterdam (Long Haul)
            [portIds['CNSHA'], portIds['NLRTM'], 'Ocean', 0.45, 19000, 24, 0.012, 'MSC'],
            
            // Singapore to Shanghai
            [portIds['SGSIN'], portIds['CNSHA'], 'Ocean', 0.18, 4200, 6, 0.014, 'COSCO']
        ];

        for (const r of routes) {
            await client.query(
                `INSERT INTO routes (origin_port_id, dest_port_id, mode, base_cost_per_kg, distance_km, lead_time_days, co2_per_kg, carrier_name)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                r
            );
        }

        await client.query('COMMIT');
        console.log("✅ Global Routing Data Seeded!");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Seeding failed:", error);
    } finally {
        client.release();
        await pool.end();
    }
}

seedRoutes();
