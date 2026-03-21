const express = require('express');
const router = express.Router();

// Initialize Shipment Table
const createShipmentTable = async (pool) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shipments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                type VARCHAR(50) NOT NULL, -- 'Export' or 'Import'
                from_country VARCHAR(100) NOT NULL,
                to_country VARCHAR(100) NOT NULL,
                product_type VARCHAR(100),
                weight DECIMAL(10, 2),
                recommended_port VARCHAR(100),
                estimated_cost DECIMAL(10, 2),
                transit_time INTEGER,
                status VARCHAR(50) DEFAULT 'pending', -- pending, in-transit, delivered, customs
                -- New Fields
                shipper_details JSONB,
                consignee_details JSONB,
                incoterms VARCHAR(10),
                mode VARCHAR(20), -- Sea, Air, Road
                hs_code VARCHAR(50),
                volume_cbm DECIMAL(10, 2),
                cargo_value DECIMAL(10, 2),
                company_id INTEGER REFERENCES users(id),
                carbon_emission NUMERIC,
                vehicle_type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Idempotent column additions for existing tables
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN recommended_port VARCHAR(100);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN estimated_cost DECIMAL(10, 2);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN transit_time INTEGER;`); } catch (e) { }

        // Add new columns if they don't exist
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN shipper_details JSONB;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN consignee_details JSONB;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN incoterms VARCHAR(10);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN mode VARCHAR(20);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS origin_lat NUMERIC;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS origin_lng NUMERIC;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dest_lat NUMERIC;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dest_lng NUMERIC;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS mmsi VARCHAR(20);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS ship_name VARCHAR(255);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customer_name_manual VARCHAR(255);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN hs_code VARCHAR(50);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN description TEXT;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN consignee_name VARCHAR(255);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN consignee_contact VARCHAR(255);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN iec_code VARCHAR(100);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN weight_kg DECIMAL(10, 2);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN volume_cbm DECIMAL(10, 2);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN cargo_value DECIMAL(10, 2);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES users(id);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carbon_emission NUMERIC;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cargo_details JSONB;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS estimated_departure TIMESTAMP;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMP;`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS product_type VARCHAR(100);`); } catch (e) { }

        console.log("✅ Table 'shipments' ready");
    } catch (err) {
        console.error("❌ Error creating 'shipments' table:", err);
    }
};

// --- Routes ---

module.exports = (pool, createNotification, io) => {
    // Initialize table on load (or call explicitly in server.js)
    createShipmentTable(pool);

    // Manager Direct Shipment Creation
    router.post('/manager/create', async (req, res) => {
        const {
            trackingNumber, fromCountry, toCountry, mode, weight, productType, 
            customerNameManual, cargoDetails, hsCode, description,
            mmsi, shipName, originLat, originLng, destLat, destLng
        } = req.body;

        const managerId = req.user?.userId;
        if (!managerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // Auto-lookup for ports if missing
        const { getPortCoordinates } = require('./services/ports');
        const oCoords = !originLat ? getPortCoordinates(fromCountry) : null;
        const dCoords = !destLat ? getPortCoordinates(toCountry) : null;

        try {
            const result = await pool.query(
                `INSERT INTO shipments (
                    company_id, tracking_number, origin_address, destination_address,
                    origin_country, destination_country, mode, weight_kg, product_type,
                    customer_name_manual, status, hs_code, description, cargo_details,
                    mmsi, ship_name, origin_lat, origin_lng, dest_lat, dest_lng
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Accepted', $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING id`,
                [
                    managerId, trackingNumber, fromCountry, toCountry, fromCountry, toCountry,
                    mode || 'Sea', weight || 0, productType || 'General Cargo',
                    customerNameManual, hsCode, description,
                    cargoDetails ? JSON.stringify(cargoDetails) : '{}',
                    mmsi, shipName, 
                    originLat || oCoords?.lat, originLng || oCoords?.lng,
                    destLat || dCoords?.lat, destLng || dCoords?.lng
                ]
            );

            res.json({ success: true, shipmentId: result.rows[0].id, message: 'Direct shipment created and accepted' });
        } catch (err) {
            console.error('Manager create error:', err);
            res.status(500).json({ success: false, message: 'Database error creating shipment' });
        }
    });

    // Create a new shipment
    router.post('/create', async (req, res) => {
        const {
            type,
            fromCountry, toCountry,         // wizard fields
            originAddress, destinationAddress, // optional explicit address
            estimatedCost, transitTime,
            mode, status, weight, carbonEmission,
            cargoDetails, productType
        } = req.body;

        // CRITICAL: Always get userId from the JWT token
        const userId = req.user?.userId || req.body.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required. Please log in again." });
        }

        if (!type || (!fromCountry && !originAddress)) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const initialStatus = 'Booked';
        const origin = originAddress || fromCountry || '';
        const dest = destinationAddress || toCountry || '';
        const currency = 'USD';

        try {
            const {
                hsCode, description, consigneeName, consigneeContact, cargoValue, iecCode, companyId,
                preferredShippingDate, sourcePort, destinationPort,
                mmsi, shipName, originLat, originLng, destLat, destLng
            } = req.body;

            // Auto-lookup for ports if missing
            const { getPortCoordinates } = require('./services/ports');
            const oCoords = !originLat ? getPortCoordinates(fromCountry || sourcePort) : null;
            const dCoords = !destLat ? getPortCoordinates(toCountry || destinationPort) : null;

            const result = await pool.query(
                `INSERT INTO shipments (
                    customer_id, type, origin_address, destination_address,
                    origin_country, destination_country,
                    estimated_cost, currency, transit_time,
                    mode, weight_kg, carbon_emission, status,
                    hs_code, description, consignee_name, consignee_contact,
                    cargo_value, iec_code, product_type, cargo_details, company_id,
                    preferred_shipping_date, source_port, destination_port,
                    mmsi, ship_name, origin_lat, origin_lng, dest_lat, dest_lng
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
                RETURNING id`,
                [
                    userId,
                    type || 'Export',
                    origin,
                    dest,
                    origin,
                    dest,
                    estimatedCost || null,
                    currency,
                    transitTime || null,
                    mode || null,
                    weight || null,
                    carbonEmission || null,
                    initialStatus,
                    hsCode || null,
                    description || null,
                    consigneeName || null,
                    consigneeContact || null,
                    cargoValue || null,
                    iecCode || null,
                    productType || null,
                    cargoDetails ? JSON.stringify(cargoDetails) : null,
                    companyId || null,
                    preferredShippingDate || null,
                    sourcePort || origin || null,
                    destinationPort || dest || null,
                    mmsi || null,
                    shipName || null,
                    originLat || oCoords?.lat,
                    originLng || oCoords?.lng,
                    destLat || dCoords?.lat,
                    destLng || dCoords?.lng
                ]
            );

            const shipmentId = result.rows[0].id;
            
            // Fetch user prefix for booking ref/notif
            const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
            const prefix = userRes.rows[0]?.email ? userRes.rows[0].email.substring(0, 2).toUpperCase() : 'SS';
            const bookingReference = `${prefix}-BKG-2026-${1000 + shipmentId}`;

            // Log initial event
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [shipmentId, initialStatus, 'Shipment created and booked', userId]
            );

            // Notify Company
            if (companyId) {
                await createNotification(
                    companyId,
                    'NEW_BOOKING',
                    'New Shipment Assigned',
                    `You have been assigned a new shipment ${bookingReference}.`,
                    `/company.html`
                );
            }

            res.json({
                success: true,
                shipmentId,
                message: "Shipment created successfully",
                bookingReference
            });

        } catch (err) {
            console.error('Shipment create error:', err);
            res.status(500).json({ success: false, message: "Database error creating shipment: " + err.message });
        }
    });

    // Get shipments for the currently authenticated user (JWT-based)
    router.get('/list', async (req, res) => {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        try {
            const result = await pool.query(
                `SELECT s.*, u.name as company_name, UPPER(LEFT(u2.email, 2)) as user_prefix
                 FROM shipments s
                 LEFT JOIN users u ON s.company_id = u.id
                 JOIN users u2 ON s.customer_id = u2.id
                 WHERE s.customer_id = $1
                 ORDER BY s.created_at DESC`,
                [userId]
            );
            res.json({ success: true, shipments: result.rows });
        } catch (err) {
            console.error('Shipment list error:', err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // Get all shipments (optionally filter by user)
    router.get('/all', async (req, res) => {
        const { userId } = req.query;
        let query = `
            SELECT s.*, UPPER(LEFT(u.email, 2)) as user_prefix 
            FROM shipments s 
            JOIN users u ON s.customer_id = u.id 
            ORDER BY s.created_at DESC`;
        let params = [];

        if (userId) {
            query = `
                SELECT s.*, UPPER(LEFT(u.email, 2)) as user_prefix 
                FROM shipments s 
                JOIN users u ON s.customer_id = u.id 
                WHERE s.customer_id = $1 
                ORDER BY s.created_at DESC`;
            params = [userId];
        }

        try {
            const result = await pool.query(query, params);
            res.json({ success: true, shipments: result.rows });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error retrieving shipments" });
        }
    });

    // Get tracking history for a shipment (Internal + External Hybrid)
    router.get('/:id/tracking', async (req, res) => {
        const { id } = req.params;
        try {
            // 1. Fetch Internal Logs
            const localRes = await pool.query(
                `SELECT id, shipment_id, lat, lng, status, location_note, timestamp
                 FROM tracking_logs
                 WHERE shipment_id = $1
                 ORDER BY timestamp ASC`,
                [id]
            );

            // 2. Fetch Shipment Details (Ports + Coords)
            const shipRes = await pool.query(
                `SELECT tracking_number, mode, origin_address, destination_address, 
                        origin_lat, origin_lng, dest_lat, dest_lng 
                 FROM shipments WHERE id = $1`, [id]);
            
            let shipInfo = shipRes.rows[0];
            
            // Fallback for visual demonstration if ports are blank
            if (shipInfo && !shipInfo.origin_lat) {
                if (shipInfo.origin_address?.toLowerCase().includes('india')) { shipInfo.origin_lat = 18.94; shipInfo.origin_lng = 72.83; }
                else { shipInfo.origin_lat = 1.35; shipInfo.origin_lng = 103.81; } // Singapore
            }
            if (shipInfo && !shipInfo.dest_lat) {
                if (shipInfo.destination_address?.toLowerCase().includes('china')) { shipInfo.dest_lat = 31.23; shipInfo.dest_lng = 121.47; }
                else if (shipInfo.destination_address?.toLowerCase().includes('dubai')) { shipInfo.dest_lat = 25.20; shipInfo.dest_lng = 55.27; }
                else { shipInfo.dest_lat = 51.50; shipInfo.dest_lng = -0.12; } // London
            }

            let externalData = null;
            if (shipInfo && shipInfo.tracking_number) {
                const { getExternalTracking } = require('./services/whereParcel');
                externalData = await getExternalTracking(shipInfo.tracking_number);
            }

            res.json({ 
                success: true, 
                shipment: shipInfo || null,
                logs: localRes.rows,
                external: externalData || null 
            });
        } catch (err) {
            console.error('Tracking history error:', err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // Get Live Ship Location from VesselFinder Service
    router.get('/:id/live-vessel', async (req, res) => {
        const { id } = req.params;
        try {
            // Fetch shipment to get MMSI
            const shipRes = await pool.query('SELECT mmsi, ship_name, origin_lat, origin_lng, dest_lat, dest_lng FROM shipments WHERE id = $1', [id]);
            if (shipRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Shipment not found' });
            
            const shipment = shipRes.rows[0];
            const { mmsi, ship_name } = shipment;

            if (!mmsi) {
                return res.status(400).json({ success: false, message: 'MMSI not assigned to this shipment' });
            }

            const { getShipLocation } = require('./services/vesselFinder');
            const liveLocation = await getShipLocation(mmsi, ship_name);

            if (!liveLocation) {
                return res.status(503).json({ success: false, message: 'Vessel location service unavailable' });
            }

            res.json({
                success: true,
                live: liveLocation,
                shipment: shipment
            });

        } catch (err) {
            console.error('Live vessel tracking error:', err);
            res.status(500).json({ success: false, message: 'Server error fetching ship location' });
        }
    });

    // Get specific shipment
    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query('SELECT * FROM shipments WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: "Shipment not found" });
            }
            res.json({ success: true, shipment: result.rows[0] });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error" });
        }
    });

    // Update shipment status
    router.post('/update-status', async (req, res) => {
        const { shipmentId, status } = req.body;

        if (!shipmentId || !status) {
            return res.status(400).json({ success: false, message: "Shipment ID and Status are required" });
        }

        try {
            await pool.query('UPDATE shipments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, shipmentId]);
            
            // Fetch prefix
            const shipRes = await pool.query(`
                SELECT s.customer_id, UPPER(LEFT(u.email, 2)) as prefix 
                FROM shipments s 
                JOIN users u ON s.customer_id = u.id 
                WHERE s.id = $1`, [shipmentId]);
            const prefix = shipRes.rows[0]?.prefix || 'SS';

            // Broadcast real-time event to rooms
            if (io) {
                io.to(`shipment:${shipmentId}`).emit('shipment:status_update', { shipmentId, status, user_prefix: prefix });
            }

            // Log event
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [shipmentId, status, `Status changed to ${status}`, req.user?.userId]
            );

            // Notify Customer
            if (shipRes.rows.length > 0) {
                await createNotification(
                    shipRes.rows[0].customer_id,
                    'SHIPMENT_UPDATE',
                    'Shipment Status Updated',
                    `Your shipment #${prefix}-${shipmentId} is now ${status}.`,
                    `/shipments.html`
                );
            }

            res.json({ success: true, message: "Status updated successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error updating status" });
        }
    });

    // Get shipment history/events
    router.get('/history/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(
                `SELECT e.*, u.name as updater_name 
                 FROM shipment_events e
                 LEFT JOIN users u ON e.updated_by = u.id
                 WHERE e.shipment_id = $1
                 ORDER BY e.created_at ASC`,
                [id]
            );
            res.json({ success: true, events: result.rows });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error fetching history" });
        }
    });

    // Update shipment details (HS Code, Consignee, Description)
    router.patch('/:id/update-details', async (req, res) => {
        const shipmentId = parseInt(req.params.id);
        const { hsCode, consigneeName, description, consigneeContact, cargoValue, trackingNumber } = req.body;
        const userId = req.user?.userId;
        
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        try {
            await pool.query(`
                UPDATE shipments 
                SET hs_code = COALESCE($1, hs_code),
                    consignee_name = COALESCE($2, consignee_name),
                    description = COALESCE($3, description),
                    consignee_contact = COALESCE($4, consignee_contact),
                    cargo_value = COALESCE($5, cargo_value),
                    tracking_number = COALESCE($6, tracking_number),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $7`,
                [hsCode, consigneeName, description, consigneeContact, cargoValue, trackingNumber, shipmentId]
            );
            res.json({ success: true, message: 'Shipment details updated' });
        } catch (err) {
            console.error('Update details error:', err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    return router;
};
