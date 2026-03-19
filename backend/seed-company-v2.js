
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seedDemoData() {
    const companyIds = [17, 7]; // FedEx and Global Transit
    const custId = 1;

    try {
        console.log("🌱 Seeding Demo Data for all companies...");

        for (const cid of companyIds) {
            console.log(`Processing company ID ${cid}...`);
            await pool.query(`DELETE FROM vehicles WHERE company_id = $1`, [cid]);
            await pool.query(`DELETE FROM schedules WHERE company_id = $1`, [cid]);
            await pool.query(`DELETE FROM pricing_rates WHERE company_id = $1`, [cid]);

            // Vessels
            await pool.query(`
                INSERT INTO vehicles (company_id, name, type, capacity, location, next_stop, status) VALUES
                ($1, 'MV Maersk Gulsun', 'Container Ship', '23756 TEU', 'Mumbai Port, IN', 'Rotterdam, NL', 'Available'),
                ($1, 'Ever Alot', 'Container Ship', '24000 TEU', 'At Sea', 'Hamburg, DE', 'At Sea'),
                ($1, 'FedEx Atlas', 'Bulk Carrier', '18000 TEU', 'Singapore', 'Dubai, UAE', 'Maintenance')
            `, [cid]);

            // Schedules
            await pool.query(`
                INSERT INTO schedules (company_id, vessel_name, from_port, to_port, departure_time, arrival_time, status) VALUES
                ($1, 'MV Maersk Gulsun', 'Mumbai', 'Rotterdam', NOW() + INTERVAL '2 days', NOW() + INTERVAL '22 days', 'Scheduled'),
                ($1, 'Ever Alot', 'Shanghai', 'Hamburg', NOW() - INTERVAL '5 days', NOW() + INTERVAL '15 days', 'In Transit')
            `, [cid]);

            // Pricing
            await pool.query(`
                INSERT INTO pricing_rates (company_id, origin, destination, mode, rate_per_unit, min_charge, transit_days) VALUES
                ($1, 'Mumbai', 'Rotterdam', 'Ocean FCL', 4500, 3200, 22),
                ($1, 'New York', 'London', 'Air Freight', 8.5, 500, 3)
            `, [cid]);

            // Shipments
            const shipments = [
                { cust: custId, company: cid, type: 'Ocean', from: 'Mumbai', to: 'Rotterdam', status: 'Delivered', cost: 4500, created: '2025-12-01' },
                { cust: custId, company: cid, type: 'Ocean', from: 'Shanghai', to: 'Hamburg', status: 'Delivered', cost: 5200, created: '2026-01-10' },
                { cust: custId, company: cid, type: 'Ocean', from: 'Mumbai', to: 'Dubai', status: 'In Transit', cost: 2800, created: '2026-03-01' }
            ];
            for (const s of shipments) {
                await pool.query(`
                    INSERT INTO shipments (customer_id, company_id, type, origin_address, destination_address, status, estimated_cost, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [s.cust, s.company, s.type, s.from, s.to, s.status, s.cost, s.created]);
            }
        }

        // Unassigned
        await pool.query(`
            INSERT INTO shipments (customer_id, company_id, type, origin_address, destination_address, status, estimated_cost, created_at)
            VALUES ($1, NULL, 'Ocean', 'Kolkata', 'Singapore', 'Booked', 1800, NOW()),
                   ($1, NULL, 'Air', 'Delhi', 'Tokyo', 'Booked', 3500, NOW())
        `, [custId]);

        console.log("🚀 Demo Data Seeding Finished!");
    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        await pool.end();
    }
}

seedDemoData();
