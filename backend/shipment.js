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
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN hs_code VARCHAR(50);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN volume_cbm DECIMAL(10, 2);`); } catch (e) { }
        try { await pool.query(`ALTER TABLE shipments ADD COLUMN cargo_value DECIMAL(10, 2);`); } catch (e) { }

        console.log("✅ Table 'shipments' ready");
    } catch (err) {
        console.error("❌ Error creating 'shipments' table:", err);
    }
};

// --- Routes ---

module.exports = (pool) => {
    // Initialize table on load (or call explicitly in server.js)
    createShipmentTable(pool);

    // Create a new shipment
    router.post('/create', async (req, res) => {
        const {
            userId, type, fromCountry, toCountry, productType, weight,
            recommendedPort, estimatedCost, transitTime,
            shipperDetails, consigneeDetails, incoterms, mode, hsCode, volume, cargoValue,
            status // Accept status override
        } = req.body;

        if (!type || !fromCountry || !toCountry) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const initialStatus = status || 'pending';

        try {
            const result = await pool.query(
                `INSERT INTO shipments (
                    user_id, type, from_country, to_country, product_type, weight, 
                    recommended_port, estimated_cost, transit_time,
                    shipper_details, consignee_details, incoterms, mode, hs_code, volume_cbm, cargo_value,
                    status
                ) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
                [
                    userId || null, type, fromCountry, toCountry, productType, weight,
                    recommendedPort, estimatedCost, transitTime,
                    shipperDetails, consigneeDetails, incoterms, mode, hsCode, volume, cargoValue,
                    initialStatus
                ]
            );

            const shipmentId = result.rows[0].id;
            let bookingReference = null;

            // Generate Booking Reference if Booked
            if (initialStatus === 'Booked') {
                bookingReference = `SS-BKG-2026-${1000 + shipmentId}`; // Simple ID based ref
                // Optionally store this reference if we had a column, for now just returning it for UI
            }

            res.json({
                success: true,
                shipmentId: shipmentId,
                message: "Shipment created successfully",
                bookingReference: bookingReference
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error creating shipment" });
        }
    });

    // Get all shipments (optionally filter by user)
    router.get('/all', async (req, res) => {
        const { userId } = req.query;
        let query = 'SELECT * FROM shipments ORDER BY created_at DESC';
        let params = [];

        if (userId) {
            query = 'SELECT * FROM shipments WHERE user_id = $1 ORDER BY created_at DESC';
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
            await pool.query('UPDATE shipments SET status = $1 WHERE id = $2', [status, shipmentId]);
            res.json({ success: true, message: "Status updated successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error updating status" });
        }
    });

    return router;
};
