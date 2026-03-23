const { Pool } = require('pg');
require('dotenv').config();

const dbUrlStr = process.env.DATABASE_URL;
const dbUrl = new URL(dbUrlStr);

const pool = new Pool({
    user: dbUrl.username,
    password: dbUrl.password,
    host: dbUrl.hostname,
    port: dbUrl.port || 5432,
    database: dbUrl.pathname.split('/')[1],
    ssl: { rejectUnauthorized: false }
});

async function test() {
    try {
        const id = 11; // assume company id

        console.log('Testing stats...');
        const [totalR, activeR, deliveredR, pendingR] = await Promise.all([
            pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1`, [id]),
            pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1 AND status IN ('Ship Allocated','Cargo Ready','Cargo Loaded','In Transit','At Port','Accepted')`, [id]),
            pool.query(`SELECT COUNT(*) as count FROM shipments WHERE company_id=$1 AND status='Delivered'`, [id]),
            pool.query(`SELECT COUNT(*) as count FROM shipments WHERE status='Pending Manager Approval'`, [])
        ]);
        console.log('Stats successful');

        console.log('Testing revenue...');
        const revenueR = await pool.query(
            `SELECT COALESCE(SUM(estimated_cost*0.95),0) as total FROM shipments WHERE company_id=$1 AND status='Delivered'`, [id]
        );
        console.log('Revenue successful');

        console.log('Testing monthly...');
        const monthlyR = await pool.query(`
            SELECT TO_CHAR(created_at,'Mon') as month, EXTRACT(MONTH FROM created_at) as month_num, COUNT(*) as count
            FROM shipments WHERE company_id=$1 AND created_at >= NOW() - INTERVAL '6 months'
            GROUP BY month, month_num ORDER BY month_num
        `, [id]);
        console.log('Monthly successful');

        console.log('Testing all-shipments...');
        const r = await pool.query(`
                SELECT s.*, u.name as customer_name, u.email as customer_email,
                       UPPER(LEFT(u.email, 2)) as user_prefix,
                       COALESCE(s.origin_lat, 
                           CASE 
                               WHEN LOWER(s.origin_address) LIKE '%india%' THEN 18.94
                               ELSE 1.35 
                           END
                       ) as origin_lat,
                       COALESCE(s.origin_lng,
                           CASE 
                               WHEN LOWER(s.origin_address) LIKE '%india%' THEN 72.83
                               ELSE 103.81
                           END
                       ) as origin_lng,
                       COALESCE(s.dest_lat,
                           CASE 
                               WHEN LOWER(s.destination_address) LIKE '%china%' THEN 31.23
                               WHEN LOWER(s.destination_address) LIKE '%dubai%' THEN 25.20
                               ELSE 51.50
                           END
                       ) as dest_lat,
                       COALESCE(s.dest_lng,
                           CASE 
                               WHEN LOWER(s.destination_address) LIKE '%china%' THEN 121.47
                               WHEN LOWER(s.destination_address) LIKE '%dubai%' THEN 55.27
                               ELSE -0.12
                           END
                       ) as dest_lng
                FROM shipments s 
                LEFT JOIN users u ON s.customer_id = u.id
                WHERE s.company_id=$1 AND s.status NOT IN ('Pending Manager Approval', 'Declined')
                ORDER BY s.created_at DESC
            `, [id]);
            console.log('All shipments successful. Count:', r.rows.length);
    } catch (err) {
        console.error('Database Error:', err.message);
    } finally {
        pool.end();
    }
}
test();
