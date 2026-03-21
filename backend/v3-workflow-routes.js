/**
 * V3 Workflow Routes — Ship Allocation, Route Management, Receipt Generation, Tracking API
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Mounted AFTER the existing company/admin routes. Adds the gated workflow endpoints.
 */
module.exports = function registerV3WorkflowRoutes(app, pool, authenticateToken, authorizeRole, createNotification, io) {
    const companyAuth = [authenticateToken, authorizeRole(['company'])];
    const adminAuth = [authenticateToken, authorizeRole(['admin'])];
    const anyAuth = [authenticateToken];

    // Helper – get user ID from JWT
    const uid = req => req.user?.userId;

    // Helper - create notification safely
    const notify = async (userId, title, message, type = 'info') => {
        try {
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`,
                [userId, title, message, type]
            );
        } catch (e) { console.error('Notification error:', e.message); }
    };

    // ═══════════════════════════════════════════════════════════
    // MODULE 2: Manager — Booking Requests (Pending Manager Approval)
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/manager/booking-requests
     * Returns all shipments with status "Pending Manager Approval"
     */
    app.get('/api/v3/manager/booking-requests', ...companyAuth, async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT s.*, u.name as customer_name, u.email as customer_email,
                       UPPER(LEFT(u.email, 2)) as user_prefix,
                       s.source_port, s.destination_port, s.preferred_shipping_date,
                       s.volume_cbm, s.weight_kg, s.product_type as cargo_type
                FROM shipments s 
                LEFT JOIN users u ON s.customer_id = u.id
                WHERE s.status = 'Pending Manager Approval'
                ORDER BY s.created_at DESC
            `);
            res.json({ success: true, requests: r.rows });
        } catch (e) {
            console.error('Booking requests error:', e);
            res.status(500).json({ success: false, message: 'Failed to fetch booking requests' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 2: Manager — Available Ships
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/manager/ships/available
     * Returns ships with capacity, optionally filtered by location/cargo type
     */
    app.get('/api/v3/manager/ships/available', ...companyAuth, async (req, res) => {
        const companyId = uid(req);
        const { nearPort, cargoType } = req.query;

        try {
            let query = `
                SELECT v.*, 
                       (v.container_slots - v.used_slots) as available_slots,
                       v.current_port, v.cargo_types
                FROM vehicles v
                WHERE v.company_id = $1 AND v.status = 'Available'
                AND v.container_slots > v.used_slots
            `;
            const params = [companyId];

            // Filter by proximity if port specified
            if (nearPort) {
                query += ` AND (LOWER(v.current_port) LIKE $${params.length + 1} OR LOWER(v.location) LIKE $${params.length + 1})`;
                params.push(`%${nearPort.toLowerCase()}%`);
            }

            query += ` ORDER BY (v.container_slots - v.used_slots) DESC`;

            const r = await pool.query(query, params);

            // Also get route stops for each ship
            const ships = await Promise.all(r.rows.map(async ship => {
                const stops = await pool.query(
                    `SELECT * FROM ship_route_stops WHERE ship_id = $1 ORDER BY stop_order ASC`,
                    [ship.id]
                );
                return { ...ship, route_stops: stops.rows };
            }));

            res.json({ success: true, ships });
        } catch (e) {
            console.error('Available ships error:', e);
            res.status(500).json({ success: false, message: 'Failed to fetch ships' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 3: Manager — Allocate Ship to Booking
    // ═══════════════════════════════════════════════════════════

    /**
     * POST /api/v3/manager/allocate-ship
     * Assigns a ship to a booking, changes status to "Ship Allocated"
     * This unlocks document upload and payment for the user.
     */
    app.post('/api/v3/manager/allocate-ship', ...companyAuth, async (req, res) => {
        const { shipmentId, shipId, departureDate, arrivalDate, cargoDropPort, notes } = req.body;
        const managerId = uid(req);

        if (!shipmentId || !shipId) {
            return res.status(400).json({ success: false, message: 'Shipment ID and Ship ID are required' });
        }

        try {
            // Parse numeric ID
            const sid = parseInt(String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId);
            if (isNaN(sid)) return res.status(400).json({ success: false, message: 'Invalid Shipment ID' });

            // Verify shipment is pending
            const shipCheck = await pool.query(
                `SELECT * FROM shipments WHERE id = $1 AND status = 'Pending Manager Approval'`,
                [sid]
            );
            if (shipCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'Shipment not found or not pending approval' });
            }

            // Verify ship has capacity
            const vehicleCheck = await pool.query(
                `SELECT * FROM vehicles WHERE id = $1 AND company_id = $2`,
                [shipId, managerId]
            );
            if (vehicleCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'Ship not found or not owned by your company' });
            }

            const ship = vehicleCheck.rows[0];
            if ((ship.used_slots || 0) >= (ship.container_slots || 100)) {
                return res.status(400).json({ success: false, message: 'Ship has no available slots' });
            }

            // Allocate the ship
            await pool.query(`
                UPDATE shipments SET 
                    status = 'Ship Allocated',
                    allocated_ship_id = $1,
                    company_id = $2,
                    vehicle_type = $3,
                    cargo_drop_port = $4,
                    manager_notes = $5,
                    estimated_departure = $6,
                    estimated_arrival = $7,
                    allocated_at = NOW(),
                    updated_at = NOW()
                WHERE id = $8
            `, [
                shipId, managerId, ship.name || ship.type,
                cargoDropPort || null, notes || null,
                departureDate || null, arrivalDate || null,
                sid
            ]);

            // Increment used slots on the ship
            await pool.query(
                `UPDATE vehicles SET used_slots = used_slots + 1 WHERE id = $1`,
                [shipId]
            );

            // Log event
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, 'Ship Allocated', $2, $3)`,
                [sid, `Ship "${ship.name || ship.type}" allocated. ${notes || ''}`, managerId]
            );

            // Notify the customer
            const customerId = shipCheck.rows[0].customer_id;
            const prefRes = await pool.query(`SELECT UPPER(LEFT(email, 2)) as prefix FROM users WHERE id = $1`, [customerId]);
            const prefix = prefRes.rows[0]?.prefix || 'SS';

            await notify(
                customerId,
                'Ship Allocated — Upload Documents & Pay',
                `Your shipment ${prefix}-${sid} has been allocated to vessel "${ship.name || ship.type}". You can now upload documents and complete payment.`,
                'success'
            );

            // Real-time broadcast
            if (io) {
                io.to(`shipment:${sid}`).emit('shipment:status_update', {
                    shipmentId: sid, status: 'Ship Allocated', user_prefix: prefix,
                    message: `Ship "${ship.name}" allocated`
                });
            }

            res.json({
                success: true,
                message: 'Ship allocated successfully. User can now upload documents and pay.',
                shipName: ship.name || ship.type
            });
        } catch (e) {
            console.error('Ship allocation error:', e);
            res.status(500).json({ success: false, message: 'Failed to allocate ship: ' + e.message });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 4: Gated Document Upload Check
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/shipment/:id/can-upload
     * Returns whether documents can be uploaded for this shipment
     */
    app.get('/api/v3/shipment/:id/can-upload', ...anyAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const sid = parseInt(String(id).includes('-') ? String(id).split('-').pop() : id);
            const r = await pool.query(
                `SELECT status, allocated_ship_id, customer_id, company_id FROM shipments WHERE id = $1`,
                [sid]
            );
            if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });

            const requesterId = uid(req);
            const requesterRole = req.user?.role;
            const shipment = r.rows[0];
            if (requesterRole === 'customer' && Number(shipment.customer_id) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }
            if (requesterRole === 'company' && Number(shipment.company_id || 0) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }

            const status = shipment.status;
            const hasAllocation = !!shipment.allocated_ship_id;
            const uploadUnlockedStatuses = [
                'Ship Allocated',
                'Documents Pending',
                'Payment Pending',
                'Cargo Ready',
                'Confirmed',
                'Cargo Loaded',
                'In Transit',
                'Delivered'
            ];
            const canUpload = hasAllocation && uploadUnlockedStatuses.includes(status);
            const canPay = hasAllocation && ['Ship Allocated', 'Documents Pending', 'Payment Pending'].includes(status);

            res.json({
                success: true,
                canUpload,
                canPay,
                status,
                shipAllocated: hasAllocation,
                message: canUpload ? 'Documents are enabled.' : 'Waiting for manager to allocate a ship.'
            });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Check failed' });
        }
    });

    /**
     * GET /api/v3/shipment/:id/can-pay
     * Returns whether payment can be processed
     */
    app.get('/api/v3/shipment/:id/can-pay', ...anyAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const sid = parseInt(String(id).includes('-') ? String(id).split('-').pop() : id);
            const r = await pool.query(
                `SELECT status, allocated_ship_id, customer_id, company_id FROM shipments WHERE id = $1`,
                [sid]
            );
            if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });

            const requesterId = uid(req);
            const requesterRole = req.user?.role;
            const shipment = r.rows[0];
            if (requesterRole === 'customer' && Number(shipment.customer_id) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }
            if (requesterRole === 'company' && Number(shipment.company_id || 0) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }

            const status = shipment.status;
            const canPay = !!shipment.allocated_ship_id
                && ['Ship Allocated', 'Documents Pending', 'Payment Pending'].includes(status);

            res.json({
                success: true,
                canPay,
                status,
                message: canPay ? 'Payment is enabled.' : status === 'Pending Manager Approval'
                    ? 'Payment locked: Waiting for ship allocation.'
                    : 'Payment not applicable for current status.'
            });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Check failed' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 4: Payment Receipt Generation & Download
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/payment/receipt/:shipmentId
     * Returns receipt data for client-side PDF generation
     */
    app.get('/api/v3/payment/receipt/:shipmentId', ...anyAuth, async (req, res) => {
        const { shipmentId } = req.params;
        try {
            const sid = parseInt(String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId);

            // Get shipment + transaction data
            const r = await pool.query(`
                SELECT s.*, t.id as transaction_id, t.amount, t.stripe_charge_id as payment_ref,
                       t.currency as tx_currency, t.created_at as payment_date, t.status as payment_status,
                       u.name as customer_name, u.email as customer_email,
                       UPPER(LEFT(u.email, 2)) as user_prefix,
                       v.name as ship_name, v.type as ship_type
                FROM shipments s
                LEFT JOIN transactions t ON t.shipment_id = s.id AND t.status = 'Completed'
                LEFT JOIN users u ON s.customer_id = u.id
                LEFT JOIN vehicles v ON s.allocated_ship_id = v.id
                WHERE s.id = $1
                ORDER BY t.created_at DESC
                LIMIT 1
            `, [sid]);

            if (r.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Shipment not found' });
            }

            const data = r.rows[0];
            const requesterId = uid(req);
            const requesterRole = req.user?.role;
            if (requesterRole === 'customer' && Number(data.customer_id) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }
            if (requesterRole === 'company' && Number(data.company_id || 0) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }

            const receipt = {
                bookingId: `${data.user_prefix || 'SS'}-BKG-${sid}`,
                shipmentId: sid,
                customerName: data.customer_name,
                customerEmail: data.customer_email,
                shipName: data.ship_name || data.vehicle_type || 'N/A',
                shipType: data.ship_type || 'Cargo Vessel',
                cargoDetails: {
                    type: data.product_type || data.type || 'General',
                    weight: data.weight_kg,
                    volume: data.volume_cbm,
                    origin: data.origin_address || data.source_port,
                    destination: data.destination_address || data.destination_port,
                    cargoDropPort: data.cargo_drop_port || data.destination_port
                },
                paymentAmount: parseFloat(data.amount || data.estimated_cost || 0),
                currency: data.tx_currency || data.currency || 'USD',
                transactionId: data.payment_ref || 'N/A',
                paymentStatus: data.payment_status || 'Pending',
                paymentDate: data.payment_date || null,
                receiptDate: new Date().toISOString(),
                status: data.status
            };

            res.json({ success: true, receipt });
        } catch (e) {
            console.error('Receipt generation error:', e);
            res.status(500).json({ success: false, message: 'Failed to generate receipt' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 5: Ship Route & Port Stop Management
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/manager/ship/:shipId/route
     * Returns the multi-stop route for a ship
     */
    app.get('/api/v3/manager/ship/:shipId/route', ...companyAuth, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT * FROM ship_route_stops WHERE ship_id = $1 ORDER BY stop_order ASC`,
                [req.params.shipId]
            );
            res.json({ success: true, stops: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch route' });
        }
    });

    /**
     * POST /api/v3/manager/ship/:shipId/route
     * Define or replace the route stops for a ship
     * Body: { stops: [{ port_name, port_code, stop_order, estimated_arrival, estimated_departure, lat, lng }] }
     */
    app.post('/api/v3/manager/ship/:shipId/route', ...companyAuth, async (req, res) => {
        const { shipId } = req.params;
        const { stops } = req.body;
        const managerId = uid(req);

        if (!stops || !Array.isArray(stops) || stops.length === 0) {
            return res.status(400).json({ success: false, message: 'Route stops array is required' });
        }

        try {
            // Verify ownership
            const check = await pool.query(`SELECT id FROM vehicles WHERE id = $1 AND company_id = $2`, [shipId, managerId]);
            if (check.rows.length === 0) return res.status(403).json({ success: false, message: 'Ship not found or unauthorized' });

            // Clear existing stops
            await pool.query(`DELETE FROM ship_route_stops WHERE ship_id = $1`, [shipId]);

            // Insert new stops
            for (const stop of stops) {
                await pool.query(`
                    INSERT INTO ship_route_stops (ship_id, port_name, port_code, stop_order, estimated_arrival, estimated_departure, lat, lng)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    shipId,
                    stop.port_name,
                    stop.port_code || null,
                    stop.stop_order,
                    stop.estimated_arrival || null,
                    stop.estimated_departure || null,
                    stop.lat || null,
                    stop.lng || null
                ]);
            }

            res.json({ success: true, message: `Route with ${stops.length} stops saved for ship #${shipId}` });
        } catch (e) {
            console.error('Route save error:', e);
            res.status(500).json({ success: false, message: 'Failed to save route' });
        }
    });

    /**
     * POST /api/v3/manager/shipment/:id/drop-port
     * Set the cargo drop-off port for a specific shipment
     */
    app.post('/api/v3/manager/shipment/:id/drop-port', ...companyAuth, async (req, res) => {
        const { dropPort } = req.body;
        try {
            await pool.query(
                `UPDATE shipments SET cargo_drop_port = $1, updated_at = NOW() WHERE id = $2`,
                [dropPort, req.params.id]
            );
            res.json({ success: true, message: 'Cargo drop port set' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 6 & 7: Live Ship Tracking
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/tracking/live/:shipmentId
     * Returns live ship position (API-backed or simulated for dev)
     */
    app.get('/api/v3/tracking/live/:shipmentId', ...anyAuth, async (req, res) => {
        const sid = parseInt(req.params.shipmentId);
        try {
            // Get shipment + allocated ship data
            const r = await pool.query(`
                SELECT s.*, v.name as ship_name, v.mmsi, v.imo_number,
                       v.current_lat, v.current_lng, v.current_port,
                       s.source_port, s.destination_port, s.cargo_drop_port,
                       UPPER(LEFT(u.email, 2)) as user_prefix
                FROM shipments s
                LEFT JOIN vehicles v ON s.allocated_ship_id = v.id
                LEFT JOIN users u ON s.customer_id = u.id
                WHERE s.id = $1
            `, [sid]);

            if (r.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Shipment not found' });
            }

            const data = r.rows[0];
            const requesterId = uid(req);
            const requesterRole = req.user?.role;
            if (requesterRole === 'customer' && Number(data.customer_id) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }
            if (requesterRole === 'company' && Number(data.company_id || 0) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }

            // Get route stops
            const stopsR = await pool.query(
                `SELECT * FROM ship_route_stops WHERE ship_id = $1 ORDER BY stop_order ASC`,
                [data.allocated_ship_id]
            );

            // Get latest tracking log
            const logR = await pool.query(
                `SELECT * FROM tracking_logs WHERE shipment_id = $1 ORDER BY timestamp DESC LIMIT 1`,
                [sid]
            );

            // Simulated live position (for dev without real API key)
            let livePosition = null;
            if (data.current_lat && data.current_lng) {
                livePosition = { lat: parseFloat(data.current_lat), lng: parseFloat(data.current_lng) };
            } else if (logR.rows.length > 0 && logR.rows[0].lat) {
                livePosition = { lat: parseFloat(logR.rows[0].lat), lng: parseFloat(logR.rows[0].lng) };
            } else {
                // Generate simulated position based on route progress
                livePosition = simulatePosition(data, stopsR.rows);
            }

            // Calculate progress
            const statusOrder = [
                'Pending Manager Approval',
                'Ship Allocated',
                'Documents Pending',
                'Payment Pending',
                'Cargo Ready',
                'Confirmed',
                'Cargo Loaded',
                'In Transit',
                'Delivered'
            ];
            const currentIdx = statusOrder.indexOf(data.status);
            const progress = Math.max(0, Math.min(100, Math.round((currentIdx / (statusOrder.length - 1)) * 100)));

            // ETA
            let eta = 'TBD';
            if (data.estimated_arrival) {
                const arrival = new Date(data.estimated_arrival);
                const now = new Date();
                const daysLeft = Math.max(0, Math.ceil((arrival - now) / 86400000));
                eta = `${daysLeft} days (${arrival.toLocaleDateString()})`;
            }

            res.json({
                success: true,
                tracking: {
                    shipmentId: sid,
                    bookingRef: `${data.user_prefix || 'SS'}-${sid}`,
                    shipName: data.ship_name || data.vehicle_type || 'TBD',
                    mmsi: data.mmsi,
                    imoNumber: data.imo_number,
                    status: data.status,
                    progress,
                    eta,
                    currentPort: data.current_port || logR.rows[0]?.location_note || 'At Sea',
                    livePosition,
                    route: {
                        origin: data.source_port || data.origin_address,
                        destination: data.destination_port || data.destination_address,
                        cargoDropPort: data.cargo_drop_port
                    },
                    routeStops: stopsR.rows,
                    lastUpdate: logR.rows[0]?.timestamp || data.updated_at,
                    cargo: {
                        type: data.product_type || 'General',
                        weight: data.weight_kg,
                        volume: data.volume_cbm
                    }
                }
            });
        } catch (e) {
            console.error('Live tracking error:', e);
            res.status(500).json({ success: false, message: 'Failed to get tracking data' });
        }
    });

    /**
     * Simulate ship position for development mode
     * Interpolates between route stops based on time
     */
    function simulatePosition(shipment, stops) {
        if (stops.length >= 2) {
            const now = Date.now();
            const dep = new Date(shipment.estimated_departure || shipment.created_at).getTime();
            const arr = new Date(shipment.estimated_arrival || Date.now() + 86400000 * 20).getTime();
            const progress = Math.min(1, Math.max(0, (now - dep) / (arr - dep)));

            // Find which segment we're on
            const segIdx = Math.min(Math.floor(progress * (stops.length - 1)), stops.length - 2);
            const segProgress = (progress * (stops.length - 1)) - segIdx;

            const fromStop = stops[segIdx];
            const toStop = stops[segIdx + 1];

            if (fromStop.lat && toStop.lat) {
                return {
                    lat: parseFloat(fromStop.lat) + (parseFloat(toStop.lat) - parseFloat(fromStop.lat)) * segProgress,
                    lng: parseFloat(fromStop.lng) + (parseFloat(toStop.lng) - parseFloat(fromStop.lng)) * segProgress
                };
            }
        }

        // Fallback: random Indian Ocean / Arabian Sea position
        const seed = (shipment.id || 1) * 137;
        return {
            lat: 15 + ((seed % 20) - 10),
            lng: 60 + ((seed % 40) - 20)
        };
    }

    /**
     * GET /api/v3/tracking/all-ships
     * Returns positions of all active ships (for admin/manager live map)
     */
    app.get('/api/v3/tracking/all-ships', ...anyAuth, async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT v.id, v.name, v.type, v.current_lat, v.current_lng, v.current_port,
                       v.mmsi, v.imo_number, v.container_slots, v.used_slots, v.status,
                       v.company_id, cp.company_name,
                       COUNT(s.id) as active_shipments
                FROM vehicles v
                LEFT JOIN company_profiles cp ON v.company_id = cp.user_id
                LEFT JOIN shipments s ON s.allocated_ship_id = v.id AND s.status IN ('In Transit', 'Ship Allocated', 'Accepted')
                WHERE v.status = 'Available' OR v.status = 'Active'
                GROUP BY v.id, v.name, v.type, v.current_lat, v.current_lng, v.current_port,
                         v.mmsi, v.imo_number, v.container_slots, v.used_slots, v.status,
                         v.company_id, cp.company_name
                ORDER BY v.name
            `);
            res.json({ success: true, ships: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch ship positions' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 8: System Status Endpoints
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/dashboard/user-stats
     * User-specific dashboard stats with gated workflow status breakdown
     */
    app.get('/api/v3/dashboard/user-stats', ...anyAuth, async (req, res) => {
        const userId = uid(req);
        try {
            const [totalR, pendingR, allocatedR, transitR, deliveredR] = await Promise.all([
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE customer_id = $1`, [userId]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE customer_id = $1 AND status = 'Pending Manager Approval'`, [userId]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE customer_id = $1 AND status = 'Ship Allocated'`, [userId]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE customer_id = $1 AND status IN ('Confirmed', 'Cargo Loaded', 'In Transit')`, [userId]),
                pool.query(`SELECT COUNT(*) as count FROM shipments WHERE customer_id = $1 AND status = 'Delivered'`, [userId])
            ]);

            res.json({
                success: true,
                stats: {
                    total: parseInt(totalR.rows[0].count),
                    pendingApproval: parseInt(pendingR.rows[0].count),
                    shipAllocated: parseInt(allocatedR.rows[0].count),
                    inTransit: parseInt(transitR.rows[0].count),
                    delivered: parseInt(deliveredR.rows[0].count)
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch stats' });
        }
    });

    /**
     * POST /api/v3/manager/update-status-after-payment
     * Called after successful payment to update to 'Cargo Ready'
     */
    app.post('/api/v3/shipment/:id/payment-complete', ...anyAuth, async (req, res) => {
        const sid = parseInt(req.params.id);
        try {
            const shipR = await pool.query(
                `SELECT id, customer_id, company_id, status, allocated_ship_id
                 FROM shipments
                 WHERE id = $1`,
                [sid]
            );
            if (shipR.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Shipment not found' });
            }

            const shipment = shipR.rows[0];
            const requesterId = uid(req);
            const requesterRole = req.user?.role;

            // Only customer-owner or admin can complete payment action.
            if (requesterRole === 'customer' && Number(shipment.customer_id) !== Number(requesterId)) {
                return res.status(403).json({ success: false, message: 'Unauthorized shipment access' });
            }
            if (requesterRole === 'company') {
                return res.status(403).json({ success: false, message: 'Company managers cannot complete customer payment' });
            }

            const payableStatuses = ['Ship Allocated', 'Documents Pending', 'Payment Pending'];
            if (!shipment.allocated_ship_id || !payableStatuses.includes(shipment.status)) {
                return res.status(400).json({
                    success: false,
                    message: shipment.status === 'Pending Manager Approval'
                        ? 'Payment is locked until a manager allocates a ship.'
                        : `Payment is not available for status "${shipment.status}".`
                });
            }

            // Simple sequencing guard: at least one document should be uploaded before payment completes.
            const docCheck = await pool.query(
                `SELECT COUNT(*)::int AS count FROM documents WHERE shipment_id = $1`,
                [sid]
            );
            if ((docCheck.rows[0]?.count || 0) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Upload required shipment documents before completing payment.'
                });
            }

            await pool.query(
                `UPDATE shipments SET status = 'Cargo Ready', updated_at = NOW() WHERE id = $1`,
                [sid]
            );
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by) VALUES ($1, 'Cargo Ready', 'Payment completed. Cargo ready for loading.', $2)`,
                [sid, uid(req)]
            );

            // Notify manager
            if (shipment.company_id) {
                await notify(
                    shipment.company_id,
                    'Payment Received — Cargo Ready',
                    `Payment for shipment #${sid} has been completed. Cargo is ready for loading.`,
                    'success'
                );
            }

            res.json({ success: true, message: 'Status updated to Cargo Ready' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to update status' });
        }
    });

    /**
     * POST /api/v3/manager/ship/:shipId/mark-current-stop
     * Updates ship position to a specific stop's coordinates
     */
    app.post('/api/v3/manager/ship/:shipId/mark-current-stop', ...companyAuth, async (req, res) => {
        const { shipId } = req.params;
        const { stopId } = req.body;
        const managerId = uid(req);

        try {
            // Get stop details
            const stopR = await pool.query(`SELECT * FROM ship_route_stops WHERE id = $1 AND ship_id = $2`, [stopId, shipId]);
            if (stopR.rows.length === 0) return res.status(404).json({ success: false, message: 'Stop not found' });
            
            const stop = stopR.rows[0];

            // Update ship location
            await pool.query(
                `UPDATE vehicles SET current_port = $1, current_lat = $2, current_lng = $3, updated_at = NOW() WHERE id = $4 AND company_id = $5`,
                [stop.port_name, stop.lat, stop.lng, shipId, managerId]
            );

            // Notify all shipments on this ship
            const shipmentsR = await pool.query(`SELECT id FROM shipments WHERE allocated_ship_id = $1`, [shipId]);
            for (const s of shipmentsR.rows) {
                if (io) {
                    io.to(`shipment:${s.id}`).emit('shipment:status_update', {
                        shipmentId: s.id,
                        status: 'In Transit',
                        message: `Vessel has arrived at ${stop.port_name}`
                    });
                }
            }

            res.json({ success: true, message: `Ship marked at ${stop.port_name}` });
        } catch (e) {
            console.error('Mark stop error:', e);
            res.status(500).json({ success: false, message: 'Update failed' });
        }
    });

    console.log('✅ V3 Workflow routes loaded (Ship Allocation, Route Management, Tracking, Receipts)');
};
