-- Enterprise Upgrade Migration (v2)
-- This script enhances the core entities for multi-tenancy and advanced logistics logic.

-- 1. Organizations / Tenants
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    tier VARCHAR(20) DEFAULT 'Standard', -- 'Standard', 'Enterprise', 'Premium'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add tenant_id to core tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- 3. Update Shipment Status State Machine
DO $$ 
BEGIN 
    ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
    ALTER TABLE shipments ADD CONSTRAINT shipments_status_check 
    CHECK (status IN (
        'Draft', 'Quoted', 'Booked', 'Paid', 'Accepted', 'In Transit', 
        'Arrived', 'Cleared', 'Out for Delivery', 'Delivered', 
        'Cancelled', 'Declined', 'Disputed'
    ));
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Constraint update handled';
END $$;

-- 4. Real Routing Infrastructure
-- Rename existing columns if they exist to match new schema
DO $$ 
BEGIN
    -- Handle Ports Table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ports' AND column_name='cost_per_cbm') THEN
        ALTER TABLE ports RENAME COLUMN cost_per_cbm TO handling_fees_per_kg;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ports' AND column_name='congestion') THEN
        ALTER TABLE ports RENAME COLUMN congestion TO congestion_index;
    END IF;
    
    -- Handle Routes Table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routes' AND column_name='from_port_id') THEN
        ALTER TABLE routes RENAME COLUMN from_port_id TO origin_port_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routes' AND column_name='to_port_id') THEN
        ALTER TABLE routes RENAME COLUMN to_port_id TO dest_port_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routes' AND column_name='duration_days') THEN
        ALTER TABLE routes RENAME COLUMN duration_days TO lead_time_days;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routes' AND column_name='base_price_per_cbm') THEN
        ALTER TABLE routes RENAME COLUMN base_price_per_cbm TO base_cost_per_kg;
    END IF;
END $$;

-- Ensure constraints and new columns exist
CREATE TABLE IF NOT EXISTS ports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) UNIQUE,
    country VARCHAR(100) NOT NULL,
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    congestion_index DECIMAL(3, 2) DEFAULT 1.0,
    handling_fees_per_kg DECIMAL(10, 2) DEFAULT 0.00
);

-- Convert congestion_index from string to decimal if it was old format
DO $$
BEGIN
    ALTER TABLE ports ALTER COLUMN congestion_index TYPE DECIMAL(3,2) USING (CASE WHEN congestion_index::text = 'Low' THEN 1.0 WHEN congestion_index::text = 'Medium' THEN 1.5 WHEN congestion_index::text = 'High' THEN 2.0 ELSE 1.0 END);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Congestion index already decimal or conversion failed';
END $$;

CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    origin_port_id INTEGER REFERENCES ports(id) ON DELETE CASCADE,
    dest_port_id INTEGER REFERENCES ports(id) ON DELETE CASCADE,
    mode VARCHAR(20) CHECK (mode IN ('Air', 'Ocean', 'Land')),
    base_cost_per_kg DECIMAL(10, 2) NOT NULL,
    distance_km FLOAT,
    lead_time_days INTEGER NOT NULL,
    co2_per_kg FLOAT,
    is_active BOOLEAN DEFAULT true,
    carrier_name VARCHAR(100)
);

-- Add missing columns individually for safety
ALTER TABLE ports ADD COLUMN IF NOT EXISTS code VARCHAR(10);
ALTER TABLE ports ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_km FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS co2_per_kg FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(100);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 5. Escrow and Ledger Support
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(20) DEFAULT 'Holding' 
CHECK (escrow_status IN ('Holding', 'Released', 'Refunded', 'Disputed'));

CREATE TABLE IF NOT EXISTS carrier_ledger (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('Credit', 'Debit')),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Indices for Performance
CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_routes_origin_dest ON routes(origin_port_id, dest_port_id);
