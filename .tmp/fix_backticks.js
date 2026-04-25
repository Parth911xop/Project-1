const fs = require('fs');
const path = require('path');

const srcDir = '/Users/parthrathod/Documents/GitHub/Project-1';

function processDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'backend') {
                processDir(fullPath);
            }
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;
            
            // Fix auth-guard.js format `.../api/...' -> `.../api/...`
            // Specifically, looking for: fetch(`${window.API_BASE_URL||""}/api/something`,
            // or fetch(`${window.API_BASE_URL||""}/request-otp`,
            
            // Re-run regex globally looking for window.API_BASE_URL + " ... '
            content = content.replace(/fetch\(`http:\/\/\$\{window\.location\.hostname\}:3000([^']+)'/g, "fetch(window.API_BASE_URL + "$1`");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Repaired quotes: ${fullPath.replace(srcDir, `')}`);
            }
        }
    });
}

processDir(srcDir);
console.log("Done fixing backticks!");
