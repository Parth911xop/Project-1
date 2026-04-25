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
            
            // Fix auth-guard.js, tracking.js, etc fetches
            content = content.replace(/fetch\('\/api\//g, "fetch(`${window.API_BASE_URL||""}/api/");
            content = content.replace(/fetch\(`\/api\//g, "fetch(`${window.API_BASE_URL||""}/api/");
            
            // Auth.js specific endpoints
            content = content.replace(/fetch\(`\/request-otp'/g, "fetch(`${window.API_BASE_URL||""}/request-otp`");
            content = content.replace(/fetch\(`\/verify-otp'/g, "fetch(`${window.API_BASE_URL||""}/verify-otp`");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated dynamic fetches: ${fullPath.replace(srcDir, `')}`);
            }
        }
    });
}

processDir(srcDir);
console.log("Done fixing frontend dynamic fetches!");
