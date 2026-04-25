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
            
            // Define dynamic backend URL
            const dynamicUrl = "window.API_BASE_URL||""";
            
            // Fix API_URL, API_BASE, SOCKET_URL
            content = content.replace(/const API_URL = window.API_BASE_URL||"";/g, `const API_URL = ${dynamicUrl};`);
            content = content.replace(/const API_BASE = window.API_BASE_URL||"";/g, `const API_BASE = ${dynamicUrl};`);
            content = content.replace(/const SOCKET_URL = window.API_BASE_URL||"";/g, `const SOCKET_URL = ${dynamicUrl};`);
            
            // Fix hardcoded fetch(`${window.API_BASE_URL||""}/api/... or fetch(`${window.API_BASE_URL||""}/request-otp` that I might have broken
            content = content.replace(/fetch\(`\/request-otp'/g, "fetch(`${window.API_BASE_URL||""}/request-otp`");
            content = content.replace(/fetch\(`\/verify-otp'/g, "fetch(`${window.API_BASE_URL||""}/verify-otp`");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated: ${fullPath.replace(srcDir, `')}`);
            }
        }
    });
}

processDir(srcDir);
console.log("Done fixing frontend ports!");
