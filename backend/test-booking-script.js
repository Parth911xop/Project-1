const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3000;

function postRequest(path, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);

        const options = {
            hostname: API_HOST,
            port: API_PORT,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ success: false, message: "Invalid JSON response", raw: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

async function testBooking() {
    console.log("🚀 Starting Booking Test (HTTP Client)...");

    // 1. Mock User ID (Assuming ID 1 exists or creating dummy setup skipped for now)
    // We will try with User ID 1. If it fails due to FK, we'll know.
    const userId = 1;

    // 2. Create Shipment
    const shipmentPayload = {
        userId: userId,
        type: 'Export',
        fromCountry: 'India',
        toCountry: 'France',
        productType: 'Test Cargo',
        weight: 1000,
        recommendedPort: 'Le Havre',
        estimatedCost: 5000,
        transitTime: 20,
        status: 'Booked',
        mode: 'Sea',
        volume: 10,
        cargoValue: 20000
    };

    try {
        console.log("Sending Booking Request...");
        const result = await postRequest('/api/shipment/create', shipmentPayload);
        console.log("Booking Response:", result);

        if (result.success) {
            console.log("✅ Booking Successful! Shipment ID: " + result.shipmentId);
        } else {
            console.error("❌ Booking Failed: " + result.message);
        }

    } catch (err) {
        console.error("Request Error:", err);
    }
}

testBooking();
