// company-routes-extended.js — Robust company API routes (DB Persistence)
module.exports = function registerCompanyRoutes(app, pool, authenticateToken, authorizeRole, io) {
    const auth = [authenticateToken, authorizeRole(['company'])];
    const cid = req => req.user?.userId;

    // ── 1. Company Stats (Detailed) ───────────────────────────
    app.get('/api/company/stats/detailed', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const [totalR, activeR, deliveredR, pendingR] = await Promise.all([
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1`, [id]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1 AND status IN ('Accepted','At Port','In Transit','Customs')`, [id]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1 AND status='Delivered'`, [id]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE status='Booked' AND company_id IS NULL`, [])
            ]);

            const revenueR = await pool.query(
                `SELECT COALESCE(SUM(estimated_cost*0.95),0) as total FROM shipments WHERE company_id=$1 AND status='Delivered'`, [id]
            );

            const monthlyR = await pool.query(`
                SELECT TO_CHAR(created_at,'Mon') as month, EXTRACT(MONTH FROM created_at) as month_num, COUNT(*) as count
                FROM shipments WHERE company_id=$1 AND created_at >= NOW() - INTERVAL '6 months'
                GROUP BY month, month_num ORDER BY month_num
            `, [id]);

            const exportR = await pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1 AND LOWER(type) = 'export'`, [id]).catch(() => ({ rows: [{ count: 0 }] }));
            const importR = await pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1 AND LOWER(type) = 'import'`, [id]).catch(() => ({ rows: [{ count: 0 }] }));

            res.json({
                success: true,
                total: parseInt(totalR.rows[0].count),
                active: parseInt(activeR.rows[0].count),
                delivered: parseInt(deliveredR.rows[0].count),
                pendingBookings: parseInt(pendingR.rows[0].count),
                revenue: parseFloat(revenueR.rows[0].total),
                monthly: monthlyR.rows,
                exports: parseInt(exportR.rows[0].count),
                imports: parseInt(importR.rows[0].count)
            });
        } catch (e) {
            console.error('Company stats error:', e);
            res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
        }
    });

    // ── 2. Marketplace: New Shipment Requests ─────────────────
    app.get('/api/company/pending-requests', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`
                SELECT s.*, u.name as customer_name, u.email as customer_email,
                       UPPER(LEFT(u.email, 2)) as user_prefix
                FROM shipments s 
                LEFT JOIN users u ON s.customer_id = u.id
                WHERE s.status='Booked' AND (s.company_id IS NULL OR s.company_id = $1)
                ORDER BY s.created_at DESC
            `, [id]);
            res.json({ success: true, shipments: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch requests' });
        }
    });

    // ── 3. All Company Shipments ──────────────────────────────
    app.get('/api/company/all-shipments', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`
                SELECT s.*, u.name as customer_name, u.email as customer_email,
                       UPPER(LEFT(u.email, 2)) as user_prefix
                FROM shipments s 
                LEFT JOIN users u ON s.customer_id = u.id
                WHERE s.company_id=$1 AND s.status != 'Booked' AND s.status != 'Declined'
                ORDER BY s.created_at DESC
            `, [id]);
            res.json({ success: true, shipments: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch shipments' });
        }
    });

    // ── 3.5 Financial Summary ─────────────────────────────────
    app.get('/api/company/finance/summary', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const revenueR = await pool.query(
                `SELECT COALESCE(SUM(estimated_cost*0.95),0) as total FROM shipments WHERE company_id=$1 AND status='Delivered'`, [id]
            );

            const monthlyR = await pool.query(`
                SELECT TO_CHAR(created_at,'Mon') as month, EXTRACT(MONTH FROM created_at) as month_num, 
                       COUNT(*) as shipment_count,
                       COALESCE(SUM(estimated_cost*0.95),0) as earnings
                FROM shipments WHERE company_id=$1 AND created_at >= NOW() - INTERVAL '6 months' AND status='Delivered'
                GROUP BY month, month_num ORDER BY month_num
            `, [id]);

            res.json({
                success: true,
                totalRevenue: parseFloat(revenueR.rows[0].total),
                monthly: monthlyR.rows
            });
        } catch (e) {
            console.error('Finance error:', e);
            res.status(500).json({ success: false, message: 'Failed to fetch finance summary' });
        }
    });

    // ── 4. Vessels (DB Backed) ────────────────────────────────
    app.get('/api/company/vessels', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`SELECT * FROM vehicles WHERE company_id=$1 ORDER BY id DESC`, [id]);
            res.json({ success: true, vessels: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch fleet' });
        }
    });

    app.post('/api/company/vessels', ...auth, async (req, res) => {
        const id = cid(req);
        const { name, type, capacity, location, next, status } = req.body;
        try {
            await pool.query(
                `INSERT INTO vehicles (company_id, name, type, capacity, location, next_stop, status) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, name, type, capacity, location, next || '', status || 'Available']
            );
            res.json({ success: true, message: 'Vessel added to fleet' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, message: 'Failed to add vessel' });
        }
    });

    app.delete('/api/company/vessels/:vid', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            await pool.query(`DELETE FROM vehicles WHERE id=$1 AND company_id=$2`, [req.params.vid, id]);
            res.json({ success: true, message: 'Vessel removed' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    // ── 5. Schedules (DB Backed) ──────────────────────────────
    app.get('/api/company/schedules', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`
                SELECT id, vessel_name as vessel, from_port as from, to_port as to, 
                       departure_time as depart, arrival_time as arrive, status
                FROM schedules WHERE company_id=$1 ORDER BY departure_time ASC
            `, [id]);
            res.json({ success: true, schedules: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    app.post('/api/company/schedules', ...auth, async (req, res) => {
        const id = cid(req);
        const { vessel, from, to, depart, arrive } = req.body;
        try {
            await pool.query(
                `INSERT INTO schedules (company_id, vessel_name, from_port, to_port, departure_time, arrival_time)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, vessel, from, to, depart, arrive]
            );
            res.json({ success: true, message: 'Schedule created' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    app.delete('/api/company/schedules/:sid', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            await pool.query(`DELETE FROM schedules WHERE id=$1 AND company_id=$2`, [req.params.sid, id]);
            res.json({ success: true, message: 'Schedule deleted' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    // ── 6. Pricing Rates (DB Backed) ──────────────────────────
    app.get('/api/company/pricing', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`
                SELECT id, origin as from, destination as to, mode, rate_per_unit as rate, 
                       min_charge as min, transit_days as days
                FROM pricing_rates WHERE company_id=$1 ORDER BY id DESC
            `, [id]);
            res.json({ success: true, pricing: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    app.post('/api/company/pricing', ...auth, async (req, res) => {
        const id = cid(req);
        const { from, to, mode, rate, min, days } = req.body;
        try {
            await pool.query(
                `INSERT INTO pricing_rates (company_id, origin, destination, mode, rate_per_unit, min_charge, transit_days)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, from, to, mode, rate, min, days]
            );
            res.json({ success: true, message: 'Rate added' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    app.delete('/api/company/pricing/:pid', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            await pool.query(`DELETE FROM pricing_rates WHERE id=$1 AND company_id=$2`, [req.params.pid, id]);
            res.json({ success: true, message: 'Rate removed' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    // ── 7. Customers (Aggregated from Shipments) ──────────────
    app.get('/api/company/customers', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`
                SELECT u.id, u.name, u.email, 
                       COUNT(s.id) as shipment_count,
                       MAX(s.created_at) as last_shipment,
                       SUM(s.estimated_cost) as total_value
                FROM shipments s
                JOIN users u ON s.customer_id = u.id
                WHERE s.company_id = $1
                GROUP BY u.id, u.name, u.email
                ORDER BY last_shipment DESC
            `, [id]);
            res.json({ success: true, customers: r.rows });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, message: 'Failed to fetch customers' });
        }
    });

    // ── 8. Tracking Updates ──────────────────────────────────
    app.post('/api/company/tracking/update', ...auth, async (req, res) => {
        const { shipmentId, status, location, notes } = req.body;
        const id = cid(req);
        try {
            // Robustly extract numeric ID (handles SS-47, PA-47, or just 47)
            const sid = parseInt(String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId);
            if (isNaN(sid)) return res.status(400).json({ success: false, message: 'Invalid Shipment ID' });

            const allowedTrackingStatuses = ['Cargo Loaded', 'In Transit', 'Delivered'];
            if (!allowedTrackingStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Tracking status must be one of: ${allowedTrackingStatuses.join(', ')}`
                });
            }

            const shipmentR = await pool.query(
                `SELECT id, status, customer_id FROM shipments WHERE id = $1 AND company_id = $2`,
                [sid, id]
            );
            if (shipmentR.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Shipment not found in your company scope' });
            }

            const currentStatus = shipmentR.rows[0].status;
            if (status === 'Cargo Loaded' && currentStatus !== 'Confirmed') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot mark Cargo Loaded from "${currentStatus}". Confirm shipment first.`
                });
            }
            if (status === 'In Transit' && currentStatus !== 'Cargo Loaded') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot mark In Transit from "${currentStatus}".`
                });
            }
            if (status === 'Delivered' && currentStatus !== 'In Transit') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot mark Delivered from "${currentStatus}".`
                });
            }

            // Update shipment main status
            await pool.query(
                `UPDATE shipments SET status=$1, updated_at = NOW() WHERE id=$2 AND company_id=$3`,
                [status, sid, id]
            );

            // Add to journey/log
            const timestamp = new Date();
            await pool.query(
                `INSERT INTO tracking_logs (shipment_id, status, location_note, timestamp) VALUES ($1, $2, $3, $4)`,
                [sid, status, notes || `Updated to ${status} at ${location || '—'}`, timestamp]
            );
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [sid, status, notes || `Manager updated status to ${status}`, id]
            );

            // Fetch prefix for real-time and notifications
            const shipRes = await pool.query(`
                SELECT s.customer_id, UPPER(LEFT(u.email, 2)) as prefix 
                FROM shipments s 
                JOIN users u ON s.customer_id = u.id 
                WHERE s.id = $1`, [sid]);
            const prefix = shipRes.rows[0]?.prefix || 'SS';

            // Real-time broadcast
            if (io) {
                // To the shipment room (customer/tracking page)
                io.to(`shipment:${sid}`).emit('shipment:status_update', { shipmentId: sid, status, user_prefix: prefix });
                io.to(`shipment:${sid}`).emit('tracking_event', { shipmentId: sid, status, message: notes, timestamp, user_prefix: prefix });
                console.log(`📡 Company update broadcasted for ${prefix}-${sid}`);
            }

            res.json({ success: true, message: 'Tracking event recorded' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });

    // ── 9. Notifications ─────────────────────────────────────
    const notify = async (userId, title, message, type = 'info') => {
        try {
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`,
                [userId, title, message, type]
            );
        } catch (e) { console.error('Notification error:', e); }
    };

    app.get('/api/company/notifications', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(
                `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
                [id]
            );
            res.json({ success: true, notifications: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed' }); }
    });

    // ── 10. Documents (integrated) ───────────────────────────
    app.get('/api/company/documents', ...auth, async (req, res) => {
        const id = cid(req);
        try {
            const r = await pool.query(`
                SELECT d.*, u.name as uploader_name, s.id as shipment_ref, 
                       s.product_type as cargo_type, u2.name as customer_name,
                       UPPER(LEFT(u2.email, 2)) as user_prefix
                FROM documents d
                JOIN shipments s ON d.shipment_id = s.id
                LEFT JOIN users u ON d.user_id = u.id
                LEFT JOIN users u2 ON s.customer_id = u2.id
                WHERE s.company_id=$1
                ORDER BY d.uploaded_at DESC
            `, [id]);
            res.json({ success: true, documents: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch documents' }); }
    });

    // ── 11. Accept / Reject / Status ────────────────────────
    app.post('/api/company/bookings/accept', ...auth, async (req, res) => {
        return res.status(400).json({
            success: false,
            message: 'Legacy accept API is disabled. Use /api/v3/manager/allocate-ship for ship allocation workflow.'
        });
    });

    app.post('/api/company/bookings/reject', ...auth, async (req, res) => {
        const { shipmentId } = req.body;
        const id = cid(req);
        try {
            const sid = parseInt(String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId);
            if (isNaN(sid)) return res.status(400).json({ success: false, message: 'Invalid Shipment ID' });

            // Allow rejection if unassigned OR if already assigned to this company
            const result = await pool.query(
                `UPDATE shipments SET status='Declined', company_id=$1 
                 WHERE id=$2 AND (company_id IS NULL OR company_id=$1)
                 RETURNING customer_id`,
                [id, sid]
            );
            if (result.rowCount === 0) return res.status(403).json({ success: false, message: 'Unauthorized or already handled' });

            const customerId = result.rows[0]?.customer_id;
            
            // Fetch prefix
            const prefRes = await pool.query(`
                SELECT UPPER(LEFT(u.email, 2)) as prefix 
                FROM users u WHERE u.id = $1`, [customerId]);
            const prefix = prefRes.rows[0]?.prefix || 'SS';

            const comp = await pool.query('SELECT company_name FROM company_profiles WHERE user_id = $1', [id]);
            const cName = comp.rows[0]?.company_name || 'A logistics company';

            if (customerId) await notify(customerId, 'Booking Declined', `${cName} has declined your booking request ${prefix}-${sid}.`, 'error');
            await notify(id, 'Booking Declined', `You declined shipment request ${prefix}-${sid}.`, 'info');

            res.json({ success: true, message: 'Booking declined' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed' }); }
    });

    app.patch('/api/company/shipments/:id/status', ...auth, async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        const userId = cid(req);
        try {
            const sid = parseInt(String(id).includes('-') ? String(id).split('-').pop() : id);
            if (isNaN(sid)) return res.status(400).json({ success: false, message: 'Invalid Shipment ID' });

            const allowedStatuses = ['Confirmed', 'Cargo Loaded', 'In Transit', 'Delivered'];
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid manager status. Allowed: ${allowedStatuses.join(', ')}`
                });
            }

            const shipR = await pool.query(
                `SELECT id, status, customer_id FROM shipments WHERE id=$1 AND company_id=$2`,
                [sid, userId]
            );
            if (shipR.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Shipment not found in your company' });
            }

            const currentStatus = shipR.rows[0].status;
            if (currentStatus === status) {
                return res.json({ success: true, message: `Shipment already in status "${status}"` });
            }

            // Transition rules for a real logistics workflow.
            if (status === 'Confirmed') {
                if (currentStatus !== 'Cargo Ready') {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot confirm shipment from "${currentStatus}". Payment must be completed first.`
                    });
                }

                const docsR = await pool.query(
                    `SELECT
                        COUNT(*)::int AS total_docs,
                        COUNT(*) FILTER (WHERE status = 'Verified')::int AS verified_docs
                     FROM documents
                     WHERE shipment_id = $1`,
                    [sid]
                );
                const totalDocs = docsR.rows[0]?.total_docs || 0;
                const verifiedDocs = docsR.rows[0]?.verified_docs || 0;
                if (totalDocs <= 0 || verifiedDocs < totalDocs) {
                    return res.status(400).json({
                        success: false,
                        message: 'All uploaded documents must be verified before confirmation.'
                    });
                }
            }

            if (status === 'Cargo Loaded' && currentStatus !== 'Confirmed') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot set "Cargo Loaded" from "${currentStatus}". Confirm shipment first.`
                });
            }
            if (status === 'In Transit' && currentStatus !== 'Cargo Loaded') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot set "In Transit" from "${currentStatus}". Mark cargo loaded first.`
                });
            }
            if (status === 'Delivered' && currentStatus !== 'In Transit') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot set "Delivered" from "${currentStatus}". Shipment must be in transit.`
                });
            }

            await pool.query(
                `UPDATE shipments SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`,
                [status, sid, userId]
            );
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [sid, status, `Manager updated shipment status to "${status}".`, userId]
            );
            await pool.query(
                `INSERT INTO tracking_logs (shipment_id, status, location_note, timestamp)
                 VALUES ($1, $2, $3, NOW())`,
                [sid, status, `Status updated by company manager to ${status}`]
            );

            // Real-time broadcast
            if (io) {
                io.to(`shipment:${sid}`).emit('shipment:status_update', { shipmentId: sid, status });
            }

            if (shipR.rows[0]?.customer_id) {
                await notify(
                    shipR.rows[0].customer_id,
                    'Shipment Status Updated',
                    `Your shipment #${sid} status is now "${status}".`,
                    'info'
                );
            }

            res.json({ success: true, message: 'Shipment status updated' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to update' }); }
    });

    app.patch('/api/company/documents/:docId/verify', ...auth, async (req, res) => {
        const { status } = req.body;
        try {
            if (!['Verified', 'Rejected'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid document status' });
            }

            const companyId = cid(req);
            const docScope = await pool.query(
                `SELECT d.id, d.user_id, d.doc_name, d.shipment_id,
                        s.status AS shipment_status, s.customer_id
                 FROM documents d
                 JOIN shipments s ON s.id = d.shipment_id
                 WHERE d.id = $1 AND s.company_id = $2`,
                [req.params.docId, companyId]
            );
            if (docScope.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Document not found in your company scope' });
            }

            const docRes = await pool.query(
                `UPDATE documents SET status=$1 WHERE id=$2 RETURNING user_id, doc_name, shipment_id`,
                [status, req.params.docId]
            );
            
            if (docRes.rowCount > 0 && docRes.rows[0].user_id) {
                const doc = docRes.rows[0];
                const type = status === 'Verified' ? 'success' : 'error';
                
                const title = `Document ${status}`;
                const message = status === 'Verified'
                    ? `Your document "${doc.doc_name}" for Shipment #${doc.shipment_id || 'N/A'} has been physically verified as valid.`
                    : `Your document "${doc.doc_name}" for Shipment #${doc.shipment_id || 'N/A'} was rejected. Please log into your Document Center portal to re-upload.`;
                
                await notify(doc.user_id, title, message, type);

                // Workflow progression:
                // If all uploaded docs are verified and shipment is in docs stage, unlock payment.
                if (status === 'Verified') {
                    const summary = await pool.query(
                        `SELECT
                            COUNT(*)::int AS total_docs,
                            COUNT(*) FILTER (WHERE status = 'Verified')::int AS verified_docs
                         FROM documents
                         WHERE shipment_id = $1`,
                        [doc.shipment_id]
                    );
                    const totalDocs = summary.rows[0]?.total_docs || 0;
                    const verifiedDocs = summary.rows[0]?.verified_docs || 0;
                    const allVerified = totalDocs > 0 && verifiedDocs === totalDocs;
                    const currentShipmentStatus = docScope.rows[0]?.shipment_status;

                    if (allVerified && ['Ship Allocated', 'Documents Pending'].includes(currentShipmentStatus)) {
                        await pool.query(
                            `UPDATE shipments SET status = 'Payment Pending', updated_at = NOW() WHERE id = $1`,
                            [doc.shipment_id]
                        );
                        await pool.query(
                            `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                             VALUES ($1, 'Payment Pending', 'All documents verified. Payment unlocked for customer.', $2)`,
                            [doc.shipment_id, companyId]
                        );
                        await notify(
                            docScope.rows[0].customer_id,
                            'Documents Verified — Payment Unlocked',
                            `All required documents for shipment #${doc.shipment_id} are verified. You can now complete payment.`,
                            'success'
                        );
                    }
                } else {
                    // Rejected docs keep shipment in document stage until fixed.
                    await pool.query(
                        `UPDATE shipments
                         SET status = CASE WHEN status = 'Pending Manager Approval' THEN status ELSE 'Documents Pending' END,
                             updated_at = NOW()
                         WHERE id = $1`,
                        [doc.shipment_id]
                    );
                }

                // Real-time broadcast to the user
                if (io) {
                    io.to(`user:${doc.user_id}`).emit('notification', {
                        title, message, type, date: new Date()
                    });
                }
            }
            res.json({ success: true, message: `Document status set to ${status}` });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed' }); }
    });
};
