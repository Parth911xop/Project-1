
const http = require('http');

function post(data) {
    const postData = JSON.stringify(data);
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/update-journey',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            console.log(`Body: ${body}`);
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    req.write(postData);
    req.end();
}

console.log("Test 1: Non-existent User ID 99999");
post({
    userId: 99999,
    shipmentId: 15,
    step: 1,
    data: { test: "data" }
});

setTimeout(() => {
    console.log("\nTest 2: Existent User ID 2");
    post({
        userId: 2,
        shipmentId: 15,
        step: 1,
        data: { test: "data" }
    });
}, 2000);
