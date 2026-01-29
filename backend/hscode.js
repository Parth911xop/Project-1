const express = require('express');
const router = express.Router();

// Mock HS Code Database
const HS_CODES = [
    { code: "1006.30", name: "Semi-milled or wholly milled rice", duty: "0%" },
    { code: "0902.40", name: "Black tea (fermented)", duty: "0%" },
    { code: "0901.11", name: "Coffee, not roasted, not decaffeinated", duty: "5%" },
    { code: "5201.00", name: "Cotton, not carded or combed", duty: "0%" },
    { code: "6109.10", name: "T-shirts of cotton", duty: "10%" },
    { code: "6203.42", name: "Men's trousers, cotton", duty: "10%" },
    { code: "6403.99", name: "Leather Footwear", duty: "10%" },
    { code: "7102.39", name: "Diamonds, worked but not mounted", duty: "2.5%" },
    { code: "7113.19", name: "Gold Jewellery", duty: "15%" },
    { code: "8471.30", name: "Laptops & Notebooks", duty: "0%" },
    { code: "8517.12", name: "Smartphones (Mobile Phones)", duty: "20%" },
    { code: "8703.23", name: "Passenger Cars (>1500cc but <3000cc)", duty: "60%" },
    { code: "3004.90", name: "Medicaments (Pharmaceuticals)", duty: "0%" },
    { code: "8407.34", name: "Engines for vehicles (>1000cc)", duty: "15%" },
    { code: "2710.12", name: "Petroleum Oils (Light)", duty: "10%" },
    { code: "7207.11", name: "Semi-finished Iron/Steel", duty: "7.5%" },
    { code: "0804.50", name: "Guavas, Mangoes (Fresh/Dried)", duty: "30%" },
    { code: "0904.11", name: "Pepper", duty: "70%" },
    { code: "0805.10", name: "Oranges", duty: "30%" },
    { code: "3926.90", name: "Plastic Articles", duty: "10%" },
    { code: "9403.60", name: "Wooden Furniture", duty: "20%" },
    { code: "9503.00", name: "Toys, Scale Models", duty: "60%" }
];

// Search Endpoint
router.get('/search', (req, res) => {
    const query = (req.query.q || '').toLowerCase();

    if (!query) return res.json({ success: true, results: [] });

    const results = HS_CODES.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.code.includes(query)
    );

    res.json({ success: true, results });
});

module.exports = router;
