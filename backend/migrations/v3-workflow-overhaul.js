/**
 * V3 Workflow Overhaul Migration
 * ─────────────────────────────────
 * Adds: New shipment statuses, ship allocation fields, multi-stop routes,
 *       enhanced vehicles (container slots, IMO, MMSI, cargo types),
 *       payment receipts table.
 */
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    console.log('🚀 Starting V3 Workflow Overhaul Migration...\n');

    const queries = [
        // ── 1. Expand shipment status enum ───────────────────
        {
            label: 'Drop old shipment status constraint',
            sql: `ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;`
        },
        {
            label: 'Add expanded shipment status constraint',
            sql: `ALTER TABLE shipments ADD CONSTRAINT shipments_status_check 
                  CHECK (status IN (
                    'Pending Manager Approval',
                    'Ship Allocated',
                    'Documents Pending',
                    'Payment Pending',
                    'Cargo Ready',
                    'Booked', 'Accepted', 'In Transit', 
                    'At Port', 'Customs', 'Customs Clearance',
                    'Out for Delivery', 'Delivered', 
                    'Cancelled', 'Declined'
                  ));`
        },

        // ── 2. Add ship allocation fields to shipments ──────
        {
            label: 'Add allocated_ship_id to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS allocated_ship_id INTEGER;`
        },
        {
            label: 'Add cargo_drop_port to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cargo_drop_port VARCHAR(255);`
        },
        {
            label: 'Add manager_notes to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS manager_notes TEXT;`
        },
        {
            label: 'Add allocated_at to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS allocated_at TIMESTAMP;`
        },
        {
            label: 'Add preferred_shipping_date to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS preferred_shipping_date DATE;`
        },
        {
            label: 'Add source_port to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS source_port VARCHAR(255);`
        },
        {
            label: 'Add destination_port to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS destination_port VARCHAR(255);`
        },

        // ── 3. Enhance vehicles table ───────────────────────
        {
            label: 'Add container_slots to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS container_slots INTEGER DEFAULT 100;`
        },
        {
            label: 'Add used_slots to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS used_slots INTEGER DEFAULT 0;`
        },
        {
            label: 'Add imo_number to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS imo_number VARCHAR(20);`
        },
        {
            label: 'Add mmsi to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mmsi VARCHAR(20);`
        },
        {
            label: 'Add current_lat to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10,8);`
        },
        {
            label: 'Add current_lng to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11,8);`
        },
        {
            label: 'Add current_port to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_port VARCHAR(255);`
        },
        {
            label: 'Add cargo_types to vehicles',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cargo_types TEXT;`
        },
        {
            label: 'Add name to vehicles if missing',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS name VARCHAR(255);`
        },
        {
            label: 'Add location to vehicles if missing',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location VARCHAR(255);`
        },
        {
            label: 'Add next_stop to vehicles if missing',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_stop VARCHAR(255);`
        },
        {
            label: 'Add capacity to vehicles if missing',
            sql: `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity VARCHAR(100);`
        },

        // ── 4. Ship route stops (multi-stop) ────────────────
        {
            label: 'Create ship_route_stops table',
            sql: `CREATE TABLE IF NOT EXISTS ship_route_stops (
                id SERIAL PRIMARY KEY,
                ship_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
                port_name VARCHAR(255) NOT NULL,
                port_code VARCHAR(50),
                stop_order INTEGER NOT NULL,
                estimated_arrival TIMESTAMP,
                estimated_departure TIMESTAMP,
                lat DECIMAL(10,8),
                lng DECIMAL(11,8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        },
        {
            label: 'Create index on ship_route_stops',
            sql: `CREATE INDEX IF NOT EXISTS idx_route_stops_ship ON ship_route_stops(ship_id);`
        },

        // ── 5. Payment receipts ─────────────────────────────
        {
            label: 'Create payment_receipts table',
            sql: `CREATE TABLE IF NOT EXISTS payment_receipts (
                id SERIAL PRIMARY KEY,
                transaction_id INTEGER,
                shipment_id INTEGER,
                booking_id VARCHAR(100),
                ship_name VARCHAR(255),
                cargo_details JSONB,
                payment_amount DECIMAL(12,2),
                transaction_ref VARCHAR(255),
                receipt_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                receipt_url TEXT
            );`
        },

        // ── 6. Ensure shipment_events table exists ──────────
        {
            label: 'Create shipment_events table',
            sql: `CREATE TABLE IF NOT EXISTS shipment_events (
                id SERIAL PRIMARY KEY,
                shipment_id INTEGER,
                status VARCHAR(100),
                notes TEXT,
                updated_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        },

        // ── 7. Ensure tracking_logs table exists ────────────
        {
            label: 'Ensure tracking_logs has all cols',
            sql: `ALTER TABLE tracking_logs ADD COLUMN IF NOT EXISTS lat DECIMAL(10,8);`
        },
        {
            label: 'Ensure tracking_logs has lng',
            sql: `ALTER TABLE tracking_logs ADD COLUMN IF NOT EXISTS lng DECIMAL(11,8);`
        },

        // ── 8. Ensure schedules table exists ────────────────
        {
            label: 'Create schedules table',
            sql: `CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                company_id INTEGER,
                vessel_name VARCHAR(255),
                from_port VARCHAR(255),
                to_port VARCHAR(255),
                departure_time TIMESTAMP,
                arrival_time TIMESTAMP,
                status VARCHAR(50) DEFAULT 'Scheduled',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        },

        // ── 9. Ensure pricing_rates table exists ────────────
        {
            label: 'Create pricing_rates table',
            sql: `CREATE TABLE IF NOT EXISTS pricing_rates (
                id SERIAL PRIMARY KEY,
                company_id INTEGER,
                origin VARCHAR(255),
                destination VARCHAR(255),
                mode VARCHAR(50),
                rate_per_unit DECIMAL(10,2),
                min_charge DECIMAL(10,2),
                transit_days INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        },

        // ── 10. Add updated_at to shipments if missing ──────
        {
            label: 'Add updated_at to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`
        },

        // ── 11. Add customer_id alias ───────────────────────
        {
            label: 'Add customer_id if missing (alias for user_id)',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customer_id INTEGER;`
        },

        // ── 12. Origin/dest columns ─────────────────────────
        {
            label: 'Add origin_address to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS origin_address TEXT;`
        },
        {
            label: 'Add destination_address to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS destination_address TEXT;`
        },
        {
            label: 'Add origin_country to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS origin_country VARCHAR(100);`
        },
        {
            label: 'Add destination_country to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS destination_country VARCHAR(100);`
        },
        {
            label: 'Add currency to shipments',
            sql: `ALTER TABLE shipments ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';`
        },
    ];

    let success = 0;
    let skipped = 0;

    for (const q of queries) {
        try {
            await pool.query(q.sql);
            console.log(`  ✅ ${q.label}`);
            success++;
        } catch (err) {
            if (err.message.includes('already exists') || err.message.includes('duplicate')) {
                console.log(`  ⏭️  ${q.label} (already exists)`);
                skipped++;
            } else {
                console.error(`  ❌ ${q.label}: ${err.message}`);
            }
        }
    }

    console.log(`\n✅ Migration complete: ${success} applied, ${skipped} skipped.\n`);
    await pool.end();
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
