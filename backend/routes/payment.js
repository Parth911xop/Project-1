const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Guard: Detect missing Razorpay keys and fail fast with a clear message
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const isMockRzpKey = !RZP_KEY_ID || RZP_KEY_ID.includes('Mock') || !RZP_KEY_SECRET;

if (isMockRzpKey) {
    console.warn('⚠️  RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is a mock/placeholder. Payments will return 503 until real keys are set in .env');
}

let razorpayInstance;
if (!isMockRzpKey) {
    razorpayInstance = new Razorpay({
        key_id: RZP_KEY_ID,
        key_secret: RZP_KEY_SECRET,
    });
}

// Middleware to block payment endpoints when key is invalid
function requireRealRzpKey(req, res, next) {
    if (isMockRzpKey) {
        return res.status(503).json({
            success: false,
            message: 'Payment gateway not configured. Please add your real RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the backend .env file.',
            action: 'Set RAZORPAY_KEY_ID=rzp_test_... in /backend/.env and restart the server.'
        });
    }
    next();
}

// Create Razorpay Checkout Order
router.post('/create-checkout-session', express.json(), authenticateToken, authorizeRole(['customer', 'admin']), requireRealRzpKey, async (req, res) => {
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
        const payableStatuses = ['Ship Allocated', 'Documents Pending', 'Payment Pending'];
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

        // 2. Create Razorpay Order
        const options = {
            amount: Math.round(cost * 100), // Razorpay expects amount in paise (smallest currency unit)
            currency: 'INR', // Default to INR assuming India context
            receipt: `receipt_order_${shipment.id}`,
            notes: {
                shipmentId: shipment.id.toString(),
                userId: userId.toString()
            }
        };

        const rzpOrder = await razorpayInstance.orders.create(options);

        // 3. Create Pending Transaction ledger entry
        await pool.query(
            "INSERT INTO transactions (shipment_id, customer_id, stripe_charge_id, amount, currency, status) VALUES ($1, $2, $3, $4, $5, 'Pending')",
            [shipment.id, userId, rzpOrder.id, cost, 'INR']
        );

        res.json({
            success: true,
            orderId: rzpOrder.id,
            amount: options.amount,
            currency: options.currency,
            keyId: RZP_KEY_ID
        });

    } catch (error) {
        console.error("Razorpay Checkout Error:", error);
        res.status(500).json({ success: false, message: "Internal server error during checkout." });
    }
});

// Razorpay Payment Verification
router.post('/verify-payment', express.json(), async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, shipmentId } = req.body;

    try {
        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", RZP_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // 1. Update Transaction to Completed
            const txRes = await pool.query(
                "UPDATE transactions SET status = 'Completed', stripe_charge_id = $1 WHERE stripe_charge_id = $2 RETURNING id",
                [razorpay_payment_id, razorpay_order_id]
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
                    [shipmentId, 'Cargo Ready', 'Payment verified. Cargo ready for loading.']
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
                        razorpay_payment_id
                    ]
                );

                console.log(`✅ Payment verified + receipt generated for Shipment ${shipmentId}`);
            }

            res.json({ success: true, message: 'Payment verified successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }
    } catch (err) {
        console.error("Database error during payment verification:", err);
        res.status(500).json({ success: false, message: 'Server error during payment verification' });
    }
});

module.exports = router;
