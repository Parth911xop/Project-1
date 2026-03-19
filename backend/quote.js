const express = require('express');

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
    const combined = origin + dest;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash) + combined.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) % 15000) + 3000;
};

// Calculate CO2
const calculateCO2 = (weightKg, distanceKm, mode) => {
    const tons = weightKg / 1000;
    const factor = EMISSION_FACTORS[mode] || EMISSION_FACTORS['Ocean'];
    return Math.round(tons * distanceKm * factor);
};

module.exports = async function (pool) {
    const router = express.Router();

    // Smart Quote Engine
    router.post('/calculate', async (req, res) => {
        const { fromCountry, toCountry, weight, mode: preferredMode } = req.body;
        const weightNum = parseFloat(weight) || 1000;

        try {
            // 1. Try to find a real route in our Enterprise Routing Ledger
            const routeQuery = `
                SELECT r.*, p_orig.name as origin_port, p_dest.name as dest_port
                FROM routes r
                JOIN ports p_orig ON r.origin_port_id = p_orig.id
                JOIN ports p_dest ON r.dest_port_id = p_dest.id
                WHERE (p_orig.name ILIKE $1 OR p_orig.city ILIKE $1 OR p_orig.country ILIKE $1 OR p_orig.state ILIKE $1)
                  AND (p_dest.name ILIKE $2 OR p_dest.city ILIKE $2 OR p_dest.country ILIKE $2 OR p_dest.state ILIKE $2)
                  AND r.mode = $3
                LIMIT 1
            `;
            
            const routeResult = await pool.query(routeQuery, [`%${fromCountry}%`, `%${toCountry}%`, preferredMode]);
            
            let finalDistance, finalBaseCost, finalTime, finalCarrier, finalMode, finalCO2;

            if (routeResult.rows.length > 0) {
                const r = routeResult.rows[0];
                finalDistance = r.distance_km;
                finalBaseCost = Math.round(r.base_cost_per_kg * weightNum);
                finalTime = r.lead_time_days;
                finalCarrier = r.carrier_name;
                finalMode = r.mode;
                finalCO2 = Math.round((weightNum / 1000) * r.distance_km * r.co2_per_kg);
                console.log(`🎯 Real Route Found: ${r.origin_port} -> ${r.dest_port}`);
            } else {
                // FALLBACK: Use Smart Estimation if no fixed route exists
                const distance = getDistance(fromCountry, toCountry);
                const baseRatePerKm = preferredMode === 'Air' ? 0.8 : 0.05;
                
                finalDistance = distance;
                finalBaseCost = Math.round(distance * baseRatePerKm * (weightNum / 1000));
                finalTime = preferredMode === 'Air' ? 3 : Math.round(distance / 500);
                finalCarrier = preferredMode === 'Air' ? 'Digital Wings' : 'Smart Ocean Line';
                finalMode = preferredMode;
                finalCO2 = calculateCO2(weightNum, distance, preferredMode);
                console.log(`🤖 Route Estimation used for ${fromCountry} -> ${toCountry}`);
            }

            // Fetch companies for variety
            const compRes = await pool.query("SELECT u.id, c.company_name as name FROM users u JOIN company_profiles c ON u.id = c.user_id WHERE u.role='company'");
            const companies = compRes.rows;

            // Generate Options
            const options = [
                {
                    id: 'opt_best',
                    badge: 'AI Preferred',
                    carrier: finalCarrier,
                    companyId: companies[0]?.id || null,
                    mode: finalMode,
                    days: finalTime,
                    cost: finalBaseCost,
                    co2: finalCO2,
                    reliability: '98%'
                },
                {
                    id: 'opt_fast',
                    badge: 'Premium Fast',
                    carrier: 'Flash Courier',
                    companyId: companies[1]?.id || companies[0]?.id || null,
                    mode: finalMode === 'Air' ? 'Air' : 'Ocean',
                    days: Math.max(1, Math.round(finalTime * 0.7)),
                    cost: Math.round(finalBaseCost * 1.45),
                    co2: Math.round(finalCO2 * 1.15),
                    reliability: '99%'
                },
                {
                    id: 'opt_eco',
                    badge: 'Climate Neutral',
                    carrier: companies[2]?.name || 'EcoFreight',
                    companyId: companies[2]?.id || companies[0]?.id || null,
                    mode: finalMode,
                    days: Math.round(finalTime * 1.25),
                    cost: Math.round(finalBaseCost * 0.9),
                    co2: Math.round(finalCO2 * 0.8),
                    reliability: '95%'
                }
            ];

            const carbonPricePerTon = 15;
            options.forEach(opt => {
                opt.carbonOffsetCost = Math.ceil((opt.co2 / 1000) * carbonPricePerTon);
            });

            res.json({
                success: true,
                quotes: options,
                meta: { distance: finalDistance, source: routeResult.rows.length > 0 ? 'Enterprise Ledger' : 'Smart Engine' }
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Error calculating enterprise quote" });
        }
    });

    return router;
};
