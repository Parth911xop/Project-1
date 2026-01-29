require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: Number(process.env.PGPORT),
    ssl: { rejectUnauthorized: false }
});

const mockUsers = [
    { email: "test@example.com", password: "password123", phone: "1234567890", auth_method: "email" },
    { email: "demo@smartshipping.com", password: "demo", phone: "9876543210", auth_method: "email" }
];

async function seed() {
    try {
        console.log("🌱 Seeding database...");

        for (const user of mockUsers) {
            // Check if exists
            const check = await pool.query("SELECT * FROM users WHERE email = $1", [user.email]);
            if (check.rows.length > 0) {
                console.log(`⚠️ User ${user.email} already exists. Skipping.`);
                continue;
            }

            // Insert User
            const res = await pool.query(
                "INSERT INTO users (email, password, phone, auth_method) VALUES ($1, $2, $3, $4) RETURNING id",
                [user.email, user.password, user.phone, user.auth_method]
            );
            const userId = res.rows[0].id;
            console.log(`✅ Created user: ${user.email} (ID: ${userId})`);

            // Insert Journey Progress
            await pool.query(
                "INSERT INTO journey_progress (user_id, current_step) VALUES ($1, 1)",
                [userId]
            );
            console.log(`   ➡️ Journey initialized for ID: ${userId}`);
        }

        console.log("✨ Seeding complete!");
    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        pool.end();
    }
}

seed();
