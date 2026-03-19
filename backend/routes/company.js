const express = require('express');
const router = express.Router();
const { authorizeRole } = require('../middleware/auth');

module.exports = async (pool, createNotification) => {

    // ==========================================
    // 1. DASHBOARD OVERVIEW & STATISTICS
    // ==========================================
    router.get('/stats', authorizeRole(['company']), async (req, res) => {
        try {
            const companyId = req.user.userId;

            // Get Active Deliveries (Accepted, In Transit, At Customs)
            const activeResult = await pool.query(
                `SELECT COUNT(*) FROM shipments WHERE company_id = $1 AND status IN ('Accepted', 'In Transit', 'At Customs')`,
                [companyId]
            );

            // Get Total Earnings
            const earningsResult = await pool.query(
                `SELECT COALESCE(SUM(amount), 0) as total FROM transactions t JOIN shipments s ON t.shipment_id = s.id WHERE s.company_id = $1 AND t.status = 'Completed'`,
                [companyId]
            );

            // Get On-Time Rate & Rating from Company Profile
            const profileResult = await pool.query(
                `SELECT on_time_rate, total_deliveries FROM company_profiles WHERE user_id = $1`,
                [companyId]
            );

            const activeDeliveries = parseInt(activeResult.rows[0].count);
            const grossEarnings = parseFloat(earningsResult.rows[0].total);
            const netEarnings = grossEarnings * 0.95; // 5% platform fee
            const platformFee = grossEarnings * 0.05;

            let onTimeRate = 0;
            if (profileResult.rows.length > 0) {
                onTimeRate = parseFloat(profileResult.rows[0].on_time_rate);
            }

            res.json({
                success: true,
                stats: {
                    activeDeliveries,
                    grossEarnings,
                    netEarnings,
                    platformFee,
                    onTimeRate,
                    rating: 4.8 // Mock rating until review system is active
                }
            });
        } catch (err) {
            console.error('[COMPANY STATS] Error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch company statistics' });
        }
    });

    // ==========================================
    // 2. MARKETPLACE: New Shipment Requests
    // ==========================================
    router.get('/new-shipments', authorizeRole(['company']), async (req, res) => {
        try {
            // Fetch shipments that are 'Booked' and not yet assigned to a company
            const result = await pool.query(
                `SELECT s.*, 
                 c.full_name as customer_name
                 FROM shipments s 
                 LEFT JOIN customer_profiles c ON s.customer_id = c.user_id 
                 WHERE s.status = 'Booked' AND s.company_id IS NULL
                 ORDER BY s.created_at DESC`
            );

            res.json({ success: true, shipments: result.rows });
        } catch (err) {
            console.error('[MARKETPLACE] Error fetching new requests:', err);
            res.status(500).json({ success: false, message: 'Failed to load marketplace' });
        }
    });

    // ==========================================
    // 3. MARKETPLACE: Accept a Shipment
    // ==========================================
    router.post('/accept', authorizeRole(['company']), async (req, res) => {
        const { shipmentId } = req.body;
        const companyId = req.user.userId;

        if (!shipmentId) return res.status(400).json({ success: false, message: 'Shipment ID required' });

        try {
            // Verify shipment is still available
            const check = await pool.query(`SELECT status, company_id FROM shipments WHERE id = $1`, [shipmentId]);
            if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Shipment not found' });
            if (check.rows[0].company_id !== null) return res.status(400).json({ success: false, message: 'Shipment already claimed by another company.' });

            // Assign to company and update status
            const result = await pool.query(
                `UPDATE shipments 
                 SET company_id = $1, status = 'Accepted' 
                 WHERE id = $2 RETURNING *`,
                [companyId, shipmentId]
            );

            // Notify Customer
            await createNotification(
                result.rows[0].customer_id,
                'SHIPMENT_UPDATE',
                'Shipment Accepted',
                `Your shipment #${shipmentId} has been accepted by a logistics partner.`,
                `/shipments.html`
            );

            res.json({ success: true, message: 'Shipment accepted successfully!', shipment: result.rows[0] });
        } catch (err) {
            console.error('[MARKETPLACE] Error accepting shipment:', err);
            res.status(500).json({ success: false, message: 'Failed to accept shipment' });
        }
    });

    // ==========================================
    // 4. ACTIVE SHIPMENTS: List
    // ==========================================
    router.get('/active', authorizeRole(['company']), async (req, res) => {
        try {
            const companyId = req.user.userId;

            const result = await pool.query(
                `SELECT s.*, 
                 c.full_name as customer_name, c.phone as customer_phone
                 FROM shipments s 
                 LEFT JOIN customer_profiles c ON s.customer_id = c.user_id 
                 WHERE s.company_id = $1 AND s.status IN ('Accepted', 'In Transit', 'At Customs')
                 ORDER BY s.created_at DESC`,
                [companyId]
            );

            res.json({ success: true, shipments: result.rows });
        } catch (err) {
            console.error('[ACTIVE SHIPMENTS] Error:', err);
            res.status(500).json({ success: false, message: 'Failed to load active shipments' });
        }
    });

    // ==========================================
    // 5. ACTIVE SHIPMENTS: Update Status
    // ==========================================
    router.post('/update-status', authorizeRole(['company']), async (req, res) => {
        const { shipmentId, newStatus, vehicleType } = req.body;
        const companyId = req.user.userId;

        if (!shipmentId || !newStatus) return res.status(400).json({ success: false, message: 'Missing required parameters' });

        try {
            // Enforce ownership
            const check = await pool.query(`SELECT id FROM shipments WHERE id = $1 AND company_id = $2`, [shipmentId, companyId]);
            if (check.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized to update this shipment' });

            let updateQuery = `UPDATE shipments SET status = $1 WHERE id = $2 RETURNING *`;
            let params = [newStatus, shipmentId];

            if (vehicleType) {
                updateQuery = `UPDATE shipments SET status = $1, vehicle_type = $2 WHERE id = $3 RETURNING *`;
                params = [newStatus, vehicleType, shipmentId];
            }

            const result = await pool.query(updateQuery, params);

            // Log the event
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [shipmentId, newStatus, `Shipment status updated by logistics partner`, req.user.userId]
            );

            // Notify Customer
            await createNotification(
                result.rows[0].customer_id,
                'SHIPMENT_UPDATE',
                'Status Update',
                `Your shipment #${shipmentId} is now: ${newStatus}`,
                `/shipments.html`
            );

            res.json({ success: true, message: 'Status updated successfully!', shipment: result.rows[0] });
        } catch (err) {
            console.error('[UPDATE STATUS] Error:', err);
            res.status(500).json({ success: false, message: 'Failed to update status' });
        }
    });

    // ==========================================
    // 6. EARNINGS: Detailed Report
    // ==========================================
    router.get('/earnings', authorizeRole(['company']), async (req, res) => {
        try {
            const companyId = req.user.userId;
            // Fetch detailed transaction history for completed shipments
            const result = await pool.query(
                `SELECT t.id, t.amount, t.currency, t.created_at, s.id as shipment_id, s.origin_address, s.destination_address 
                 FROM transactions t 
                 JOIN shipments s ON t.shipment_id = s.id 
                 WHERE s.company_id = $1 AND t.status = 'Completed'
                 ORDER BY t.created_at DESC`,
                [companyId]
            );
            res.json({ success: true, transactions: result.rows });
        } catch (err) {
            console.error('[EARNINGS] Error:', err);
            res.status(500).json({ success: false, message: 'Failed to load earnings history' });
        }
    });

    // ==========================================
    // 7. VEHICLES: List Fleet
    // ==========================================
    router.get('/vehicles', authorizeRole(['company']), async (req, res) => {
        try {
            const companyId = req.user.userId;
            // Create table if it doesn't exist
            await pool.query(`
                CREATE TABLE IF NOT EXISTS vehicles (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER REFERENCES users(id),
                    name VARCHAR(255),
                    type VARCHAR(100),
                    capacity_kg NUMERIC,
                    emission_factor NUMERIC,
                    registration_number VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'Active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            const result = await pool.query(`SELECT * FROM vehicles WHERE company_id = $1 ORDER BY created_at DESC`, [companyId]);
            res.json({ success: true, vehicles: result.rows });
        } catch (err) {
            console.error('[VEHICLES] Error:', err);
            res.status(500).json({ success: false, message: 'Failed to load fleet' });
        }
    });

    // ==========================================
    // 8. VEHICLES: Add to Fleet
    // ==========================================
    router.post('/add-vehicle', authorizeRole(['company']), async (req, res) => {
        const { name, type, capacity_kg, emission_factor, registration_number } = req.body;
        const companyId = req.user.userId;

        if (!name || !type || !registration_number) return res.status(400).json({ success: false, message: 'Missing required vehicle details' });

        try {
            const result = await pool.query(
                `INSERT INTO vehicles (company_id, name, type, capacity_kg, emission_factor, registration_number)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [companyId, name, type, capacity_kg || 0, emission_factor || 0, registration_number]
            );
            res.json({ success: true, message: 'Vehicle added successfully!', vehicle: result.rows[0] });
        } catch (err) {
            console.error('[VEHICLES] Add Error:', err);
            res.status(500).json({ success: false, message: 'Failed to add vehicle' });
        }
    });

    // ==========================================
    // 9. VEHICLES: Delete from Fleet
    // ==========================================
    router.delete('/delete-vehicle', authorizeRole(['company']), async (req, res) => {
        const { vehicleId } = req.body;
        const companyId = req.user.userId;
        if (!vehicleId) return res.status(400).json({ success: false, message: 'Vehicle ID required' });
        try {
            const check = await pool.query(`SELECT id FROM vehicles WHERE id = $1 AND company_id = $2`, [vehicleId, companyId]);
            if (check.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized or vehicle not found' });
            await pool.query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]);
            res.json({ success: true, message: 'Vehicle deleted successfully' });
        } catch (err) {
            console.error('[VEHICLES] Delete Error:', err);
            res.status(500).json({ success: false, message: 'Failed to delete vehicle' });
        }
    });

    // ==========================================
    // 10. VEHICLES: Update Status (Active/Maintenance)
    // ==========================================
    router.post('/update-vehicle-status', authorizeRole(['company']), async (req, res) => {
        const { vehicleId, status } = req.body;
        const companyId = req.user.userId;
        if (!vehicleId || !status) return res.status(400).json({ success: false, message: 'Vehicle ID and status required' });
        const allowed = ['Active', 'Maintenance', 'Retired'];
        if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status value' });
        try {
            const check = await pool.query(`SELECT id FROM vehicles WHERE id = $1 AND company_id = $2`, [vehicleId, companyId]);
            if (check.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized or vehicle not found' });
            const result = await pool.query(`UPDATE vehicles SET status = $1 WHERE id = $2 RETURNING *`, [status, vehicleId]);
            res.json({ success: true, message: `Status updated to ${status}`, vehicle: result.rows[0] });
        } catch (err) {
            console.error('[VEHICLES] Status Update Error:', err);
            res.status(500).json({ success: false, message: 'Failed to update vehicle status' });
        }
    });

    return router;
};
