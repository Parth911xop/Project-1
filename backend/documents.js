const express = require('express');
const router = express.Router();

let pool;

const createDocumentsTable = async (dbPool) => {
    pool = dbPool;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                shipment_id INTEGER REFERENCES shipments(id),
                type VARCHAR(50) NOT NULL,
                doc_name VARCHAR(255),
                file_url VARCHAR(255),
                status VARCHAR(20) DEFAULT 'Submitted',
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // --- Schema Synchronization & Migrations ---
        // 1. Rename doc_type to type if needed
        try { await pool.query(`ALTER TABLE documents RENAME COLUMN doc_type TO type;`); } catch(e) {}
        
        // 2. Add missing columns
        try { await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS type VARCHAR(50);`); } catch(e) {}
        try { await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_name VARCHAR(255);`); } catch(e) {}
        try { await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);`); } catch(e) {}
        
        // 3. Drop restrictive CHECK constraints from older versions (e.g. db-schema.sql)
        try { await pool.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;`); } catch(e) {}

        console.log("✅ Table 'documents' ready and synced");
    } catch (err) {
        console.error("❌ Error initializing 'documents' table:", err);
    }
};

// Get Documents for a Shipment
router.get('/:shipmentId', async (req, res) => {
    try {
        const { shipmentId } = req.params;
        const result = await pool.query('SELECT * FROM documents WHERE shipment_id = $1 ORDER BY uploaded_at DESC', [shipmentId]);
        res.json({ success: true, documents: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch documents' });
    }
});

// Get All Documents for the Logged-in User
router.get('/user/all', async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT d.*, s.origin_address, s.destination_address 
            FROM documents d
            JOIN shipments s ON d.shipment_id = s.id
            WHERE s.customer_id = $1
            ORDER BY d.uploaded_at DESC
        `, [userId]);
        res.json({ success: true, documents: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch user documents' });
    }
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, `doc-${req.user?.userId || 'guest'}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

router.post('/upload', upload.single('docFile'), async (req, res) => {
    console.log("📥 Received upload request:", req.body);
    try {
        const { shipmentId, type, docName } = req.body;
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        if (!req.file) {
            console.log("❌ No file in request");
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        if (!shipmentId) {
            return res.status(400).json({ success: false, error: 'Shipment ID is required for document upload' });
        }

        const sid = parseInt(String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId, 10);
        if (isNaN(sid)) {
            return res.status(400).json({ success: false, error: 'Invalid shipment ID' });
        }

        const shipRes = await pool.query(
            `SELECT id, customer_id, company_id, status, allocated_ship_id
             FROM shipments
             WHERE id = $1`,
            [sid]
        );
        if (shipRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        const shipment = shipRes.rows[0];

        // Permission checks for uploader role
        if (userRole === 'customer' && Number(shipment.customer_id) !== Number(userId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized shipment access' });
        }
        if (userRole === 'company' && Number(shipment.company_id || 0) !== Number(userId)) {
            return res.status(403).json({ success: false, error: 'You can upload only for your assigned shipments' });
        }

        // Workflow gate: no upload before manager allocates a ship
        const uploadEnabledStatuses = [
            'Booked',
            'Ship Allocated',
            'Documents Pending',
            'Payment Pending',
            'Cargo Ready',
            'Confirmed',
            'Cargo Loaded',
            'In Transit',
            'Delivered'
        ];
        const canUpload = uploadEnabledStatuses.includes(shipment.status);
        if (!canUpload) {
            return res.status(400).json({
                success: false,
                error: shipment.status === 'Pending Manager Approval'
                    ? 'Documents are locked until a manager allocates a ship.'
                    : `Document upload is not available for status "${shipment.status}".`
            });
        }

        console.log("📂 File received:", req.file.filename);

        const fileUrl = `/uploads/${req.file.filename}`;
        const finalDocName = docName || req.file.originalname;

        // --- WORKFLOW ENFORCEMENT ---
        // Prevent upload only if shipment hasn't been handled by a manager yet
        if (shipmentId) {
            const shipCheck = await pool.query(`SELECT status FROM shipments WHERE id = $1`, [shipmentId]);
            const currentStatus = shipCheck.rows[0]?.status;
            
            // Allow uploads for Ship Allocated, Cargo Ready, etc.
            // Only block for initial pending states
            if (currentStatus === 'Pending Approval' || currentStatus === 'Pending Manager Approval') {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Upload Restricted: Awaiting Manager Approval and Ship Allocation.' 
                });
            }
        }

        const result = await pool.query(
            'INSERT INTO documents (user_id, shipment_id, type, doc_name, file_url, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, sid, type, finalDocName, fileUrl, 'Submitted']
        );
        console.log("✅ DB Insert successful:", result.rows[0].id);

        // First upload after allocation moves shipment into documents phase
        if (shipment.status === 'Ship Allocated' || shipment.status === 'Documents Pending' || shipment.status === 'Details Pending') {
            const nextStatus = (shipment.status === 'Details Pending') ? 'Documents Pending' : 'Payment Pending';
            await pool.query(
                `UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2`,
                [nextStatus, sid]
            );
            await pool.query(
                `INSERT INTO shipment_events (shipment_id, status, notes, updated_by)
                 VALUES ($1, $2, 'User uploaded document: ' || $3, $4)`,
                [sid, nextStatus, type || 'Document', userId || null]
            );
        }

        res.json({ success: true, document: result.rows[0] });
    } catch (err) {
        console.error("❌ Upload Endpoint Error:", err);
        res.status(500).json({ success: false, error: 'Failed to upload document' });
    }
});

module.exports = { router, createDocumentsTable };
