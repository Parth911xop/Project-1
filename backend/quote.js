const express = require('express');
const router = express.Router();

// Emission Factors (kg CO2 per ton-km)
// Source: approximate industry averages
const EMISSION_FACTORS = {
    Ocean: 0.015,
    Air: 0.55,
    Road: 0.062,
    Rail: 0.022
};

// Mock Distance Calculator (in km)
// In a real app, this would use a port-to-port API
const getDistance = (origin, dest) => {
    // Simple hash-based mock distance for consistency
    const combined = origin + dest;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash) + combined.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) % 15000) + 3000; // Return between 3000km and 18000km
};

// Calculate CO2
const calculateCO2 = (weightKg, distanceKm, mode) => {
    const tons = weightKg / 1000;
    const factor = EMISSION_FACTORS[mode] || EMISSION_FACTORS['Ocean'];
    return Math.round(tons * distanceKm * factor);
};

// Smart Quote Engine
router.post('/calculate', (req, res) => {
    const { fromCountry, toCountry, weight, mode } = req.body;

    const weightNum = parseFloat(weight) || 1000;
    const distance = getDistance(fromCountry, toCountry);

    // Base Calculations
    const baseRatePerKm = mode === 'Air' ? 0.8 : 0.05; // $ per km
    const baseCost = Math.round(distance * baseRatePerKm * (weightNum / 1000));
    const baseTime = mode === 'Air' ? 3 : Math.round(distance / 500); // days

    // Generate 3 Distinct Options
    const options = [
        {
            id: 'opt_best',
            name: 'Best Value',
            badge: 'AI Recommended',
            carrier: 'Maersk Line',
            mode: mode,
            days: baseTime,
            cost: baseCost,
            co2: calculateCO2(weightNum, distance, mode),
            reliability: '98%'
        },
        {
            id: 'opt_fast',
            name: 'Fastest',
            badge: 'Fastest',
            carrier: mode === 'Air' ? 'DHL Aviation' : 'CMA CGM Express',
            mode: mode === 'Air' ? 'Air' : 'Ocean', // If user selected Ocean, maybe offer Air as fast option? For now stick to requested mode or upgrade
            days: Math.max(1, Math.round(baseTime * 0.7)),
            cost: Math.round(baseCost * 1.4),
            co2: calculateCO2(weightNum, distance, mode) * 1.1, // Faster usually means more fuel
            reliability: '99%'
        },
        {
            id: 'opt_eco',
            name: 'Eco-Saver',
            badge: 'Carbon Neutral',
            carrier: 'Hapag-Lloyd (Green)',
            mode: mode,
            days: Math.round(baseTime * 1.2), // Slow steaming
            cost: Math.round(baseCost * 0.85),
            co2: Math.round(calculateCO2(weightNum, distance, mode) * 0.8), // 20% savings
            reliability: '95%'
        }
    ];

    // Carbon Offset Cost (approx $15 per ton of CO2)
    const carbonPricePerTon = 15;
    options.forEach(opt => {
        opt.carbonOffsetCost = Math.ceil((opt.co2 / 1000) * carbonPricePerTon);
    });

    // Simulate Network Delay
    setTimeout(() => {
        res.json({
            success: true,
            quotes: options,
            meta: {
                origin: fromCountry,
                dest: toCountry,
                distance: distance
            }
        });
    }, 1500);
});

module.exports = router;
