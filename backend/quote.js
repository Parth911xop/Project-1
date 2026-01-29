const express = require('express');
const router = express.Router();

// Mock Quote Calculation API
router.post('/calculate', (req, res) => {
    const { fromCountry, toCountry, productType, weight, volume, cargoValue, mode } = req.body;

    // Basic Mock Logic for Demo
    const weightNum = parseFloat(weight) || 0;
    const volumeNum = parseFloat(volume) || 0;

    let baseRate = 0;
    let days = 0;

    if (mode === 'Air') {
        baseRate = weightNum * 5.5; // $5.5 per kg
        days = 3;
    } else {
        baseRate = volumeNum * 150; // $150 per CBM
        days = 25;
    }

    // Adjust by Country (Mock)
    if (fromCountry === 'India' && toCountry === 'USA') baseRate *= 1.2;

    // Breakdown
    const freightCost = Math.round(baseRate);
    const portFees = 150;
    const insurance = Math.round(parseFloat(cargoValue) * 0.01) || 50;

    const total = freightCost + portFees + insurance;

    // Construct Response
    const quote = {
        total: total,
        currency: 'USD',
        breakdown: {
            baseFreight: freightCost,
            portFees: portFees,
            insurance: insurance
        }
    };

    // Simulate delay
    setTimeout(() => {
        res.json({ success: true, quote: quote });
    }, 1000);
});

module.exports = router;
