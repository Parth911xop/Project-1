-- Migration 4.1: Ensure negotiated_quotes exist on shipments
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS negotiated_quotes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS requested_documents JSONB DEFAULT '["Government ID", "Packing List"]'::jsonb;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS selected_service_level VARCHAR(50);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS selected_quote_id VARCHAR(50);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS hs_code VARCHAR(50);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS consignee_name VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS consignee_contact VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cargo_value DECIMAL(12,2);

-- DATA SEEDING: Fix all shipments that are stuck in "Ship Allocated" or "Documents Pending" 
-- but have empty quotes. This fixes "all requests" as requested by user.
UPDATE shipments 
SET negotiated_quotes = '[
    {"name": "Economy", "price": 45000, "transitTime": "Slow/Ocean"},
    {"name": "Standard", "price": 62000, "transitTime": "Direct Sea"},
    {"name": "Express", "price": 85000, "transitTime": "Fast/Priority"}
]'::jsonb
WHERE (status = 'Ship Allocated' OR status = 'Documents Pending' OR status = 'Payment Pending')
  AND (negotiated_quotes IS NULL OR negotiated_quotes::text = '[]');

-- Also ensure requested_documents are set if missing
UPDATE shipments
SET requested_documents = '["Government ID", "Commercial Invoice", "Packing List"]'::jsonb
WHERE (status = 'Ship Allocated' OR status = 'Documents Pending' OR status = 'Payment Pending')
  AND (requested_documents IS NULL OR requested_documents::text = '[]');
