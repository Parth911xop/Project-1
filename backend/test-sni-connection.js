const { Client } = require('pg');
const dns = require('dns');

// Force Google DNS for this test explicitly using resolve4 (which uses network, not getaddrinfo)
dns.setServers(['8.8.8.8']);

const originalHost = 'ep-plain-term-ahkfudkr-pooler.c-3.us-east-1.aws.neon.tech';
const connectionString = process.env.DATABASE_URL; // We'll parse this manually or just use the parts

async function testConnection() {
    console.log('Resolving host with Google DNS...');
    try {
        const addresses = await dns.promises.resolve4(originalHost);
        const resolvedIp = addresses[0];
        console.log(`Resolved to: ${resolvedIp}`);

        const client = new Client({
            host: resolvedIp, // Use IP
            user: 'neondb_owner', // From .env
            password: 'npg_Zve69ckaCuJS', // From .env
            database: 'neondb',
            port: 5432,
            ssl: {
                rejectUnauthorized: false,
                servername: originalHost // Crucial for Neon SNI
            }
        });

        console.log('Connecting...');
        await client.connect();
        console.log('✅ Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Time:', res.rows[0]);
        await client.end();
    } catch (err) {
        console.error('❌ Connection failed:', err);
    }
}

testConnection();
