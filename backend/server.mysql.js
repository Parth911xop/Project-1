const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Database Connection Configuration
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // Matches your Workbench connection
    password: 'YOUR_PASSWORD', 
    database: 'smart_shipping'
});

db.connect(err => {
    if (err) throw err;
    console.log("MySQL Workbench Connected!");
});

// Route to update Journey Data (e.g., saving Company Registration)
app.post('/update-journey', (req, res) => {
    const { userId, step, data } = req.body;
    const stepColumn = getStepColumnName(step); // Helper to find right column

    const sql = `UPDATE journey_progress SET ${stepColumn} = ?, current_step = ? WHERE user_id = ?`;
    db.query(sql, [JSON.stringify(data), step + 1, userId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, message: "Step data saved!" });
    });
});

function getStepColumnName(step) {
    const columns = ['company_data', 'documentation_data', 'customs_data', 'port_data', 'sea_data', 'import_data'];
    return columns[step - 1];
}

app.listen(3000, () => console.log("Server running on port 3000"));
