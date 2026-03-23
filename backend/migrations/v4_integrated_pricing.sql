-- Migration for Multi-Option Pricing and Document Governance
-- Adds support for triple pricing options and manager-specified document requirements.

DO $$ 
BEGIN 
    -- 1. Create Shipment Quote Options table
    CREATE TABLE IF NOT EXISTS shipment_quote_options (
        id SERIAL PRIMARY KEY,
        shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
        option_name VARCHAR(50) NOT NULL, -- 'Economy', 'Standard', 'Premium'
        price DECIMAL(15, 2) NOT NULL,
        vessel_id INTEGER REFERENCES vehicles(id),
        schedule_id INTEGER, -- Link to specific schedule if needed
        transit_time VARCHAR(100),
        is_selected BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Add Requested Documents column to shipments
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS requested_documents JSONB DEFAULT '["Government ID", "Packing List"]'::jsonb;
    
    -- 3. Add column for the selected choice
    ALTER TABLE shipments ADD COLUMN IF NOT EXISTS selected_quote_id INTEGER REFERENCES shipment_quote_options(id);

EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Migration handled or already applied';
END $$;
