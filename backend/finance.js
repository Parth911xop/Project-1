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
                SELECT i.*, i.created_at as created_at, i.status, s.origin_address, s.destination_address, s.status as shipment_status
                FROM invoices i
                JOIN shipments s ON i.shipment_id = s.id
                WHERE i.user_id = $1
                ORDER BY i.created_at DESC
            `, [userId]);

            res.json({ success: true, invoices: result.rows });
        } catch (err) {
            console.error('Invoices fetch error:', err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // ── NEW: Comprehensive Financial Overview ───────────────────
    router.get('/overview', async (req, res) => {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        try {
            // 1. Fetch Invoices
            const invRes = await pool.query(`
                SELECT i.*, s.origin_address, s.destination_address 
                FROM invoices i 
                JOIN shipments s ON i.shipment_id = s.id 
                WHERE i.user_id = $1 ORDER BY i.created_at DESC`, [userId]);

            // 2. Fetch Transactions (Payment History)
            const transRes = await pool.query(`
                SELECT t.*, s.origin_address, s.destination_address 
                FROM transactions t 
                LEFT JOIN shipments s ON t.shipment_id = s.id 
                WHERE t.customer_id = $1 ORDER BY t.created_at DESC`, [userId]);

            // 3. Fetch Disputes (Billing Support Tickets)
            const dispRes = await pool.query(`
                SELECT COUNT(*) as count FROM support_tickets 
                WHERE user_id = $1 AND (subject ILIKE '%billing%' OR subject ILIKE '%finance%' OR subject ILIKE '%payment%')`, [userId]);

            // Aggregate Summary
            const invoices = invRes.rows;
            const transactions = transRes.rows;
            const disputes = parseInt(dispRes.rows[0]?.count || 0);

            let totalPaid = 0;
            let totalDue = 0;
            transactions.forEach(t => { if (t.status === 'Completed') totalPaid += parseFloat(t.amount || 0); });
            invoices.forEach(i => { if (i.status === 'Pending' || i.status === 'Overdue') totalDue += parseFloat(i.amount || 0); });

            // Generate Combined History Items
            const history = [
                ...invoices.map(i => ({ type: 'Invoice', date: i.created_at, amount: i.amount, status: i.status, ref: `INV-${i.id}`, shipment_id: i.shipment_id, origin: i.origin_address, dest: i.destination_address })),
                ...transactions.map(t => ({ type: 'Payment', date: t.created_at, amount: t.amount, status: t.status, ref: `TXN-${t.id}`, shipment_id: t.shipment_id, origin: t.origin_address, dest: t.destination_address }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json({
                success: true,
                summary: {
                    totalPaid,
                    totalDue,
                    invoiceCount: invoices.length,
                    disputeCount: disputes
                },
                invoices,
                transactions,
                history: history.slice(0, 20) // Latest 20 items
            });

        } catch (err) {
            console.error('Finance overview error:', err);
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
