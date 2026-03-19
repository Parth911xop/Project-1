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
            // Specifically, looking for: fetch(`http://${window.location.hostname}:3000/api/something`,
            // or fetch(`http://${window.location.hostname}:3000/request-otp`,
            
            // Re-run regex globally looking for `http://${window.location.hostname}:3000 ... '
            content = content.replace(/fetch\(`http:\/\/\$\{window\.location\.hostname\}:3000([^']+)'/g, "fetch(`http://${window.location.hostname}:3000$1`");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Repaired quotes: ${fullPath.replace(srcDir, `')}`);
            }
        }
    });
}

processDir(srcDir);
console.log("Done fixing backticks!");
