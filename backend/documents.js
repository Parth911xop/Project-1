const express = require('express');
const router = express.Router();

let pool;

const createDocumentsTable = async (dbPool) => {
    pool = dbPool;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                shipment_id INTEGER REFERENCES shipments(id),
                type VARCHAR(50) NOT NULL, -- 'Bill of Lading', 'Commercial Invoice', 'Packing List'
                filename VARCHAR(255) NOT NULL,
                url VARCHAR(255), -- Mock URL
                status VARCHAR(20) DEFAULT 'Pending', -- Pending, Verified, Rejected
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'documents' ready");
    } catch (err) {
        console.error("❌ Error creating 'documents' table:", err);
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

// Mock Upload Document
router.post('/upload', async (req, res) => {
    try {
        const { shipmentId, type, filename } = req.body;

        // Mock URL generation
        const mockUrl = `https://udocs.example.com/${shipmentId}/${filename}`;

        const result = await pool.query(
            'INSERT INTO documents (shipment_id, type, filename, url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [shipmentId, type, filename, mockUrl, 'Pending']
        );

        res.json({ success: true, document: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to upload document' });
    }
});

module.exports = { router, createDocumentsTable };
