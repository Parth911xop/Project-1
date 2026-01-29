const express = require('express');
const router = express.Router();

// Mock Port Database
const PORTS_DB = {
    "India": [
        { name: "Nhava Sheva (JNPT)", loc: "Mumbai", type: "Sea" },
        { name: "Mundra Port", loc: "Gujarat", type: "Sea" },
        { name: "Chennai Port", loc: "Tamil Nadu", type: "Sea" },
        { name: "Kolkata Port", loc: "West Bengal", type: "Sea" },
        { name: "IGIA Air Cargo", loc: "Delhi", type: "Air" }
    ],
    "USA": [
        { name: "Port of Los Angeles", loc: "California", type: "Sea" },
        { name: "Port of Long Beach", loc: "California", type: "Sea" },
        { name: "Port of New York & NJ", loc: "New York", type: "Sea" },
        { name: "Savannah Port", loc: "Georgia", type: "Sea" }
    ],
    "China": [
        { name: "Port of Shanghai", loc: "Shanghai", type: "Sea" },
        { name: "Ningbo-Zhoushan", loc: "Zhejiang", type: "Sea" },
        { name: "Shenzhen Port", loc: "Guangdong", type: "Sea" }
    ],
    "UAE": [
        { name: "Jebel Ali", loc: "Dubai", type: "Sea" },
        { name: "Port Rashid", loc: "Dubai", type: "Sea" }
    ],
    "UK": [
        { name: "Felixstowe", loc: "Suffolk", type: "Sea" },
        { name: "Southampton", loc: "Hampshire", type: "Sea" }
    ],
    "Germany": [
        { name: "Port of Hamburg", loc: "Hamburg", type: "Sea" },
        { name: "Bremerhaven", loc: "Bremen", type: "Sea" }
    ]
};

// Recommendation Endpoint
router.get('/recommend', (req, res) => {
    const country = (req.query.country || '').trim();

    // Simple direct lookup, fallback to empty
    // In real app, fuzzy match country names
    let ports = [];

    // Try exact match
    if (PORTS_DB[country]) {
        ports = PORTS_DB[country];
    } else {
        // Try partial match
        const key = Object.keys(PORTS_DB).find(k => country.toLowerCase().includes(k.toLowerCase()));
        if (key) ports = PORTS_DB[key];
    }

    // Default universal if not found
    if (ports.length === 0) {
        ports = [
            { name: "Enter Port Manually", loc: "Unknown", type: "Any" }
        ];
    }

    res.json({ success: true, ports });
});

module.exports = router;
