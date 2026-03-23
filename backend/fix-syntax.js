const fs = require('fs');
const path = 'server.js';
let content = fs.readFileSync(path, 'utf8');

// Fix line 528
content = content.replace(
  'await pool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT DEFAULT \'\';',
  'await pool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT DEFAULT \'\';");'
);

// Fix line 542
content = content.replace(
  '`); ");',
  '`);'
);

fs.writeFileSync(path, content);
console.log('Fixed syntax errors in server.js');
