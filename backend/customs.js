const express = require('express');
const router = express.Router();

let pool;

const createCustomsTable = async (dbPool) => {
    pool = dbPool;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customs_declarations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                shipment_id INTEGER REFERENCES shipments(id),
                declaration_number VARCHAR(50) UNIQUE NOT NULL,
                type VARCHAR(20) DEFAULT 'Import', -- Import, Export
                status VARCHAR(20) DEFAULT 'Draft', -- Draft, Submitted, Cleared, Held
                port VARCHAR(100),
                entry_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'customs_declarations' ready");
    } catch (err) {
        console.error("❌ Error creating 'customs_declarations' table:", err);
    }
};

// Get All Declarations for User
router.get('/', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, error: 'User ID required' });

        const result = await pool.query(`
            SELECT c.*, s.origin, s.destination 
            FROM customs_declarations c
            LEFT JOIN shipments s ON c.shipment_id = s.id
            WHERE c.user_id = $1 
            ORDER BY c.created_at DESC`,
            [userId]
        );
        res.json({ success: true, declarations: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch declarations' });
    }
});

// Create New Declaration
router.post('/create', async (req, res) => {
    try {
        const { userId, shipmentId, type, port } = req.body;

        // Generate Mock Declaration Number
        const declNumber = 'DEC-' + Math.floor(100000 + Math.random() * 900000);

        const result = await pool.query(
            'INSERT INTO customs_declarations (user_id, shipment_id, declaration_number, type, port, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, shipmentId || null, declNumber, type, port, 'Submitted']
        );

        res.json({ success: true, declaration: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to create declaration' });
    }
});

module.exports = { router, createCustomsTable };
