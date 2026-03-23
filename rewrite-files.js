const fs = require('fs');
const path = require('path');

function createSidebar(activePage) {
    return `    <aside class="sidebar">
        <div class="brand-section">
            <a href="index.html" class="text-decoration-none">
                <h4 class="fw-bold text-white mb-0"><i class="fas fa-ship me-2 text-primary"></i>SmartShip</h4>
            </a>
            <span class="text-xs text-white-50">ENTERPRISE</span>
        </div>
        <nav class="d-flex flex-column gap-1">
            <a href="shipments.html" class="nav-item-dash">
                <i class="fas fa-th-large w-5"></i> Dashboard
            </a>
            <a href="wizard.html" class="nav-item-dash"><i class="fas fa-plus-circle w-5"></i> New Booking</a>
            <a href="track.html" class="nav-item-dash"><i class="fas fa-map-marked-alt w-5"></i> Live Tracking</a>
            <a href="documents.html" class="nav-item-dash ${activePage === 'documents' ? 'active' : ''}"><i class="fas fa-folder-open w-5"></i> Documents</a>
            <a href="schedules.html" class="nav-item-dash ${activePage === 'schedules' ? 'active' : ''}"><i class="fas fa-calendar-alt w-5"></i> Schedules</a>
            <hr class="border-secondary opacity-25 my-3">
            <a href="finance.html" class="nav-item-dash"><i class="fas fa-file-invoice-dollar w-5"></i> Billing</a>
            <a href="support.html" class="nav-item-dash ${activePage === 'support' ? 'active' : ''}"><i class="fas fa-headset w-5"></i> Support</a>
            <a href="settings.html" class="nav-item-dash"><i class="fas fa-cog w-5"></i> Settings</a>
        </nav>
        <div class="mt-auto pt-4 border-top border-secondary border-opacity-10">
            <div class="d-flex align-items-center gap-2">
                <div id="user-avatar" class="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white fw-bold" style="width:32px;height:32px;">U</div>
                <div class="d-grid">
                    <span id="user-name-display" class="text-white text-sm fw-bold">User</span>
                </div>
            </div>
        </div>
    </aside>

    <main class="dashboard-main p-4">`;
}

function processFile(filename, activePage) {
    const p = path.join('d:\\Project-1', filename);
    if (!fs.existsSync(p)) return;

    let html = fs.readFileSync(p, 'utf8');

    // Remove <nav> navbar
    html = html.replace(/<nav class="navbar[\s\S]*?<\/nav>/, '');
    
    // Replace <body class="..."> with our outer container
    html = html.replace(/<body[^>]*>/, `<body class="dashboard-page">\n${createSidebar(activePage)}`);

    // Add dashboard.css link if missing
    if (!html.includes('dashboard.css')) {
        html = html.replace('</head>', '    <link rel="stylesheet" href="dashboard.css">\n</head>');
    }

    // Replace the main enclosing container closing tags
    // For documents: find the very end of body and close the main
    // Look for <div class="modal fade" => it should be OUTSIDE or INSIDE main? Actually modals can be anywhere.
    // Let's just put </main> right before </body>, and it's fine.
    // But scripts should also be inside or outside main. It doesn't matter.
    html = html.replace('</body>', '</main>\n</body>');

    // Remove <script src="nav.js"></script> as we don't need it
    html = html.replace(/<script src="nav.js"><\/script>/, '');

    // The inner container padding can be reduced now since main has padding
    html = html.replace('class="container py-5 mt-5"', 'class="container py-2"');
    html = html.replace('class="container flex-grow-1 py-5 mt-5"', 'class="container py-2"');

    // Inject User loader script
    const userScript = `
    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                const res = await fetch(\`http://\${window.location.hostname}:3000/api/auth/me\`, { credentials: 'include' });
                const data = await res.json();
                if (data.success && data.user) {
                    const name = data.user.name || 'User';
                    const nameEl = document.getElementById('user-name-display');
                    const avEl = document.getElementById('user-avatar');
                    if (nameEl) nameEl.innerText = name;
                    if (avEl) avEl.innerText = name.charAt(0).toUpperCase();
                }
            } catch (err) { }
        });
    </script>
    `;
    if (!html.includes('user-name-display')) {
        // Will be matched in sidebar anyway
    }
    // Just append script before </body>
    html = html.replace('</body>', userScript + '\n</body>');

    fs.writeFileSync(p, html);
    console.log(`Updated ${filename} perfectly`);
}

processFile('documents.html', 'documents');
processFile('support.html', 'support');
