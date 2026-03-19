const { Pool } = require('pg');
const dns = require('dns');
const { URL } = require('url');
require('dotenv').config();

const resolveDbConfig = async () => {
    const dbUrlStr = process.env.DATABASE_URL;
    if (!dbUrlStr) throw new Error("DATABASE_URL is missing!");

    const dbUrl = new URL(dbUrlStr);
    const hostname = dbUrl.hostname;

    return new Promise((resolve, reject) => {
        dns.lookup(hostname, (err, address, family) => {
            if (err) return reject(err);
            const config = {
                user: dbUrl.username,
                password: dbUrl.password,
                host: address,
                port: dbUrl.port || 5432,
                database: dbUrl.pathname.split('/')[1],
                ssl: { rejectUnauthorized: false, servername: hostname }
            };
            resolve(config);
        });
    });
};

const seed = async () => {
    let pool;
    try {
        const dbConfig = await resolveDbConfig();
        pool = new Pool(dbConfig);
        await pool.query('SELECT 1'); // test connection

        console.log("Connected. Seeding Shipping Company data...");

        // 1. Create a Customer user
        const customerRes = await pool.query(`
            INSERT INTO users (email, phone, name, otp_code, role, company_status)
            VALUES ('testcustomer@test.com', null, 'Alice Customer', '123456', 'customer', 'none')
            ON CONFLICT (email) DO UPDATE SET name = 'Alice Customer'
            RETURNING id;
        `);
        const customerId = customerRes.rows[0].id;

        // 2. Create the Company user
        const companyEmail = 'fastshipper@test.com';
        const companyRes = await pool.query(`
            INSERT INTO users (email, phone, name, otp_code, role, company_status)
            VALUES ($1, null, 'FastShipper Logistics', '000000', 'company', 'approved')
            ON CONFLICT (email) DO UPDATE SET role = 'company', company_status = 'approved'
            RETURNING id;
        `, [companyEmail]);
        const companyId = companyRes.rows[0].id;

        // 3. Create Company Profile Note: ON CONFLICT not trivial without unique constraint, so check first
        const pCheck = await pool.query('SELECT user_id FROM company_profiles WHERE user_id = $1', [companyId]);
        if (pCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO company_profiles (user_id, company_name, documents_url, total_deliveries, on_time_rate)
                VALUES ($1, 'FastShipper Logistics', 'https://example.com/docs', 150, 98.2)
            `, [companyId]);
        } else {
            await pool.query(`
                UPDATE company_profiles SET on_time_rate = 98.2, total_deliveries = 150 WHERE user_id = $1
            `, [companyId]);
        }

        // 4. Create some Shipments (Delete old ones for clean state)
        await pool.query('DELETE FROM shipments WHERE company_id = $1 OR user_id = $2', [companyId, customerId]);

        // Pending Request
        await pool.query(`
            INSERT INTO shipments (user_id, from_country, to_country, weight, type, mode, estimated_cost, status)
            VALUES ($1, 'United States', 'Germany', 500, 'Electronics', 'Air', 2400.00, 'Booked')
        `, [customerId]);

        // Same for another Pending Request assigned to this company specifically (if your logic requires company_id for pending, wait: pending uses company_id)
        await pool.query(`
            INSERT INTO shipments (user_id, company_id, from_country, to_country, weight, type, mode, estimated_cost, status)
            VALUES ($1, $2, 'China', 'France', 1200, 'Textiles', 'Ocean', 850.50, 'Booked')
        `, [customerId, companyId]);

        // Active Shipment (In Transit)
        await pool.query(`
            INSERT INTO shipments (user_id, company_id, from_country, to_country, weight, type, mode, estimated_cost, status, vehicle_type)
            VALUES ($1, $2, 'Japan', 'United Kingdom', 300, 'Machinery', 'Ocean', 1500.00, 'In Transit', 'Cargo Ship')
        `, [customerId, companyId]);

        // Active Shipment (Accepted)
        await pool.query(`
            INSERT INTO shipments (user_id, company_id, from_country, to_country, weight, type, mode, estimated_cost, status, vehicle_type)
            VALUES ($1, $2, 'Brazil', 'Canada', 850, 'Coffee', 'Air', 4200.00, 'Accepted', NULL)
        `, [customerId, companyId]);

        // Completed Shipment (Delivered)
        await pool.query(`
            INSERT INTO shipments (user_id, company_id, from_country, to_country, weight, type, mode, estimated_cost, status, vehicle_type)
            VALUES ($1, $2, 'India', 'United States', 250, 'Spices', 'Air', 950.00, 'Delivered', 'Electric Van')
        `, [customerId, companyId]);

        console.log("✅ Seed complete! You can login as 'fastshipper@test.com' with OTP '000000'");
        process.exit(0);
    } catch (e) {
        console.error("Seed error:", e);
        process.exit(1);
    }
};

seed();
