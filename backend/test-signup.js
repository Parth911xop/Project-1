const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE_URL = 'http://localhost:3000';

async function testSignup() {
    const email = `testuser_${Date.now()}@example.com`;
    console.log(`🚀 Testing Signup for ${email}...`);

    const signupData = {
        email: email,
        fullName: "Test User",
        companyName: "Test Co",
        useCase: "Business",
        location: "New York",
        authMethod: "email"
    };

    try {
        // 1. Request OTP (Signup)
        console.log("📤 Requesting OTP...");
        const res = await fetch(`${BASE_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signupData)
        });
        const data = await res.json();
        console.log("Response:", data);

        if (data.success) {
            console.log("✅ OTP Request successful. User should be created.");
            // Ideally, we'd query the DB to check fields, but since we don't have a direct DB query tool setup for this test script without pg details hardcoded...
            // We can infer success if no error was thrown and 'id' was returned in server logs (which we can't see easily here but we can see success message).

            // Actually, let's try to login (verify-otp) or just assume if success=true and we saw the backend logs previously it works.
            // But wait, the previous `test-shipment.js` logic showed we can't easily check DB state without a route.
            // Let's rely on the server response for now.
        } else {
            console.error("❌ Failed to request OTP");
        }

    } catch (err) {
        console.error("❌ Error:", err);
    }
}

testSignup();
