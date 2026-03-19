const express = require('express');
const router = express.Router();

module.exports = function (pool) {

    // Create Support Ticket
    router.post('/create', async (req, res) => {
        const { shipmentId, issueType, description } = req.body;
        const userId = req.user.userId;

        try {
            // Clean shipment ID (if user entered SS-1023, take 1023)
            let sId = null;
            if (shipmentId) {
                const match = shipmentId.match(/\d+/);
                if (match) sId = parseInt(match[0]);
            }

            const r = await pool.query(
                'INSERT INTO support_tickets (user_id, shipment_id, issue_type, description, status, priority) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [userId, sId, issueType, description, 'Open', 'Medium']
            );

            res.json({
                success: true,
                message: 'Ticket created successfully',
                ticketId: `TKT-${r.rows[0].id}`
            });

        } catch (e) {
            console.error('Support ticket error:', e);
            res.status(500).json({ success: false, message: 'Failed to create support ticket' });
        }
    });

    // Get My Tickets
    router.get('/my-tickets', async (req, res) => {
        const userId = req.user.userId;
        try {
            const r = await pool.query(
                'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );
            res.json({ success: true, tickets: r.rows });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
        }
    });

    return router;
};
