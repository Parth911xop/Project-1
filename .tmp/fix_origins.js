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
            
            // Replace hardcoded localhost API constants
            content = content.replace(/const API_URL = 'http:\/\/localhost:3000';/g, "const API_URL = window.API_BASE_URL||"";");
            content = content.replace(/const API_BASE = 'http:\/\/localhost:3000';/g, "const API_BASE = window.API_BASE_URL||"";");
            content = content.replace(/const SOCKET_URL = 'http:\/\/localhost:3000';/g, "const SOCKET_URL = window.API_BASE_URL||"";");
            content = content.replace(/fetch\('http:\/\/localhost:3000\/api\//g, "fetch(`${window.API_BASE_URL||""}/api/");
            content = content.replace(/fetch\(`http:\/\/localhost:3000\//g, "fetch('/");
            content = content.replace(/fetch\(`http:\/\/localhost:3000\//g, "fetch(`/");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated: ${fullPath.replace(srcDir, '')}`);
            }
        }
    });
}

processDir(srcDir);
console.log("Done fixing frontend origins!");
