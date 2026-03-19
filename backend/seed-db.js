require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const mockUsers = [
    { email: "admin@smartshipping.com", phone: "0000000000", role: "admin", name: "System Admin" },
    { email: "test@example.com", phone: "1234567890", role: "customer", name: "Test Customer" },
    { email: "demo@smartshipping.com", phone: "9876543210", role: "customer", name: "Demo User" },
    { email: "fedex@example.com", phone: "1112223333", role: "company", name: "FedEx Global" }
];

async function seed() {
    console.log("🌱 Seeding enterprise database...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const user of mockUsers) {
            // Check if exists
            const check = await client.query("SELECT id FROM users WHERE email = $1", [user.email]);
            if (check.rows.length > 0) {
                console.log(`⚠️ User ${user.email} already exists. Skipping.`);
                continue;
            }

            // Insert Base User
            const res = await client.query(
                "INSERT INTO users (email, phone, name, otp_code, role, company_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                [user.email, user.phone, user.name, '123456', user.role, user.role === 'company' ? 'approved' : 'pending']
            );
            const userId = res.rows[0].id;
            console.log(`✅ Created base user: ${user.email} (ID: ${userId})`);

            // Seed Profiles based on Role
            if (user.role === 'customer') {
                await client.query(
                    "INSERT INTO customer_profiles (user_id, full_name, company_name) VALUES ($1, $2, $3)",
                    [userId, user.name, 'Independent']
                );
                console.log(`   ➡️ Customer profile initialized`);
            } else if (user.role === 'company') {
                await client.query(
                    "INSERT INTO company_profiles (user_id, company_name, rating, total_deliveries) VALUES ($1, $2, $3, $4)",
                    [userId, user.name, 4.8, 150]
                );
                console.log(`   ➡️ Company profile initialized`);
            }
        }

        await client.query('COMMIT');
        console.log("✨ Seeding complete!");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Seeding failed:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
