const express = require('express');
const router = express.Router();

module.exports = function (pool) {

    // Create Support Ticket
    router.post('/create', async (req, res) => {
        const { shipmentId, issueType, description } = req.body;
        const userId = req.user.userId;

        try {
            // --- NEW: ROBUST SHIPMENT LOOKUP ---
            let sId = null;
            let companyId = null;

            if (shipmentId) {
                // 1. Try finding by ID if it's numeric
                const numericId = String(shipmentId).match(/\d+/);
                const potentialId = numericId ? parseInt(numericId[0]) : null;

                // 2. Search by ID OR tracking_number
                const shipSearch = await pool.query(
                    'SELECT id, company_id FROM shipments WHERE id = $1 OR tracking_number = $2 LIMIT 1',
                    [potentialId || -1, String(shipmentId)]
                );

                if (shipSearch.rows.length > 0) {
                    sId = shipSearch.rows[0].id;
                    companyId = shipSearch.rows[0].company_id;
                }
            }

            const r = await pool.query(
                'INSERT INTO support_tickets (user_id, shipment_id, company_id, issue_type, description, status, priority) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [userId, sId, companyId, issueType, description, 'Open', 'Medium']
            );

            const ticketId = r.rows[0].id;

            // --- NOTIFY COMPANY ---
            if (companyId) {
                // Fetch company email/prefix for notification if needed, but let's just notify the ID
                const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
                const userName = userRes.rows[0]?.name || 'A customer';

                const notify = async (targetId, title, message, type = 'info') => {
                    try {
                        await pool.query(
                            `INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`,
                            [targetId, title, message, type]
                        );
                    } catch (err) { console.error('Notification error:', err); }
                };

                const refText = sId ? `shipment #${sId}` : 'general inquiry';
                await notify(
                    companyId,
                    `Support Ticket: ${issueType}`,
                    `${userName} raised a ticket for ${refText}. Please check the Partner Desk.`,
                    'warning'
                );
            }

            res.json({
                success: true,
                message: 'Ticket created successfully',
                ticketId: `TKT-${ticketId}`
            });

        } catch (e) {
            console.error('Support ticket error:', e);
            res.status(500).json({ success: false, message: 'Failed to create support ticket' });
        }
    });

    // Get My Tickets (Customer View)
    router.get('/my-tickets', async (req, res) => {
        const userId = req.user.userId;
        try {
            const r = await pool.query(
                `SELECT t.*, s.tracking_number 
                 FROM support_tickets t 
                 LEFT JOIN shipments s ON t.shipment_id = s.id
                 WHERE t.user_id = $1 
                 ORDER BY t.created_at DESC`,
                [userId]
            );
            res.json({ success: true, tickets: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
        }
    });

    // Get Company Support Tickets (Partner View)
    router.get('/company-tickets', async (req, res) => {
        const companyId = req.user.userId;
        try {
            const r = await pool.query(
                `SELECT t.*, u.name as customer_name, u.email as customer_email, 
                        s.tracking_number, s.source_port, s.destination_port
                 FROM support_tickets t
                 JOIN users u ON t.user_id = u.id
                 LEFT JOIN shipments s ON t.shipment_id = s.id
                 WHERE t.company_id = $1
                 ORDER BY t.created_at DESC`,
                [companyId]
            );
            res.json({ success: true, tickets: r.rows });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, message: 'Failed to fetch company tickets' });
        }
    });

    // Update Ticket Status (Company/Admin)
    router.patch('/ticket/:id/status', async (req, res) => {
        const { status } = req.body;
        const ticketId = req.params.id;
        const managerId = req.user.userId;

        try {
            await pool.query(
                'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
                [status, ticketId]
            );

            // Log if needed, or notify user
            res.json({ success: true, message: `Ticket status updated to ${status}` });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Update failed' });
        }
    });

    return router;
};
