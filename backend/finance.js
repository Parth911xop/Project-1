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

    // Get all invoices for a user
    router.get('/all', async (req, res) => {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, message: "User ID required" });

        try {
            const query = `
                SELECT i.*, s.from_country, s.to_country 
                FROM invoices i
                LEFT JOIN shipments s ON i.shipment_id = s.id
                WHERE i.user_id = $1
                ORDER BY i.created_at DESC
            `;
            const result = await pool.query(query, [userId]);

            // Calculate summary stats
            const summary = {
                totalDue: 0,
                overdue: 0,
                openCount: 0,
                disputeCount: 0 // Placeholder
            };

            result.rows.forEach(inv => {
                if (inv.status === 'Pending' || inv.status === 'Overdue') {
                    summary.totalDue += parseFloat(inv.amount);
                    summary.openCount++;
                }
                if (inv.status === 'Overdue') {
                    summary.overdue += parseFloat(inv.amount);
                }
            });

            res.json({ success: true, invoices: result.rows, summary });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database error" });
        }
    });

    // Create a generic invoice (Internal/Mock use)
    router.post('/create', async (req, res) => {
        const { userId, shipmentId, amount, dueDate } = req.body;

        try {
            // Generate Invoice Number
            const rand = Math.floor(1000 + Math.random() * 9000);
            const invNum = `INV-2026-${rand}`;

            await pool.query(
                `INSERT INTO invoices (user_id, shipment_id, invoice_number, amount, due_date, status)
                 VALUES ($1, $2, $3, $4, $5, 'Pending')`,
                [userId, shipmentId, invNum, amount, dueDate]
            );

            res.json({ success: true, message: "Invoice created" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Error creating invoice" });
        }
    });

    // Pay Invoice
    router.post('/pay', async (req, res) => {
        const { invoiceId } = req.body;
        try {
            await pool.query("UPDATE invoices SET status = 'Paid' WHERE id = $1", [invoiceId]);
            res.json({ success: true, message: "Invoice marked as paid" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Payment failed" });
        }
    });

    return router;
};
