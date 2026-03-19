
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seedDemoData() {
    const cid = 17; // Fedex Company
    const custId = 1; // Test Customer

    try {
        console.log("🌱 Seeding Demo Data for Company ID 17...");

        // 1. Clear existing specific data to avoid duplicates if re-run
        await pool.query(`DELETE FROM vehicles WHERE company_id = $1`, [cid]);
        await pool.query(`DELETE FROM schedules WHERE company_id = $1`, [cid]);
        await pool.query(`DELETE FROM pricing_rates WHERE company_id = $1`, [cid]);

        // Use a safe status for shipments
        // (Wipe only a few demo ones if needed, or just insert new ones)

        // 2. Vessels
        await pool.query(`
            INSERT INTO vehicles (company_id, name, type, capacity, location, next_stop, status) VALUES
            ($1, 'MV Maersk Gulsun', 'Container Ship', '23756 TEU', 'Mumbai Port, IN', 'Rotterdam, NL', 'Available'),
            ($1, 'Ever Alot', 'Container Ship', '24000 TEU', 'At Sea', 'Hamburg, DE', 'At Sea'),
            ($1, 'FedEx Atlas', 'Bulk Carrier', '18000 TEU', 'Singapore', 'Dubai, UAE', 'Maintenance')
        `, [cid]);
        console.log("✅ Seeded Vessels");

        // 3. Schedules
        await pool.query(`
            INSERT INTO schedules (company_id, vessel_name, from_port, to_port, departure_time, arrival_time, status) VALUES
            ($1, 'MV Maersk Gulsun', 'Mumbai', 'Rotterdam', NOW() + INTERVAL '2 days', NOW() + INTERVAL '22 days', 'Scheduled'),
            ($1, 'Ever Alot', 'Shanghai', 'Hamburg', NOW() - INTERVAL '5 days', NOW() + INTERVAL '15 days', 'In Transit')
        `, [cid]);
        console.log("✅ Seeded Schedules");

        // 4. Pricing Rates
        await pool.query(`
            INSERT INTO pricing_rates (company_id, origin, destination, mode, rate_per_unit, min_charge, transit_days) VALUES
            ($1, 'Mumbai', 'Rotterdam', 'Ocean FCL', 4500, 3200, 22),
            ($1, 'Shanghai', 'Hamburg', 'Ocean FCL', 5200, 4000, 25),
            ($1, 'New York', 'London', 'Air Freight', 8.5, 500, 3),
            ($1, 'Dubai', 'Singapore', 'Ocean LCL', 120, 200, 14)
        `, [cid]);
        console.log("✅ Seeded Pricing Rates");

        // 5. Shipments (Mix of status)
        const shipments = [
            { cust: custId, company: cid, type: 'Ocean', from: 'Mumbai', to: 'Rotterdam', status: 'Delivered', cost: 4500, created: '2025-12-01' },
            { cust: custId, company: cid, type: 'Ocean', from: 'Shanghai', to: 'Hamburg', status: 'Delivered', cost: 5200, created: '2026-01-10' },
            { cust: custId, company: cid, type: 'Air', from: 'New York', to: 'London', status: 'Delivered', cost: 1200, created: '2026-02-15' },
            { cust: custId, company: cid, type: 'Ocean', from: 'Mumbai', to: 'Dubai', status: 'In Transit', cost: 2800, created: '2026-03-01' },
            { cust: custId, company: cid, type: 'Ocean', from: 'Nhava Sheva', to: 'Jebel Ali', status: 'Accepted', cost: 3100, created: '2026-03-05' },
            // Unassigned (Marketplace)
            { cust: custId, company: null, type: 'Ocean', from: 'Kolkata', to: 'Singapore', status: 'Booked', cost: 1800, created: '2026-03-06' },
            { cust: custId, company: null, type: 'Air', from: 'Delhi', to: 'Tokyo', status: 'Booked', cost: 3500, created: '2026-03-06' }
        ];

        for (const s of shipments) {
            await pool.query(`
                INSERT INTO shipments (customer_id, company_id, type, origin_address, destination_address, status, estimated_cost, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [s.cust, s.company, s.type, s.from, s.to, s.status, s.cost, s.created]);
        }
        console.log("✅ Seeded Shipments");

        // 6. One tracking log
        const shipR = await pool.query(`SELECT id FROM shipments WHERE status = 'In Transit' AND company_id = $1 LIMIT 1`, [cid]);
        if (shipR.rows.length) {
            await pool.query(`
                INSERT INTO tracking_logs (shipment_id, status, location_note)
                VALUES ($1, 'Vessel Departed', 'Container loaded on MV Maersk Gulsun. Vessel departed Mumbai Port.')
            `, [shipR.rows[0].id]);
        }

        console.log("🚀 Demo Data Seeding Finished!");
    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        await pool.end();
    }
}

seedDemoData();
