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
                WHERE s.status IN ('Pending Manager Approval', 'Booked')
                ORDER BY s.created_at DESC
            `);
            res.json({ success: true, requests: r.rows });
        } catch (e) {
            console.error('Booking requests error:', e);
            res.status(500).json({ success: false, message: 'Failed to fetch booking requests' });
        }
    });


    // ═══════════════════════════════════════════════════════════
    // MODULE 2: Manager — Available Ships (Smart Route Matching)
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/manager/ships/available
     * Returns ships with capacity, filtered by sequence-matching routes
     */
    app.get('/api/v3/manager/ships/available', ...companyAuth, async (req, res) => {
        const companyId = uid(req);
        const { nearPort, cargoType, fromPort, toPort } = req.query;

        try {
            let query = `
                SELECT v.*, 
                       (v.container_slots - v.used_slots) as available_slots,
                       v.current_port, v.cargo_types
                FROM vehicles v
                WHERE v.company_id = $1 AND v.status IN ('Available', 'Active')
                AND v.container_slots > v.used_slots
            `;
            const params = [companyId];

            const shipResult = await pool.query(query, params);
            let ships = shipResult.rows;

            ships = await Promise.all(ships.map(async ship => {
                const stopsR = await pool.query(
                    `SELECT * FROM ship_route_stops WHERE ship_id = $1 ORDER BY stop_order ASC`,
                    [ship.id]
                );
                const stops = stopsR.rows;
                
                let isMatch = true;
                let matchScore = 0;

                if (fromPort && toPort) {
                    const fromIdx = stops.findIndex(s => s.port_name.toLowerCase().includes(fromPort.toLowerCase()));
                    const toIdx = stops.findIndex(s => s.port_name.toLowerCase().includes(toPort.toLowerCase()));
                    
                    if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
                        isMatch = true;
                        matchScore = 100;
                    } else {
                        isMatch = false;
                    }
                } else if (nearPort) {
                    const hasPort = stops.some(s => s.port_name.toLowerCase().includes(nearPort.toLowerCase()));
                    if (!hasPort && !ship.current_port?.toLowerCase().includes(nearPort.toLowerCase())) {
                        isMatch = false;
                    }
                }

                return { ...ship, route_stops: stops, isMatch, matchScore };
            }));

            // Remove hard filter so we can show "❌ Wrong Cases" to manager
            // if (fromPort && toPort) ships = ships.filter(s => s.isMatch);

            res.json({ success: true, ships: ships.sort((a,b) => {
                if (a.isMatch !== b.isMatch) return a.isMatch ? -1 : 1;
                return b.matchScore - a.matchScore;
            }) });
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
        let { shipmentId, shipId, departureDate, arrivalDate, cargoDropPort, notes, docs, quotes } = req.body;
        
        // Ensure empty strings don't break TIMESTAMP columns
        departureDate = departureDate || null;
        arrivalDate = arrivalDate || null;
        cargoDropPort = cargoDropPort || null;
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
                    requested_documents = $8,
                    allocated_at = NOW(),
                    updated_at = NOW()
                WHERE id = $9
            `, [
                shipId, managerId, ship.name || ship.type,
                cargoDropPort || null, notes || null,
                departureDate || null, arrivalDate || null,
                JSON.stringify(docs || ["Government ID", "Commercial Invoice", "Packing List"]),
                sid
            ]);

            // Clear then Insert Quote Options if provided
            if (quotes && Array.isArray(quotes)) {
                await pool.query(`DELETE FROM shipment_quote_options WHERE shipment_id = $1`, [sid]);
                for (const q of quotes) {
                    await pool.query(`
                        INSERT INTO shipment_quote_options (shipment_id, option_name, price, vessel_id, transit_time)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [sid, q.name, q.price, shipId, q.transitTime || 'Standard']);
                }
            }

            // Increment used slots on the ship
            await pool.query(
                `UPDATE vehicles SET used_slots = used_slots + 1 WHERE id = $1`,
                [shipId]
            );

            // --- AUTO-GENERATE SYSTEM DOCUMENTS ---
            const docTypes = [
                { type: 'Invoice', name: `INV-${sid}-${Date.now()}.pdf` },
                { type: 'Shipping Label', name: `LABEL-${sid}.pdf` },
                { type: 'Tracking Slip', name: `TRACK-${sid}.pdf` }
            ];

            for (const doc of docTypes) {
                await pool.query(
                    `INSERT INTO documents (user_id, shipment_id, type, doc_name, file_url, status)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [managerId, sid, doc.type, doc.name, '#', 'Verified']
                );
            }

            // --- AUTO-GENERATE INVOICE IN FINANCE ---
            const amount = parseFloat(shipCheck.rows[0].estimated_cost || 500);
            await pool.query(
                `INSERT INTO invoices (user_id, shipment_id, invoice_number, amount, status, due_date)
                 VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
                [customerId, sid, `INV-${sid}-${Date.now().toString().slice(-4)}`, amount, 'Pending']
            );

            // Log event
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, 'Ship Allocated', $2, $3)`,
                [sid, `Ship "${ship.name || ship.type}" allocated. System documents generated. ${notes || ''}`, managerId]
            );

            // Notify the customer
            const prefRes = await pool.query(`SELECT UPPER(LEFT(email, 2)) as prefix FROM users WHERE id = $1`, [customerId]);
            const prefix = prefRes.rows[0]?.prefix || 'SS';

            await notify(
                customerId,
                'Ship Allocated — Documents Ready',
                `Your shipment ${prefix}-${sid} has been allocated to vessel "${ship.name || ship.type}". Invoice and Shipping Label are now available in your Documents tab.`,
                'success'
            );

            // Real-time broadcast
            if (io) {
                io.to(`shipment:${sid}`).emit('shipment:status_update', {
                    shipmentId: sid, status: 'Ship Allocated', user_prefix: prefix,
                    message: `Ship "${ship.name}" allocated. Documents generated.`
                });
            }

            res.json({
                success: true,
                message: 'Ship allocated successfully. System documents and invoice generated.',
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

    /**
     * GET /api/v3/shipment/:id/quotes
     * Returns a list of quote options for this shipment
     */
    app.get('/api/v3/shipment/:id/quotes', ...anyAuth, async (req, res) => {
        try {
            const sid = parseInt(req.params.id);
            const r = await pool.query(
                `SELECT * FROM shipment_quote_options WHERE shipment_id = $1 ORDER BY id ASC`,
                [sid]
            );
            res.json({ success: true, quotes: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch quotes' });
        }
    });

    /**
     * POST /api/v3/shipment/:id/select-quote
     * User selects a quote, updates shipment's estimated cost
     */
    app.post('/api/v3/shipment/:id/select-quote', ...anyAuth, async (req, res) => {
        const sid = parseInt(req.params.id);
        const { quoteId } = req.body;
        if (!quoteId) return res.status(400).json({ success: false, message: 'Quote ID is required' });

        try {
            // Find the quote
            const qResult = await pool.query(
                `SELECT * FROM shipment_quote_options WHERE id = $1 AND shipment_id = $2`,
                [quoteId, sid]
            );
            if (qResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Quote not found' });
            
            const quote = qResult.rows[0];

            await pool.query('BEGIN');
            
            // Mark as selected in quotes table
            await pool.query(
                `UPDATE shipment_quote_options SET is_selected = FALSE WHERE shipment_id = $1`,
                [sid]
            );
            await pool.query(
                `UPDATE shipment_quote_options SET is_selected = TRUE WHERE id = $1`,
                [quoteId]
            );

            // Update shipment with selected quote price and transit time
            await pool.query(`
                UPDATE shipments 
                SET estimated_cost = $1, 
                    transit_time = $2, 
                    selected_quote_id = $3,
                    updated_at = NOW() 
                WHERE id = $4
            `, [quote.price, quote.transit_time, quoteId, sid]);

            await pool.query('COMMIT');
            res.json({ success: true, message: `Option "${quote.option_name}" selected. Cost updated to ₹${Number(quote.price).toLocaleString()}.` });
        } catch (e) {
            await pool.query('ROLLBACK');
            res.status(500).json({ success: false, message: 'Failed to select option' });
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
                    routeStops: filterStops(stopsR.rows, data.source_port, data.cargo_drop_port || data.destination_port),
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
     * Helper to filter global ship route stops into the shipment's specific journey segment
     * (Source -> Drop Port)
     */
    function filterStops(allStops, source, drop) {
        if (!source || !drop || allStops.length === 0) return allStops;
        const s = source.toLowerCase();
        const d = drop.toLowerCase();
        
        let startIdx = allStops.findIndex(st => st.port_name.toLowerCase().includes(s) || s.includes(st.port_name.toLowerCase()));
        let endIdx = allStops.findIndex(st => st.port_name.toLowerCase().includes(d) || d.includes(st.port_name.toLowerCase()));
        
        if (startIdx === -1) startIdx = 0;
        if (endIdx === -1) endIdx = allStops.length - 1;
        
        if (startIdx > endIdx) return allStops.slice(endIdx, startIdx + 1); // Reverse logic if needed
        return allStops.slice(startIdx, endIdx + 1);
    }

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
            
            // Mark invoice as paid
            await pool.query(
                `UPDATE invoices SET status = 'Paid' WHERE shipment_id = $1`,
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
     * Updates ship position to a specific stop AND cascades status to all assigned cargo.
     */
    app.post('/api/v3/manager/ship/:shipId/mark-current-stop', ...companyAuth, async (req, res) => {
        const { shipId } = req.params;
        const { stopId } = req.body;
        const managerId = uid(req);

        try {
            const stopR = await pool.query(`SELECT * FROM ship_route_stops WHERE id = $1 AND ship_id = $2`, [stopId, shipId]);
            if (stopR.rows.length === 0) return res.status(404).json({ success: false, message: 'Stop not found' });
            const stop = stopR.rows[0];

            await pool.query(
                `UPDATE vehicles SET current_port = $1, current_lat = $2, current_lng = $3, updated_at = NOW() WHERE id = $4 AND company_id = $5`,
                [stop.port_name, stop.lat, stop.lng, shipId, managerId]
            );

            // Cascade Status:
            // ORIGIN -> 'Cargo Loaded'
            await pool.query(`UPDATE shipments SET status = 'Cargo Loaded' WHERE allocated_ship_id = $1 AND (LOWER(source_port) LIKE LOWER($2) OR LOWER(origin_address) LIKE LOWER($2))`, [shipId, stop.port_name]);
            // DESTINATION -> 'Arrived'
            await pool.query(`UPDATE shipments SET status = 'Arrived' WHERE allocated_ship_id = $1 AND (LOWER(cargo_drop_port) LIKE LOWER($2) OR LOWER(destination_port) LIKE LOWER($2))`, [shipId, stop.port_name]);
            // OTHERS -> 'In Transit'
            await pool.query(`UPDATE shipments SET status = 'In Transit' WHERE allocated_ship_id = $1 AND status IN ('Cargo Loaded', 'At Port')`, [shipId]);

            res.json({ success: true, message: `Vessel reached ${stop.port_name}. Cargo sync complete.` });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Status cascade failed' });
        }
    });

    /**
     * GET /api/v3/manager/ship/:id/route
     * Returns voyage stops for a vessel
     */
    app.get('/api/v3/manager/ship/:id/route', ...companyAuth, async (req, res) => {
        try {
            const r = await pool.query(`SELECT * FROM ship_route_stops WHERE ship_id = $1 ORDER BY stop_order ASC`, [req.params.id]);
            res.json({ success: true, stops: r.rows });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    /**
     * POST /api/v3/manager/shipment/:id/integrated-accept
     * Atomic: Allocates Vessel + Adds 3 Quote Options + Sets Required Docs + Notifies User
     */
    app.post('/api/v3/manager/shipment/:id/integrated-accept', ...companyAuth, async (req, res) => {
        const sid = parseInt(req.params.id);
        const managerId = uid(req);
        let { shipId, cargoDropPort, departureDate, arrivalDate, docs, quotes } = req.body;

        // Robustify empty inputs for SQL compatibility
        departureDate = departureDate || null;
        arrivalDate = arrivalDate || null;
        cargoDropPort = cargoDropPort || null;

        console.log(`📡 Processing Integrated Accept for Shipment #${sid} (Manager: ${managerId})`);
        try {
            await pool.query('BEGIN');

            const rShip = await pool.query(`SELECT name, type FROM vehicles WHERE id = $1`, [shipId]);
            if (rShip.rows.length === 0) throw new Error('Vessel not found');
            const ship = rShip.rows[0];

            // 1. Core Allocation update
            await pool.query(`
                UPDATE shipments SET 
                    status = 'Ship Allocated',
                    allocated_ship_id = $1,
                    company_id = $2,
                    vehicle_type = $3,
                    cargo_drop_port = $4,
                    estimated_departure = $5,
                    estimated_arrival = $6,
                    requested_documents = $7,
                    allocated_at = NOW(),
                    updated_at = NOW()
                WHERE id = $8
            `, [shipId, managerId, ship.name || ship.type, cargoDropPort, departureDate, arrivalDate, JSON.stringify(docs), sid]);

            // 2. Clear then Insert the 3 Quote Options
            await pool.query(`DELETE FROM shipment_quote_options WHERE shipment_id = $1`, [sid]);
            for (const q of quotes) {
                await pool.query(`
                    INSERT INTO shipment_quote_options (shipment_id, option_name, price, vessel_id, transit_time)
                    VALUES ($1, $2, $3, $4, $5)
                `, [sid, q.name, q.price, shipId, q.transitTime || 'Standard']);
            }

            // 3. Notify & Broadcast with Deep Link for Step-by-Step Fulfillment
            const userR = await pool.query(`SELECT customer_id FROM shipments WHERE id = $1`, [sid]);
            const custId = userR.rows[0]?.customer_id || userR.rows[0]?.user_id;
            if (custId) {
                const link = `shipments.html?complete=${sid}`;
                await notify(custId, 'Action Required: Choose Service Level', 
                    `Your booking #${sid} is accepted. Please select your service (Economy/Standard/Express) and upload documents to lock in your price.`, 
                    'warning', link);
                
                if (io) {
                    io.to(`shipment:${sid}`).emit('shipment:status_update', {
                        shipmentId: sid,
                        status: 'Ship Allocated',
                        message: 'Your shipment has been accepted by manager. Please select service level.'
                    });
                }
            }

            await pool.query('COMMIT');
            res.json({ success: true, message: 'Shipment accepted with integrated quotes.' });
        } catch (e) {
            await pool.query('ROLLBACK');
            console.error('❌ Integrated Accept Error:', e.message);
            res.status(500).json({ success: false, message: 'Failed to process integrated acceptance: ' + e.message });
        }
    });

    /**
     * PATCH /api/company/shipment/:id/manage-logistics
     * Allows manager to re-assign vessel, update eta/etd, and current location
     */
    app.patch('/api/company/shipment/:id/manage-logistics', ...companyAuth, async (req, res) => {
        const sid = parseInt(req.params.id);
        const { shipId, departureDate, arrivalDate, location } = req.body;
        const managerId = uid(req);

        try {
            const shipNameRes = shipId ? await pool.query(`SELECT name FROM vehicles WHERE id = $1`, [shipId]) : { rows: [] };
            const shipName = shipNameRes.rows[0]?.name || null;

            await pool.query(`
                UPDATE shipments 
                SET allocated_ship_id = COALESCE($1, allocated_ship_id),
                    ship_name = COALESCE($2, ship_name),
                    estimated_departure = COALESCE($3, estimated_departure),
                    estimated_arrival = COALESCE($4, estimated_arrival),
                    current_port = COALESCE($5, current_port),
                    updated_at = NOW()
                WHERE id = $6 AND company_id = $7
            `, [shipId || null, shipName, departureDate || null, arrivalDate || null, location || null, sid, managerId]);

            res.json({ success: true, message: 'Logistics updated successfully' });
        } catch (e) {
            console.error('Logistics Update Error:', e);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // MODULE 3: User — Quoting & Fulfilment Wizard Handlers
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v3/shipment/:id/quotes
     * Returns the 3 service options + required docs for the user
     */
    app.get('/api/v3/shipment/:id/quotes', anyAuth, async (req, res) => {
        const sid = parseInt(req.params.id);
        try {
            const rQ = await pool.query(`SELECT * FROM shipment_quote_options WHERE shipment_id = $1`, [sid]);
            const rS = await pool.query(`SELECT requested_documents, selected_quote_id FROM shipments WHERE id = $1`, [sid]);
            
            if (rS.rows.length === 0) return res.status(404).json({ success: false, message: 'Shipment not found' });
            
            res.json({ 
                success: true, 
                quotes: rQ.rows, 
                docs: rS.rows[0].requested_documents || [],
                selectedId: rS.rows[0].selected_quote_id
            });
        } catch (e) {
            console.error('Fetch quotes error:', e.message);
            res.status(500).json({ success: false });
        }
    });

    /**
     * POST /api/v3/shipment/:id/select-quote
     * User picks their service level
     */
    app.post('/api/v3/shipment/:id/select-quote', anyAuth, async (req, res) => {
        const sid = parseInt(req.params.id);
        const { quoteId } = req.body;
        try {
            const rQ = await pool.query(`SELECT price FROM shipment_quote_options WHERE id = $1 AND shipment_id = $2`, [quoteId, sid]);
            if (rQ.rows.length === 0) throw new Error('Invalid quote selection');
            
            await pool.query(
                `UPDATE shipments SET selected_quote_id = $1, estimated_cost = $2, updated_at = NOW() WHERE id = $3`, 
                [quoteId, rQ.rows[0].price, sid]
            );
            res.json({ success: true, message: 'Service level selected' });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    console.log('✅ V3 Workflow routes loaded (Ship Allocation, Route Management, Tracking, Receipts, Vessel Route, Integrated Accept)');
};
