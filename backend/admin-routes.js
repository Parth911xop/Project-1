// admin-routes.js — All admin API endpoints
module.exports = function registerAdminRoutes(app, pool, authenticateToken, authorizeRole, createNotification, io) {

    // ── Global Config / Settings ──────────────────────────────
    app.get('/api/admin/settings', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query("SELECT value FROM system_settings WHERE key = 'global_config'");
            res.json({ success: true, settings: r.rows[0]?.value || {} });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch settings' }); }
    });

    app.post('/api/admin/settings', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            await pool.query(
                "INSERT INTO system_settings (key, value, updated_at) VALUES ('global_config', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
                [req.body]
            );
            res.json({ success: true, message: 'Settings saved to database' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to save settings' }); }
    });

    // ── User Management ───────────────────────────────────────
    app.get('/api/admin/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        console.log("👥 [ADMIN] Fetching user list...");
        try {
            const r = await pool.query('SELECT id, name, email, role, company_status, created_at FROM users ORDER BY created_at DESC');
            console.log(`✅ [ADMIN] Found ${r.rows.length} users`);
            res.json({ success: true, users: r.rows });
        } catch (e) {
            console.error("❌ [ADMIN] Error fetching users:", e);
            res.status(500).json({ success: false, message: 'Internal Server Error: Failed to fetch user data' });
        }
    });

    app.patch('/api/admin/users/:id/block', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const status = req.body.block ? 'blocked' : 'approved';
            await pool.query('UPDATE users SET company_status = $1 WHERE id = $2', [status, req.params.id]);
            res.json({ success: true, message: req.body.block ? 'User blocked' : 'User unblocked' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to update user' }); }
    });

    app.delete('/api/admin/users/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
            res.json({ success: true, message: 'User deleted' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to delete user' }); }
    });

    app.patch('/api/admin/users/:id/role', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            await pool.query('UPDATE users SET role = $1 WHERE id = $2', [req.body.role, req.params.id]);
            res.json({ success: true, message: `Role updated to ${req.body.role}` });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to update role' }); }
    });

    // ── Company Management ────────────────────────────────────
    app.get('/api/admin/companies', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT u.id, u.name, u.email, u.company_status, cp.company_name, cp.created_at, cp.documents_url
                 FROM users u LEFT JOIN company_profiles cp ON u.id = cp.user_id
                 WHERE u.role = 'company' ORDER BY cp.created_at DESC NULLS LAST`
            );
            res.json({ success: true, companies: r.rows });
        } catch (p) { res.status(500).json({ success: false, message: 'Failed to fetch companies' }); }
    });

    // ── Shipment Management ───────────────────────────────────
    app.get('/api/admin/shipments', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT s.*, u.name as customer_name, u.email as customer_email,
                        UPPER(LEFT(u.email, 2)) as user_prefix
                 FROM shipments s LEFT JOIN users u ON s.customer_id = u.id
                 ORDER BY s.created_at DESC`
            );
            res.json({ success: true, shipments: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch shipments' }); }
    });

    app.patch('/api/admin/shipments/:id/status', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        try {
            // Robustly extract numeric ID (handles SS-47, PA-47, or just 47)
            const numericId = parseInt(String(id).includes('-') ? String(id).split('-').pop() : id);
            
            if (isNaN(numericId)) {
                return res.status(400).json({ success: false, message: 'Invalid Shipment ID' });
            }

            // Fetch prefix for real-time and notifications
            const shipRes = await pool.query(`
                SELECT s.customer_id, UPPER(LEFT(u.email, 2)) as prefix 
                FROM shipments s 
                JOIN users u ON s.customer_id = u.id 
                WHERE s.id = $1`, [numericId]);
            const prefix = shipRes.rows[0]?.prefix || 'SS';

            await pool.query('UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2', [status, numericId]);
            
            // Broadcast real-time update
            if (io) {
                io.to(`shipment:${numericId}`).emit('shipment:status_update', { shipmentId: numericId, status, user_prefix: prefix });
                console.log(`📡 Broadcasted Admin update for shipment ${prefix}-${numericId}`);
            }

            // Notify Customer
            if (shipRes.rows.length > 0) {
                await createNotification(
                    shipRes.rows[0].customer_id,
                    'SHIPMENT_UPDATE',
                    'Admin Update',
                    `Your shipment #${prefix}-${numericId} was updated to: ${status}`,
                    `/shipments.html`
                );
            }

            // Sync with tracking logs for the live map
            await pool.query(
                `INSERT INTO tracking_logs (shipment_id, status, location_note)
                 VALUES ($1, $2, $3)`,
                [numericId, status, `Status manually updated to ${status} by Admin`]
            ).catch(err => console.error("Tracking log sync error:", err));

            res.json({ success: true, message: 'Status updated successfully' });
        } catch (e) { 
            console.error("Admin Status Update Error:", e);
            res.status(500).json({ success: false, message: 'Failed to update status: ' + e.message }); 
        }
    });

    // ── Port & Route Management ────────────────────────────────
    app.get('/api/admin/ports', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT *, state,
                       handling_fees_per_kg as cost_per_cbm,
                       (CASE WHEN congestion_index < 1.3 THEN 'Low' WHEN congestion_index < 1.7 THEN 'Medium' ELSE 'High' END) as congestion
                FROM ports ORDER BY country ASC, state ASC, name ASC
            `);
            res.json({ success: true, ports: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch ports' }); }
    });

    // Public port list for User/Company selection
    app.get('/api/ports', async (req, res) => {
        try {
            const r = await pool.query('SELECT name, country, state, code FROM ports ORDER BY country, state, name');
            res.json({ success: true, ports: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch ports' }); }
    });

    app.post('/api/admin/ports', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        const { name, country, state, code, congestion, cost_per_cbm, latitude, longitude } = req.body;
        try {
            const index = congestion === 'High' ? 2.0 : congestion === 'Medium' ? 1.5 : 1.0;
            await pool.query(
                'INSERT INTO ports (name, country, state, code, congestion_index, handling_fees_per_kg, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [name, country, state, code, index, cost_per_cbm, latitude, longitude]
                // Note: handling_days is not in V2 schema but kept for compatibility if needed.
            );
            io.emit('ports_updated');
            res.json({ success: true, message: 'Port added' });
        } catch (e) { 
            console.error("Add Port Error:", e);
            res.status(500).json({ success: false, message: 'Failed to add port: ' + e.message }); 
        }
    });

    app.delete('/api/admin/ports/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            await pool.query('DELETE FROM ports WHERE id = $1', [req.params.id]);
            io.emit('ports_updated');
            res.json({ success: true, message: 'Port deleted' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to delete port' }); }
    });

    app.get('/api/admin/routes', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT r.*, p1.name as from_port, p2.name as to_port,
                       r.origin_port_id as from_port_id, r.dest_port_id as to_port_id,
                       r.lead_time_days as duration_days, r.base_cost_per_kg as base_price_per_cbm
                FROM routes r
                JOIN ports p1 ON r.origin_port_id = p1.id
                JOIN ports p2 ON r.dest_port_id = p2.id
                ORDER BY r.id DESC
            `);
            res.json({ success: true, routes: r.rows });
        } catch (e) { 
            console.error("Fetch Routes Error:", e);
            res.status(500).json({ success: false, message: 'Failed to fetch routes' }); 
        }
    });

    app.post('/api/admin/routes', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        const { 
            from_port_id, to_port_id, mode, duration_days, base_price_per_cbm,
            carrier_name, distance_km, co2_per_kg, is_fastest, is_cheapest 
        } = req.body;
        try {
            await pool.query(
                `INSERT INTO routes 
                 (origin_port_id, dest_port_id, mode, lead_time_days, base_cost_per_kg, 
                  carrier_name, distance_km, co2_per_kg, is_fastest, is_cheapest) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    from_port_id, to_port_id, mode, duration_days, base_price_per_cbm,
                    carrier_name || '', parseFloat(distance_km) || 0, parseFloat(co2_per_kg) || 0,
                    !!is_fastest, !!is_cheapest
                ]
            );
            res.json({ success: true, message: 'Route added' });
        } catch (e) { 
            console.error("Add Route Error:", e);
            res.status(500).json({ success: false, message: 'Failed to add route' }); 
        }
    });

    app.delete('/api/admin/routes/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            await pool.query('DELETE FROM routes WHERE id = $1', [req.params.id]);
            res.json({ success: true, message: 'Route deleted' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to delete route' }); }
    });

    // ── Support Tickets ───────────────────────────────────────
    app.get('/api/admin/tickets', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT t.*, u.name as user_name, u.email as user_email,
                        UPPER(LEFT(u2.email, 2)) as user_prefix
                 FROM support_tickets t 
                 JOIN users u ON t.user_id = u.id
                 LEFT JOIN shipments s ON t.shipment_id = s.id
                 LEFT JOIN users u2 ON s.customer_id = u2.id
                 ORDER BY t.created_at DESC`
            );
            res.json({ success: true, tickets: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch tickets' }); }
    });

    app.patch('/api/admin/tickets/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        const { status, priority } = req.body;
        try {
            await pool.query(
                'UPDATE support_tickets SET status = $1, priority = $2, updated_at = NOW() WHERE id = $3',
                [status, priority, req.params.id]
            );
            res.json({ success: true, message: 'Ticket updated' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to update ticket' }); }
    });

    // ── Document Verification ─────────────────────────────────
    app.get('/api/admin/documents', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT d.*, u.name as uploader_name, u.email as uploader_email, 
                        s.id as shipment_ref, UPPER(LEFT(u2.email, 2)) as user_prefix
                 FROM documents d 
                 LEFT JOIN users u ON d.user_id = u.id
                 LEFT JOIN shipments s ON d.shipment_id = s.id
                 LEFT JOIN users u2 ON s.customer_id = u2.id
                 ORDER BY d.uploaded_at DESC`
            );
            res.json({ success: true, documents: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch documents' }); }
    });

    app.patch('/api/admin/documents/:id/status', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            await pool.query('UPDATE documents SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
            res.json({ success: true, message: `Document set to ${req.body.status}` });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to update document' }); }
    });

    // ── Stats ─────────────────────────────────────────────────
    app.get('/api/admin/stats/detailed', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const [usersR, companiesR, activeR, deliveredR, docsR, ticketsR, pendingR] = await Promise.all([
                pool.query('SELECT COUNT(*) as count FROM users'),
                pool.query("SELECT COUNT(*) as count FROM users WHERE role='company'"),
                pool.query("SELECT COUNT(*) as count FROM shipments WHERE status NOT IN ('Delivered','Cancelled','Declined')"),
                pool.query("SELECT COUNT(*) as count FROM shipments WHERE status='Delivered'"),
                pool.query("SELECT COUNT(*) as count FROM documents WHERE status='Pending' OR status='Submitted'"),
                pool.query("SELECT COUNT(*) as count FROM support_tickets WHERE status='Open'"),
                pool.query("SELECT COUNT(*) as count FROM shipments WHERE status='Booked' AND company_id IS NULL")
            ]);
            const revenueR = await pool.query("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE status='Completed'").catch(() => ({ rows: [{ total: 0 }] }));

            const monthlyR = await pool.query(`
                SELECT TO_CHAR(created_at,'Mon') as month, EXTRACT(MONTH FROM created_at) as month_num, 
                       COUNT(*) as count, COALESCE(SUM(estimated_cost),0) as revenue
                FROM shipments WHERE created_at >= NOW() - INTERVAL '6 months'
                GROUP BY month, month_num ORDER BY month_num
            `).catch(() => ({ rows: [] }));

            const statusR = await pool.query(`
                SELECT status, COUNT(*) as count FROM shipments GROUP BY status
            `).catch(() => ({ rows: [] }));

            const modesR = await pool.query(`
                SELECT COALESCE(mode, 'Sea') as mode, COUNT(*) as count FROM shipments GROUP BY mode
            `).catch(() => ({ rows: [] }));

            const topRoutesR = await pool.query(`
                SELECT SUBSTRING(origin_address FROM 1 FOR 20) || ' → ' || SUBSTRING(destination_address FROM 1 FOR 20) as route, 
                       COUNT(*) as count, SUM(estimated_cost) as revenue
                FROM shipments
                GROUP BY route
                ORDER BY count DESC
                LIMIT 5
            `).catch(() => ({ rows: [] }));

            const customerActivityR = await pool.query(`
                SELECT u.name as customer, COUNT(s.id) as shipments, SUM(s.estimated_cost) as spent
                FROM users u JOIN shipments s ON u.id = s.customer_id
                GROUP BY u.name
                ORDER BY shipments DESC
                LIMIT 5
            `).catch(() => ({ rows: [] }));

            const exportR = await pool.query("SELECT COUNT(*) as count FROM shipments WHERE LOWER(type) = 'export'").catch(() => ({ rows: [{ count: 0 }] }));
            const importR = await pool.query("SELECT COUNT(*) as count FROM shipments WHERE LOWER(type) = 'import'").catch(() => ({ rows: [{ count: 0 }] }));

            res.json({
                success: true,
                users: usersR.rows[0].count,
                companies: companiesR.rows[0].count,
                activeShipments: activeR.rows[0].count,
                delivered: deliveredR.rows[0].count,
                pendingDocs: docsR.rows[0].count,
                pendingBookings: pendingR.rows[0].count,
                openTickets: ticketsR.rows[0].count,
                revenue: parseFloat(revenueR.rows[0].total),
                monthly: monthlyR.rows,
                statusDist: statusR.rows,
                modes: modesR.rows,
                topRoutes: topRoutesR.rows,
                customerActivity: customerActivityR.rows,
                exports: exportR.rows[0].count,
                imports: importR.rows[0].count
            });
        } catch (e) {
            console.error('Stats error:', e);
            res.status(500).json({ success: false, message: 'Failed to fetch stats' });
        }
    });

    // ── Recent Shipments ──────────────────────────────────────
    app.get('/api/admin/recent-shipments', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT s.id, u.name as customer_name, s.origin_address, s.destination_address, s.status, s.estimated_cost, s.created_at
                FROM shipments s LEFT JOIN users u ON s.customer_id = u.id
                ORDER BY s.created_at DESC LIMIT 10
            `);
            res.json({ success: true, shipments: r.rows });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch recent shipments' }); }
    });

    // ── System Logs ───────────────────────────────────────────
    app.get('/api/admin/logs', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT tl.shipment_id, tl.status as stage, tl.location_note as description, 
                       tl.timestamp as updated_at, u.name as user_name,
                       UPPER(LEFT(u.email, 2)) as user_prefix
                FROM tracking_logs tl
                JOIN shipments s ON tl.shipment_id = s.id
                JOIN users u ON s.customer_id = u.id
                ORDER BY tl.timestamp DESC LIMIT 50
            `);
            res.json({ success: true, logs: r.rows });
        } catch (e) { 
            console.error("Fetch Logs Error:", e);
            res.status(500).json({ success: false, message: 'Failed to fetch logs' }); 
        }
    });

    // ── Tracking Update ───────────────────────────────────────
    app.post('/api/admin/tracking/update', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        const { shipmentId, status, location, notes } = req.body;
        try {
            const numericId = parseInt(String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId);
            
            if (isNaN(numericId)) {
                return res.status(400).json({ success: false, message: 'Invalid Shipment ID' });
            }

            // Update status
            await pool.query('UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2', [status, numericId]);
            
            // Add journey log (using tracking_logs table which exists with correct schema)
            await pool.query(
                `INSERT INTO tracking_logs (shipment_id, status, location_note, timestamp) 
                 VALUES ($1, $2, $3, NOW())`,
                [numericId, status, notes || `Update: ${status} at ${location || 'unknown location'}`]
            );

            // Fetch prefix for broadcast
            const shipRes = await pool.query(`
                SELECT UPPER(LEFT(u.email, 2)) as prefix 
                FROM shipments s 
                JOIN users u ON s.customer_id = u.id 
                WHERE s.id = $1`, [numericId]);
            const prefix = shipRes.rows[0]?.prefix || 'SS';

            // Broadcast
            if (io) {
                io.to(`shipment:${numericId}`).emit('shipment:status_update', { 
                    shipmentId: numericId, 
                    status, 
                    user_prefix: prefix,
                    message: notes || `Shipment is now ${status}`
                });
            }

            res.json({ success: true, message: `Tracking updated for ${prefix}-${numericId}` });
        } catch (e) { 
            console.error("Admin Tracking Update Error:", e);
            res.status(500).json({ success: false, message: 'Failed to update tracking' }); 
        }
    });

    // ── Notifications / Broadcast ─────────────────────────────
    app.post('/api/admin/notify', authenticateToken, authorizeRole(['admin']), async (req, res) => {
        const { title, message, type, userId } = req.body;
        try {
            if (userId) {
                // Targeted notification
                await createNotification(userId, type || 'SYSTEM', title, message);
            } else {
                // Broadcast: simply store in settings as before
                await pool.query(
                    "INSERT INTO system_settings (key, value, updated_at) VALUES ('latest_broadcast', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
                    [{ title, message, type, date: new Date() }]
                );
            }
            res.json({ success: true, message: userId ? 'Notification sent to user' : 'Broadcast notification sent' });
        } catch (e) { res.status(500).json({ success: false, message: 'Failed' }); }
    });
};
