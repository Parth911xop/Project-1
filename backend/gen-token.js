require('dotenv').config();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key_for_dev';

const token = jwt.sign(
    { userId: 7, role: 'company', email: 'fastshipper@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

console.log(token);
