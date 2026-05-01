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
                SELECT i.*, COALESCE(i.issued_at, NOW()) as created_at, 'Paid' as status, s.origin_address, s.destination_address, s.status as shipment_status
                FROM invoices i
                JOIN shipments s ON i.shipment_id = s.id
                WHERE s.customer_id = $1
                ORDER BY i.issued_at DESC
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

        // Exchange rate: same as used in the dashboard (shipments.js)
        const USD_TO_INR = 84;

        try {
            // 1. Fetch Invoices with shipment estimated_cost for accurate INR values
            let invoices = [];
            try {
                const invRes = await pool.query(`
                    SELECT i.*, COALESCE(i.issued_at, NOW()) as created_at, 'Paid' as status, 
                           s.origin_address, s.destination_address, s.estimated_cost,
                           COALESCE(t.currency, 'USD') as currency
                    FROM invoices i 
                    JOIN shipments s ON i.shipment_id = s.id 
                    LEFT JOIN transactions t ON i.transaction_id = t.id
                    WHERE s.customer_id = $1 ORDER BY i.issued_at DESC`, [userId]);
                
                // Compute INR amount from the shipment's estimated_cost (same as dashboard)
                invoices = invRes.rows.map(inv => {
                    const baseCostUSD = parseFloat(inv.estimated_cost || inv.amount || 0);
                    const costINR = Math.round(baseCostUSD * USD_TO_INR);
                    const surcharge = Math.round(costINR * 0.08);
                    return {
                        ...inv,
                        amount_usd: parseFloat(inv.amount || 0),
                        amount: costINR + surcharge,  // Total INR (base + 8% surcharge, matching dashboard)
                        currency: 'INR'
                    };
                });
            } catch (e) {
                console.warn('Invoices query failed (table may not exist):', e.message);
            }

            // 2. Fetch Transactions (Payment History) - may not exist
            let transactions = [];
            try {
                const transRes = await pool.query(`
                    SELECT t.*, s.origin_address, s.destination_address, s.estimated_cost
                    FROM transactions t 
                    LEFT JOIN shipments s ON t.shipment_id = s.id 
                    WHERE t.customer_id = $1 ORDER BY t.created_at DESC`, [userId]);
                
                // Convert transaction amounts to INR using shipment's estimated_cost
                transactions = transRes.rows.map(t => {
                    const baseCostUSD = parseFloat(t.estimated_cost || t.amount || 0);
                    const costINR = Math.round(baseCostUSD * USD_TO_INR);
                    const surcharge = Math.round(costINR * 0.08);
                    return {
                        ...t,
                        amount_usd: parseFloat(t.amount || 0),
                        amount: costINR + surcharge,
                        currency: 'INR'
                    };
                });
            } catch (e) {
                console.warn('Transactions query failed (table may not exist):', e.message);
            }

            // 3. Fetch Disputes (Billing Support Tickets) - may not exist
            let disputes = 0;
            try {
                const dispRes = await pool.query(`
                    SELECT COUNT(*) as count FROM support_tickets 
                    WHERE user_id = $1 AND (subject ILIKE '%billing%' OR subject ILIKE '%finance%' OR subject ILIKE '%payment%')`, [userId]);
                disputes = parseInt(dispRes.rows[0]?.count || 0);
            } catch (e) {
                console.warn('Support tickets query failed (table may not exist):', e.message);
            }

            // Aggregate Summary (now in INR)
            let totalPaid = 0;
            let totalDue = 0;
            transactions.forEach(t => { if (t.status === 'Completed') totalPaid += parseFloat(t.amount || 0); });
            invoices.forEach(i => { if (i.status === 'Pending' || i.status === 'Overdue') totalDue += parseFloat(i.amount || 0); });

            // Generate Combined History Items
            const history = [
                ...invoices.map(i => ({ type: 'Invoice', date: i.created_at || i.issued_at, amount: i.amount, currency: 'INR', status: i.status || 'Paid', ref: `INV-${i.id}`, shipment_id: i.shipment_id, origin: i.origin_address, dest: i.destination_address })),
                ...transactions.map(t => ({ type: 'Payment', date: t.created_at, amount: t.amount, currency: 'INR', status: t.status, ref: `TXN-${t.id}`, shipment_id: t.shipment_id, origin: t.origin_address, dest: t.destination_address }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json({
                success: true,
                currency: 'INR',
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
