
/**
 * Simple Rule-Based Cost Estimation Engine
 */

const calculateTripCost = (fromCountry, toCountry, mode, weightKg, volumeCbm, cargoValueUSD, productType) => {
    // 1. Base Freight Rates (per kg or per CBM)
    // Simplified logic: Air is expensive per kg, Sea is cheap per CBM

    let baseFreight = 0;

    // Normalize inputs
    const weight = parseFloat(weightKg) || 0;
    const volume = parseFloat(volumeCbm) || 0;
    const value = parseFloat(cargoValueUSD) || 0;
    const modeLower = (mode || '').toLowerCase();

    // Distance multiplier (Mock: Region based)
    // In a real app, we'd use lat/long or port-to-port API
    let regionMultiplier = 1.0;
    if ((fromCountry.includes("India") && toCountry.includes("USA")) || (fromCountry.includes("USA") && toCountry.includes("India"))) {
        regionMultiplier = 1.5;
    } else if (fromCountry.includes("China") || toCountry.includes("China")) {
        regionMultiplier = 0.8; // High volume route
    }

    if (modeLower.includes('air')) {
        // Air Freight: ~$2 to $5 per kg
        const ratePerKg = 3.5 * regionMultiplier;
        baseFreight = weight * ratePerKg;
    } else if (modeLower.includes('road')) {
        // Road Freight: ~$0.5 per kg (short distances usually, but for mock)
        const ratePerKg = 0.5 * regionMultiplier;
        baseFreight = weight * ratePerKg;
    } else {
        // Sea Freight: ~$50 to $150 per CBM (LCL)
        // If volume is low, minimum 1 CBM charge
        const chargeableVolume = Math.max(volume, 1);
        const ratePerCbm = 80 * regionMultiplier;
        baseFreight = chargeableVolume * ratePerCbm;
    }

    // 2. Fuel Surcharge (BAF)
    // Typically 10-20% of base freight
    const fuelSurcharge = baseFreight * 0.15;

    // 3. Port / Handling Fees
    // Fixed fee + variable
    const portFees = 150 + (weight * 0.05);

    // 4. Customs Duty
    // Rule based on product type
    // In real world, this queries an HS Code database
    let dutyRate = 0.0;
    const prod = (productType || '').toLowerCase();

    if (prod.includes('electronic') || prod.includes('phone') || prod.includes('laptop')) {
        dutyRate = 0.18; // 18%
    } else if (prod.includes('textile') || prod.includes('cloth') || prod.includes('cotton')) {
        dutyRate = 0.12; // 12%
    } else if (prod.includes('food') || prod.includes('agri')) {
        dutyRate = 0.05; // 5%
    } else {
        dutyRate = 0.10; // Default 10%
    }

    const customsDuty = value * dutyRate;

    // 5. Insurance (Optional but good to show)
    const insurance = value * 0.005; // 0.5% of cargo value

    // Total in USD
    const totalCostUSD = baseFreight + fuelSurcharge + portFees + customsDuty + insurance;

    // Conversion to INR (Approx Rate)
    const EXCHANGE_RATE = 84.0;

    return {
        currency: "INR",
        breakdown: {
            baseFreight: Number((baseFreight * EXCHANGE_RATE).toFixed(2)),
            fuelSurcharge: Number((fuelSurcharge * EXCHANGE_RATE).toFixed(2)),
            portFees: Number((portFees * EXCHANGE_RATE).toFixed(2)),
            customsDuty: Number((customsDuty * EXCHANGE_RATE).toFixed(2)),
            insurance: Number((insurance * EXCHANGE_RATE).toFixed(2))
        },
        total: Number((totalCostUSD * EXCHANGE_RATE).toFixed(2)),
        meta: {
            mode: modeLower,
            dutyRateUsed: `${(dutyRate * 100).toFixed(0)}%`,
            appliedRegionMultiplier: regionMultiplier,
            exchangeRate: EXCHANGE_RATE
        }
    };
};

module.exports = { calculateTripCost };
