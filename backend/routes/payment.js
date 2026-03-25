const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { Pool } = require('pg');

const pool = {
    query: (...args) => global.dbPool.query(...args)
};

const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
const stripe = Stripe(stripeKey);

// Middleware to mock or require keys
function requireRealStripeKey(req, res, next) {
    if (stripeKey.includes('mock')) {
        console.warn('⚠️ STRIPE_SECRET_KEY is a mock. Payment bypass will be used or fail.');
    }
    next();
}

// Create Stripe Checkout Session
router.post('/create-checkout-session', express.json(), authenticateToken, authorizeRole(['customer', 'admin']), requireRealStripeKey, async (req, res) => {
    const { shipmentId } = req.body;
    const userId = req.user.userId;

    try {
        // 1. Verify Shipment Ownership & Get Cost
        const shipRes = await pool.query(
            "SELECT * FROM shipments WHERE id = $1 AND customer_id = $2",
            [shipmentId, userId]
        );

        if (shipRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Shipment not found or unauthorized." });
        }

        const shipment = shipRes.rows[0];

        // V3 Workflow: Payment gated behind ship allocation
        const payableStatuses = ['Ship Allocated', 'Details Pending', 'Documents Pending', 'Payment Pending'];
        if (!payableStatuses.includes(shipment.status)) {
            const msg = shipment.status === 'Pending Manager Approval'
                ? 'Payment locked: A manager must allocate a ship before payment.'
                : `Payment not available for shipments with status "${shipment.status}".`;
            return res.status(400).json({ success: false, message: msg });
        }

        const docsRes = await pool.query(
            "SELECT COUNT(*)::int AS count FROM documents WHERE shipment_id = $1",
            [shipment.id]
        );
        if ((docsRes.rows[0]?.count || 0) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Upload required shipment documents before starting payment.'
            });
        }

        const cost = parseFloat(shipment.estimated_cost);
        const dynamicOrigin = req.headers.origin || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3001}`;

        // MOCK INTERCEPTOR: If testing with mock keys, skip Stripe SDK to prevent crash
        if (stripeKey.toLowerCase().includes('mock')) {
            const mockSessionId = 'mock_sess_' + Date.now();
            await pool.query(
                "INSERT INTO transactions (shipment_id, customer_id, stripe_charge_id, amount, currency, status) VALUES ($1, $2, $3, $4, $5, 'Pending')",
                [shipment.id, userId, mockSessionId, cost, 'USD']
            );
            
            // Immediately simulate a successful checkout redirect
            return res.json({
                success: true,
                url: `${dynamicOrigin}/shipments.html?complete=${shipment.id}&session_id=${mockSessionId}`,
                sessionId: mockSessionId
            });
        }

        // 2. Create Stripe Checkout Session (for real environments)
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `Shipment #${shipment.id}`,
                        description: `Freight booking for ${shipment.product_type}`
                    },
                    unit_amount: Math.round(cost * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${dynamicOrigin}/shipments.html?complete=${shipment.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${dynamicOrigin}/shipments.html?payment_cancelled=true`,
            metadata: { shipmentId: shipment.id.toString(), userId: userId.toString() }
        });

        // 3. Create Pending Transaction ledger entry
        await pool.query(
            "INSERT INTO transactions (shipment_id, customer_id, stripe_charge_id, amount, currency, status) VALUES ($1, $2, $3, $4, $5, 'Pending')",
            [shipment.id, userId, session.id, cost, 'USD']
        );

        res.json({
            success: true,
            url: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).json({ success: false, message: "Internal server error during checkout. " + error.message });
    }
});

// Stripe Payment Verification
router.post('/verify-payment', express.json(), authenticateToken, async (req, res) => {
    const { sessionId, shipmentId } = req.body;

    try {
        let session;
        if (String(sessionId).startsWith('mock_sess_')) {
            session = {
                id: sessionId,
                payment_status: 'paid',
                payment_intent: 'mock_pi_' + Date.now()
            };
        } else {
            session = await stripe.checkout.sessions.retrieve(sessionId);
        }

        if (session.payment_status === 'paid') {
            // 1. Update Transaction to Completed
            const txRes = await pool.query(
                "UPDATE transactions SET status = 'Completed' WHERE stripe_charge_id = $1 RETURNING id",
                [session.id]
            );

            if (txRes.rows.length > 0) {
                const transactionId = txRes.rows[0].id;

                // 2. Update Shipment Status to Cargo Ready (V3 Workflow)
                await pool.query(
                    "UPDATE shipments SET status = 'Cargo Ready', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                    [shipmentId]
                );

                // Log the event
                await pool.query(
                    `INSERT INTO shipment_events (shipment_id, status, notes)
                     VALUES ($1, $2, $3)`,
                    [shipmentId, 'Cargo Ready', 'Payment verified via Stripe. Cargo ready for loading.']
                );

                // 3. Generate Auto-Invoice
                const invoiceNumber = `INV-${Date.now()}-${shipmentId}`;

                // Fetch the transaction amount to accurately record it
                const transRes = await pool.query("SELECT amount FROM transactions WHERE id = $1", [transactionId]);
                const amount = transRes.rows.length > 0 ? transRes.rows[0].amount : 0;

                await pool.query(
                    "INSERT INTO invoices (transaction_id, shipment_id, invoice_number, amount) VALUES ($1, $2, $3, $4)",
                    [transactionId, shipmentId, invoiceNumber, amount]
                );

                // 4. Generate Payment Receipt
                const shipData = await pool.query(
                    `SELECT s.*, v.name as ship_name, UPPER(LEFT(u.email, 2)) as prefix
                     FROM shipments s
                     LEFT JOIN vehicles v ON s.allocated_ship_id = v.id
                     LEFT JOIN users u ON s.customer_id = u.id
                     WHERE s.id = $1`, [shipmentId]
                );
                const sd = shipData.rows[0] || {};

                await pool.query(
                    `INSERT INTO payment_receipts (transaction_id, shipment_id, booking_id, ship_name, cargo_details, payment_amount, transaction_ref)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        transactionId,
                        shipmentId,
                        `${sd.prefix || 'SS'}-BKG-${shipmentId}`,
                        sd.ship_name || sd.vehicle_type || 'N/A',
                        JSON.stringify({ type: sd.product_type, weight: sd.weight_kg, origin: sd.origin_address, destination: sd.destination_address }),
                        amount,
                        session.payment_intent // Stripe specific ref
                    ]
                );

                console.log(`✅ Payment verified + receipt generated for Shipment ${shipmentId}`);
            }

            res.json({ success: true, message: 'Payment verified successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Stripe payment not completed.' });
        }
    } catch (err) {
        console.error("Database error during payment verification:", err);
        res.status(500).json({ success: false, message: 'Server error during payment verification' });
    }
});

module.exports = router;
