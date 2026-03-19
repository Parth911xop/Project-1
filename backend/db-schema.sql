-- Production Schema for Smart Shipping
-- WARNING: Executing this script will drop existing tables and re-create them.

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS tracking_logs CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS company_profiles CASCADE;
DROP TABLE IF EXISTS customer_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Core Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50) UNIQUE,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'company', 'admin')),
    otp_code VARCHAR(6), -- for legacy/dev tests
    password_hash VARCHAR(255),
    company_status VARCHAR(20) DEFAULT 'pending' CHECK (company_status IN ('pending', 'approved', 'suspended', 'rejected')),
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- 2. Customer Profiles
CREATE TABLE customer_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    company_name VARCHAR(255),
    billing_address TEXT,
    default_currency VARCHAR(3) DEFAULT 'USD',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Company Profiles
CREATE TABLE company_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    tax_id VARCHAR(100),
    verification_docs_url TEXT,
    approval_date TIMESTAMP,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_deliveries INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Vehicles (Carrier Fleet)
CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- e.g., 'Van', 'Truck', 'Ship', 'Plane'
    license_plate VARCHAR(50),
    capacity_kg FLOAT,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'Inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_vehicles_company ON vehicles(company_id);

-- 5. Shipments (Core Application Ledger)
CREATE TABLE shipments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    company_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    type VARCHAR(50), -- Ocean, Air, Land
    origin_address TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    origin_country VARCHAR(100),
    destination_country VARCHAR(100),
    weight_kg FLOAT,
    volume_m3 FLOAT,
    carbon_emission FLOAT,
    estimated_cost DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'Booked' CHECK (status IN ('Booked', 'Accepted', 'In Transit', 'Customs', 'Out for Delivery', 'Delivered', 'Cancelled', 'Declined')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_company ON shipments(company_id);
CREATE INDEX idx_shipments_status ON shipments(status);

-- 6. Tracking Logs (Phase 4 Socket.io Pre-requisite)
CREATE TABLE tracking_logs (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    location_note TEXT,
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tracking_shipment ON tracking_logs(shipment_id);

-- 7. Transactions (Phase 3 Stripe Pre-requisite)
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stripe_charge_id VARCHAR(255),
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Failed', 'Refunded')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Invoices
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    invoice_url TEXT,
    amount DECIMAL(12,2),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Documents (Phase 7 File Upload Pre-requisite)
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL, -- 'Customs', 'BOL', 'Verification', 'Other'
    file_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_documents_shipment ON documents(shipment_id);

-- 10. Reviews
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Audit Logs (Phase 8 Admin Governance)
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    target_table VARCHAR(50),
    target_id INTEGER,
    details JSONB,
    ip_address VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_admin ON audit_logs(admin_id);
