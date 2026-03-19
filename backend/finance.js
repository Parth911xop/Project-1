const express = require('express');
const router = express.Router();

// Initialize Invoices Table
const createInvoicesTable = async (pool) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                shipment_id INTEGER REFERENCES shipments(id),
                invoice_number VARCHAR(50) UNIQUE NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'USD',
                status VARCHAR(20) DEFAULT 'Pending', -- Pending, Paid, Overdue, Cancelled
                due_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'invoices' ready");
    } catch (err) {
        console.error("❌ Error creating 'invoices' table:", err);
    }
};

module.exports = (pool) => {
    // Initialize table
    createInvoicesTable(pool);

    // Get invoices for the currently authenticated user (JWT-based)
    router.get('/invoices', async (req, res) => {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        try {
            const result = await pool.query(`
                SELECT i.*, i.issued_at as created_at, 'Paid' as status, s.origin_address, s.destination_address, s.status as shipment_status
                FROM invoices i
                JOIN shipments s ON i.shipment_id = s.id
                WHERE s.customer_id = $1 OR s.company_id = $1
                ORDER BY i.issued_at DESC
            `, [userId]);

            const invoices = result.rows;
            const summary = { totalDue: 0, overdue: 0, openCount: 0, disputeCount: 0 };
            invoices.forEach(inv => {
                if (inv.status === 'Pending' || inv.status === 'Overdue') {
                    summary.totalDue += parseFloat(inv.amount || 0);
                    summary.openCount++;
                }
                if (inv.status === 'Overdue') {
                    summary.overdue += parseFloat(inv.amount || 0);
                }
            });

            res.json({ success: true, invoices, summary });
        } catch (err) {
            console.error('Invoices fetch error:', err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // Get all invoices for a user (legacy - replaced by /invoices)
    router.get('/all', async (req, res) => {
        res.status(400).json({ success: false, message: "Use /api/finance/invoices instead" });
    });

    // Create a generic invoice (Mock removed, use Stripe)
    router.post('/create', async (req, res) => {
        res.status(400).json({ success: false, message: "Use Stripe to generate real invoices" });
    });

    // Pay Invoice (Mock removed, use Stripe)
    router.post('/pay', async (req, res) => {
        res.json({ success: true, message: "Use Stripe checkout for real payments" });
    });

    return router;
};
