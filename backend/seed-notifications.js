const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const seedNotifications = async () => {
    try {
        console.log("🌱 Seeding Notifications...");

        // Get the first user
        const userRes = await pool.query("SELECT id FROM users LIMIT 1");
        if (userRes.rows.length === 0) {
            console.error("❌ No users found to seed notifications for.");
            process.exit(1);
        }
        const userId = userRes.rows[0].id;

        const notifications = [
            {
                user_id: userId,
                title: 'Shipment Booked',
                message: 'Your shipment PA-101 has been successfully booked.',
                type: 'success'
            },
            {
                user_id: userId,
                title: 'Customs Update',
                message: 'Shipment PA-102 is undergoing customs clearance.',
                type: 'warning'
            },
            {
                user_id: userId,
                title: 'Arrival Alert',
                message: 'Container MSCU7123456 has arrived at the destination port.',
                type: 'shipment'
            },
            {
                user_id: userId,
                title: 'Security Notice',
                message: 'New login detected from a new device.',
                type: 'info'
            }
        ];

        for (const n of notifications) {
            await pool.query(
                'INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)',
                [n.user_id, n.title, n.message, n.type]
            );
        }

        console.log(`✅ Successfully seeded ${notifications.length} notifications for User ID: ${userId}`);
        process.exit(0);

    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
};

seedNotifications();
