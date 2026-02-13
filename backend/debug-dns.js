const dns = require('dns');
const host = 'ep-plain-term-ahkfudkr-pooler.c-3.us-east-1.aws.neon.tech';
console.log(`Looking up: ${host}`);
dns.lookup(host, (err, address, family) => {
    if (err) {
        console.error('❌ DNS Lookup Failed:', err);
    } else {
        console.log(`✅ Resolved: ${address} (IPv${family})`);
    }
});
