const express = require('express');
const router = express.Router();

// Initialize Journey Table
const createJourneyTable = async (pool) => {
    try {
        // FORCE RESET for Schema Fix (User had bad schema with user_id as PK)
        await pool.query(`DROP TABLE IF EXISTS journey_progress`);

        await pool.query(`
            CREATE TABLE journey_progress (
                id SERIAL PRIMARY KEY,
                user_id INTEGER, -- Not Unique, user can have multiple journeys
                shipment_id INTEGER UNIQUE, -- One journey per shipment
                current_step INTEGER DEFAULT 1,
                company_data JSONB DEFAULT '{}',
                documentation_data JSONB DEFAULT '{}',
                customs_data JSONB DEFAULT '{}',
                port_data JSONB DEFAULT '{}',
                sea_data JSONB DEFAULT '{}',
                import_data JSONB DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'journey_progress' ready (Recreated)");
    } catch (err) {
        console.error("❌ Error creating 'journey_progress' table:", err);
    }
};

module.exports = (pool) => {
    createJourneyTable(pool);

    // Get Journey Progress
    router.get('/:shipmentId', async (req, res) => {
        const { shipmentId } = req.params;
        try {
            const result = await pool.query('SELECT * FROM journey_progress WHERE shipment_id = $1', [shipmentId]);

            if (result.rows.length === 0) {
                // Return empty progress if not started
                return res.json({
                    success: true,
                    progress: { current_step: 1 }
                });
            }

            res.json({ success: true, progress: result.rows[0] });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Database Error" });
        }
    });

    // Update Journey Progress
    router.post('/update', async (req, res) => {
        const { userId, shipmentId, step, data } = req.body;

        // Map step number to column name
        const columns = ['company_data', 'documentation_data', 'customs_data', 'port_data', 'sea_data', 'import_data'];
        const dataCol = columns[step - 1];

        if (!dataCol) return res.status(400).json({ success: false, message: "Invalid Step" });

        try {
            // Upsert Logic
            const check = await pool.query('SELECT * FROM journey_progress WHERE shipment_id = $1', [shipmentId]);

            if (check.rows.length === 0) {
                // Insert
                await pool.query(
                    `INSERT INTO journey_progress (user_id, shipment_id, current_step, ${dataCol}) VALUES ($1, $2, $3, $4)`,
                    [userId, shipmentId, step + 1, JSON.stringify(data)] // Assuming step completes, move to next? 
                    // process-flow.js logic says: if SUCCESS, frontend increments currentStep.
                    // But backend should store the 'completed' data.
                    // The frontend sends `step` as `currentStep`.
                    // The example usage implies we save data for the current step.
                );
            } else {
                // Update
                // We typically update the data for the specific step AND maybe the current_step marker if it's advancing.
                // For simplicity, we'll update the data and ensure current_step is at least (step + 1) if we are moving forward.
                // But typically frontend controls the flow. Let's just update the data column.

                await pool.query(
                    `UPDATE journey_progress SET ${dataCol} = $1, current_step = GREATEST(current_step, $2) WHERE shipment_id = $3`,
                    [JSON.stringify(data), step + 1, shipmentId]
                );
            }

            res.json({ success: true, message: "Progress Saved" });

        } catch (err) {
            console.error("Journey Update Error:", err);
            res.status(500).json({ success: false, message: "Database Update Failed" });
        }
    });

    return router;
};
