-- Migration: Add Global Vessels for matching
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;

-- Insert Global Vessels for existing companies (FedEx Manager and others)
-- We insert them for all companies that have vehicles currently to ensure they all have some global options
INSERT INTO vehicles (company_id, name, type, container_slots, used_slots, status, is_global, current_port)
SELECT DISTINCT company_id, 'MV Global Voyager', 'Universal Container Ship', 50000, 0, 'Available', TRUE, 'Global Network'
FROM vehicles
WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE name = 'MV Global Voyager');

INSERT INTO vehicles (company_id, name, type, container_slots, used_slots, status, is_global, current_port)
SELECT DISTINCT company_id, 'Global Express Runner', 'High Speed Carrier', 10000, 0, 'Available', TRUE, 'Global Network'
FROM vehicles
WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE name = 'Global Express Runner');

INSERT INTO vehicles (company_id, name, type, container_slots, used_slots, status, is_global, current_port)
SELECT DISTINCT company_id, 'Universal Logistics Titan', 'Mega Vessel', 30000, 0, 'Available', TRUE, 'Global Network'
FROM vehicles
WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE name = 'Universal Logistics Titan');
