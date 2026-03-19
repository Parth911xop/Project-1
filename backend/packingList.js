const express = require('express');
const router = express.Router();

let pool;

const createPackingTables = async (dbPool) => {
    pool = dbPool;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS packing_lists (
                id SERIAL PRIMARY KEY,
                shipment_id INTEGER REFERENCES shipments(id) UNIQUE,
                exporter_name VARCHAR(255),
                exporter_address TEXT,
                consignee_name VARCHAR(255),
                consignee_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS packing_items (
                id SERIAL PRIMARY KEY,
                packing_list_id INTEGER REFERENCES packing_lists(id) ON DELETE CASCADE,
                description VARCHAR(255) NOT NULL,
                package_type VARCHAR(50),
                quantity INTEGER DEFAULT 1,
                net_weight NUMERIC(10, 2),
                gross_weight NUMERIC(10, 2),
                volume_cbm NUMERIC(10, 2)
            );
        `);
        console.log("✅ Tables 'packing_lists' & 'packing_items' ready");
    } catch (err) {
        console.error("❌ Error creating packing list tables:", err);
    }
};

// Get Packing List for a Shipment
router.get('/:shipmentId', async (req, res) => {
    try {
        const { shipmentId } = req.params;
        const listResult = await pool.query('SELECT * FROM packing_lists WHERE shipment_id = $1', [shipmentId]);

        if (listResult.rows.length === 0) {
            return res.json({ success: true, packingList: null, items: [] });
        }

        const packingList = listResult.rows[0];
        const itemsResult = await pool.query('SELECT * FROM packing_items WHERE packing_list_id = $1 ORDER BY id ASC', [packingList.id]);

        res.json({ success: true, packingList, items: itemsResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch packing list' });
    }
});

// Create/Update Packing List
router.post('/:shipmentId', async (req, res) => {
    try {
        const { shipmentId } = req.params;
        const { exporter_name, exporter_address, consignee_name, consignee_address, items } = req.body;

        // Upsert packing list
        let packingListId;
        const checkResult = await pool.query('SELECT id FROM packing_lists WHERE shipment_id = $1', [shipmentId]);

        if (checkResult.rows.length > 0) {
            packingListId = checkResult.rows[0].id;
            await pool.query(
                'UPDATE packing_lists SET exporter_name = $1, exporter_address = $2, consignee_name = $3, consignee_address = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
                [exporter_name, exporter_address, consignee_name, consignee_address, packingListId]
            );
        } else {
            const insertResult = await pool.query(
                `INSERT INTO packing_lists (shipment_id, exporter_name, exporter_address, consignee_name, consignee_address) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [shipmentId, exporter_name, exporter_address, consignee_name, consignee_address]
            );
            packingListId = insertResult.rows[0].id;
        }

        // Handle items: simple way is to delete old and insert new, or just insert new if not updating
        await pool.query('DELETE FROM packing_items WHERE packing_list_id = $1', [packingListId]);

        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO packing_items (packing_list_id, description, package_type, quantity, net_weight, gross_weight, volume_cbm)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [packingListId, item.description, item.package_type, item.quantity, item.net_weight, item.gross_weight, item.volume_cbm]
                );
            }
        }

        res.json({ success: true, message: 'Packing list saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to save packing list' });
    }
});

module.exports = { router, createPackingTables };
