require('dotenv').config();
const { Pool } = require('pg');
const dns = require('dns');
const { URL } = require('url');

const resolveDbConfig = async () => {
    const dbUrlStr = process.env.DATABASE_URL;
    const dbUrl = new URL(dbUrlStr);
    const hostname = dbUrl.hostname;

    return new Promise((resolve, reject) => {
        dns.lookup(hostname, (err, address) => {
            if (err) return reject(err);
            resolve({
                user: dbUrl.username,
                password: dbUrl.password,
                host: address,
                port: dbUrl.port || 5432,
                database: dbUrl.pathname.split('/')[1],
                ssl: { rejectUnauthorized: false, servername: hostname }
            });
        });
    });
};

(async () => {
    try {
        const config = await resolveDbConfig();
        const pool = new Pool(config);

        console.log("=== PORTS COLUMNS ===");
        const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ports'");
        console.log(cols.rows);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
