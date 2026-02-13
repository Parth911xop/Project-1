const dns = require('dns');
const hosts = [
    'ep-plain-term-ahkfudkr-pooler.c-3.us-east-1.aws.neon.tech',
    'ep-plain-term-ahkfudkr.us-east-1.aws.neon.tech', // Try without pooler/c-3
    'ep-plain-term-ahkfudkr-pooler.us-east-1.aws.neon.tech', // Try without c-3
    'us-east-1.aws.neon.tech' // Check base domain
];

hosts.forEach(host => {
    dns.lookup(host, (err, address) => {
        if (err) console.log(`❌ ${host}: ${err.code}`);
        else console.log(`✅ ${host}: ${address}`);
    });
});
