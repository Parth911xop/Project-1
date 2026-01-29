const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT || 5432,
    ssl: { rejectUnauthorized: false }
});

const MOCK_SHIPMENTS = [
    { type: 'Export', from_country: 'Mumbai (IN BOM)', to_country: 'Le Havre (FR LEH)', mode: 'Ocean', status: 'In Transit', transit_time: 26, estimated_cost: 1240, product_type: 'Electronics' },
    { type: 'Import', from_country: 'Shanghai (CN PVG)', to_country: 'Los Angeles (US LAX)', mode: 'Air', status: 'Delayed', transit_time: 5, estimated_cost: 4820, product_type: 'Textiles' },
    { type: 'Import', from_country: 'Rotterdam (NL RTM)', to_country: 'New York (US NYC)', mode: 'Ocean', status: 'Customs Hold', transit_time: 14, estimated_cost: 2100, product_type: 'Machinery' },
    { type: 'Export', from_country: 'Singapore (SG SIN)', to_country: 'Jeddah (SA JED)', mode: 'Ocean', status: 'In Transit', transit_time: 18, estimated_cost: 980, product_type: 'Electronics' },
    { type: 'Export', from_country: 'Hamburg (DE HAM)', to_country: 'Dubai (AE DXB)', mode: 'Air', status: 'In Transit', transit_time: 2, estimated_cost: 3450, product_type: 'Pharma' },
    { type: 'Import', from_country: 'Tokyo (JP TYO)', to_country: 'Sydney (AU SYD)', mode: 'Ocean', status: 'In Transit', transit_time: 22, estimated_cost: 1650, product_type: 'Auto Parts' },
    { type: 'Export', from_country: 'Santos (BR SSZ)', to_country: 'Miami (US MIA)', mode: 'Ocean', status: 'Pending', transit_time: 15, estimated_cost: 1100, product_type: 'Coffee' },
    { type: 'Import', from_country: 'Busan (KR PUS)', to_country: 'Vancouver (CA YVR)', mode: 'Ocean', status: 'In Transit', transit_time: 20, estimated_cost: 1800, product_type: 'Electronics' },
    { type: 'Export', from_country: 'Cape Town (ZA CPT)', to_country: 'London (GB LHR)', mode: 'Air', status: 'Delayed', transit_time: 1, estimated_cost: 2900, product_type: 'Perishables' },
    { type: 'Import', from_country: 'Jebel Ali (AE JEA)', to_country: 'Mumbai (IN BOM)', mode: 'Ocean', status: 'Delivered', transit_time: 4, estimated_cost: 650, product_type: 'Oil & Gas' }
];

const seed = async () => {
    try {
        console.log("🌱 Seeding Shipments...");

        // Ensure table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shipments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                type VARCHAR(50) NOT NULL,
                from_country VARCHAR(100) NOT NULL,
                to_country VARCHAR(100) NOT NULL,
                product_type VARCHAR(100),
                weight DECIMAL(10, 2),
                recommended_port VARCHAR(100),
                estimated_cost DECIMAL(10, 2),
                transit_time INTEGER,
                status VARCHAR(50) DEFAULT 'pending',
                mode VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Get a default user (or create one)
        let userId = 1;
        const userRes = await pool.query("SELECT id FROM users LIMIT 1");
        if (userRes.rows.length > 0) {
            userId = userRes.rows[0].id;
        } else {
            const newUser = await pool.query("INSERT INTO users (email, name) VALUES ('demo@smartship.com', 'Demo User') RETURNING id");
            userId = newUser.rows[0].id;
        }

        // Insert Shipments
        for (const s of MOCK_SHIPMENTS) {
            await pool.query(`
                INSERT INTO shipments (user_id, type, from_country, to_country, mode, status, transit_time, estimated_cost, product_type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [userId, s.type, s.from_country, s.to_country, s.mode, s.status, s.transit_time, s.estimated_cost, s.product_type]);
        }

        console.log("✅ Successfully seeded 10 shipments!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
};

seed();
