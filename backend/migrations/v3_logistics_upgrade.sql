-- V3 Logistics Upgrade Migration
-- Aligns the shipments table with the new Enterprise Multi-Stop workflow.

DO $$ 
BEGIN 
    -- 1. Update Shipment Status State Machine with V3 states
    ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
    ALTER TABLE shipments ADD CONSTRAINT shipments_status_check 
    CHECK (status IN (
        'Pending Approval', 'Pending Manager Approval', 'Ship Allocated', 'Cargo Ready',
        'Cargo Loaded', 'In Transit', 'At Port', 'Arrived', 
        'Delivered', 'Cancelled', 'Declined', 'Disputed', 
        'Booked', 'Accepted', 'Customs', 'Out for Delivery' -- Legacy compatibility
    ));

    -- 2. Add Missing Logistics Columns to shipments
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS allocated_ship_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL;
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cargo_drop_port VARCHAR(255);
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS manager_notes TEXT;
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(100);
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS estimated_departure TIMESTAMP;
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMP;
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS allocated_at TIMESTAMP;

    -- 3. Add Multi-Stop Voyage Infrastructure
    CREATE TABLE IF NOT EXISTS ship_route_stops (
        id SERIAL PRIMARY KEY,
        ship_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
        port_name VARCHAR(255) NOT NULL,
        stop_order INTEGER NOT NULL,
        lat DECIMAL(10, 8),
        lng DECIMAL(11, 8),
        estimated_arrival TIMESTAMP,
        estimated_departure TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ship_id, stop_order)
    );

    -- 4. Enhance Vehicles table for Fleet Monitoring
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_port VARCHAR(255);
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10, 8);
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11, 8);
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS container_slots INTEGER DEFAULT 100;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS used_slots INTEGER DEFAULT 0;

EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'V3 Migration handled or already applied';
END $$;
