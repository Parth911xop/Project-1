// nav.js — Smart, workflow-aware navigation bar
// Shows marketing links for guests, full workflow nav for logged-in exporters.

(function () {
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const API_BASE = `http://${window.location.hostname}:3000`;

    // Helper: mark active link
    function isActive(href) {
        return currentPage === href ? ' active fw-semibold' : '';
    }

    // ─── GUEST NAVBAR (not logged in) ─────────────────────────────────────────
    const guestBookingDropdown = `
        <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle${isActive('wizard.html')}" href="#" role="button" data-bs-toggle="dropdown">Booking</a>
            <div class="dropdown-menu glass border-0 shadow-lg p-3" style="min-width:260px;">
                <a href="wizard.html?type=ocean" class="dropdown-item rounded-2 py-2">
                    <i class="fas fa-ship me-2 text-primary"></i>
                    <strong>Ocean Transport</strong>
                    <span class="d-block small text-muted ms-4" style="margin-top:-2px;">Full container & FCL ocean shipments</span>
                </a>
                <a href="wizard.html?type=lcl" class="dropdown-item rounded-2 py-2">
                    <i class="fas fa-boxes me-2 text-info"></i>
                    <strong>LCL Shipping</strong>
                    <span class="d-block small text-muted ms-4" style="margin-top:-2px;">Shared container for smaller cargo</span>
                </a>
                <div class="dropdown-divider border-secondary opacity-25"></div>
                <a href="wizard.html" class="dropdown-item rounded-2 py-2">
                    <i class="fas fa-bolt me-2 text-warning"></i>Get an Instant Quote
                </a>
            </div>
        </li>`;

    const guestLinks = [
        { href: 'prices.html', label: 'Prices' },
        { href: 'services.html', label: 'Services' },
        { href: 'track.html', label: 'Tracking' },
        { href: 'schedules.html', label: 'Schedules' },
        { href: 'company.html', label: 'For Companies' },
    ].map(l => `
        <li class="nav-item">
            <a class="nav-link${isActive(l.href)}" href="${l.href}">${l.label}</a>
        </li>`).join('');

    // ─── LOGGED-IN WORKFLOW NAVBAR ─────────────────────────────────────────────
    // Reflects real exporter workflow step-by-step.

    const exportWorkflowLinks = [
        {
            href: '#',
            label: 'Ship',
            icon: 'fa-box',
            dropdown: [
                { href: 'wizard.html', icon: 'fa-magic', color: 'text-primary', label: 'New Booking', sub: 'Get a quote & book instantly' },
                { href: 'shipments.html', icon: 'fa-th-list', color: 'text-info', label: 'My Shipments', sub: 'Track all active & past bookings' },
                { href: 'create-packing-list.html', icon: 'fa-clipboard-list', color: 'text-warning', label: 'Packing List', sub: 'Itemize cargo for customs' },
            ]
        },
        {
            href: '#',
            label: 'Documents',
            icon: 'fa-file-alt',
            dropdown: [
                { href: 'documents.html', icon: 'fa-folder-open', color: 'text-primary', label: 'All Documents', sub: 'Bills of lading, invoices, certs' },
                { href: 'customs.html', icon: 'fa-stamp', color: 'text-warning', label: 'Customs Declarations', sub: 'HS codes & clearance filings' },
                { href: 'invoice.html', icon: 'fa-file-invoice', color: 'text-success', label: 'Commercial Invoice', sub: 'View & download invoices' },
            ]
        },
        {
            href: 'schedules.html',
            label: 'Schedules',
            icon: 'fa-calendar-alt',
            dropdown: null,
        },
        {
            href: 'track.html',
            label: 'Live Track',
            icon: 'fa-map-marked-alt',
            dropdown: null,
        },
        {
            href: 'finance.html',
            label: 'Billing',
            icon: 'fa-wallet',
            dropdown: null,
        },
        {
            href: 'support.html',
            label: 'Support',
            icon: 'fa-headset',
            dropdown: null,
        },
    ];

    function buildWorkflowLinks(links) {
        return links.map(item => {
            if (!item.dropdown) {
                return `
                <li class="nav-item">
                    <a class="nav-link${isActive(item.href)}" href="${item.href}">
                        <i class="fas ${item.icon} me-1 opacity-75"></i> ${item.label}
                    </a>
                </li>`;
            }
            return `
            <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle${isActive(item.href)}" href="#" data-bs-toggle="dropdown">
                    <i class="fas ${item.icon} me-1 opacity-75"></i> ${item.label}
                </a>
                <div class="dropdown-menu glass border-0 shadow-lg p-2" style="min-width: 280px;">
                    ${item.dropdown.map(d => `
                    <a href="${d.href}" class="dropdown-item rounded-2 py-2 px-3 d-flex align-items-start gap-3">
                        <i class="fas ${d.icon} ${d.color} mt-1" style="width: 18px;"></i>
                        <div>
                            <strong class="d-block text-white small">${d.label}</strong>
                            <span class="text-muted x-small">${d.sub}</span>
                        </div>
                    </a>`).join('')}
                </div>
            </li>`;
        }).join('');
    }

    // ─── BASE NAV TEMPLATE ─────────────────────────────────────────────────────
    function buildNav(middleContent) {
        return `
        <nav class="navbar navbar-expand-lg navbar-dark fixed-top glass-nav" id="main-nav">
            <div class="container-fluid px-4">
                <a class="navbar-brand fw-bold d-flex align-items-center gap-2" href="index.html">
                    <i class="fas fa-ship text-primary"></i>Smart Shipping
                </a>
                <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#mainMenu">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="mainMenu">
                    <ul class="navbar-nav mx-auto mb-2 mb-lg-0 fw-medium gap-1">
                        ${middleContent}
                    </ul>
                    <div class="d-flex align-items-center gap-3 ms-3" id="nav-auth-area">
                        <a href="auth.html" class="btn btn-primary px-4 rounded-pill shadow-sm">Login / Sign Up</a>
                    </div>
                </div>
            </div>
        </nav>`;
    }

    // ─── INJECT & HYDRATE ──────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const existing = document.querySelector('nav.navbar');
        if (existing) existing.remove();

        // Start with guest nav, then upgrade if logged in
        const guestNav = buildNav(guestBookingDropdown + guestLinks);
        document.body.insertAdjacentHTML('afterbegin', guestNav);

        // Fetch user session
        fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (!data.success || !data.user) return; // Stay on guest nav

                const user = data.user;
                const initial = (user.name || 'U').charAt(0).toUpperCase();

                // Swap to workflow nav for logged-in users
                const workflowNav = buildNav(buildWorkflowLinks(exportWorkflowLinks));
                document.querySelector('nav.navbar').remove();
                document.body.insertAdjacentHTML('afterbegin', workflowNav);

                // Role badge
                const roleBadge = user.role === 'company'
                    ? (user.companyStatus === 'approved'
                        ? `<span class="badge bg-success x-small mt-1"><i class="fas fa-check-circle me-1"></i>Verified Exporter</span>`
                        : `<span class="badge bg-warning text-dark x-small mt-1">Pending Exporter</span>`)
                    : `<span class="badge bg-info bg-opacity-25 text-info x-small mt-1">Customer</span>`;

                // Swap auth area
                document.getElementById('nav-auth-area').innerHTML = `
                    <!-- Notification Bell -->
                    <div class="dropdown me-2">
                        <div class="notification-bell-wrapper dropdown-toggle no-caret" data-bs-toggle="dropdown" id="notif-bell">
                            <i class="fas fa-bell text-white opacity-75 fs-5"></i>
                            <span class="notification-badge d-none" id="notif-count">0</span>
                        </div>
                        <div class="dropdown-menu dropdown-menu-end notifications-dropdown shadow-lg p-0" id="notif-dropdown">
                            <div class="notif-header">
                                <span class="text-white fw-bold">Notifications</span>
                                <button class="btn btn-link btn-sm text-primary p-0 text-decoration-none x-small" onclick="window.markAllNotifsRead()">Mark all as read</button>
                            </div>
                            <div id="notif-items-container">
                                <div class="notif-empty">Loading notifications...</div>
                            </div>
                            <div class="notif-footer">
                                <a href="#" class="text-muted x-small text-decoration-none">View All Activity</a>
                            </div>
                        </div>
                    </div>

                    <div class="dropdown">
                        <button class="btn btn-dark border border-secondary rounded-pill pe-3 ps-2 py-1 d-flex align-items-center gap-2 dropdown-toggle shadow-none"
                            data-bs-toggle="dropdown">
                            <span class="d-flex align-items-center justify-content-center bg-primary rounded-circle text-white fw-bold"
                                style="width:28px;height:28px;font-size:.85rem;">${initial}</span>
                            <span class="text-white fw-medium small">${user.name || 'Account'}</span>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end glass border-0 shadow-lg mt-2 p-2" style="min-width:240px;">
                            <!-- User info header -->
                            <li class="px-3 py-2 border-bottom border-secondary border-opacity-25 mb-2">
                                <div class="d-flex align-items-center gap-3">
                                    <div class="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                                        style="width:40px;height:40px;font-size:1.1rem;">${initial}</div>
                                    <div>
                                        <h6 class="mb-0 text-white fw-bold">${user.name || 'User'}</h6>
                                        ${roleBadge}
                                    </div>
                                </div>
                            </li>
                            <li><a class="dropdown-item rounded-2 py-2" href="shipments.html"><i class="fas fa-th-large me-3 text-primary"></i>Dashboard</a></li>
                            <li><a class="dropdown-item rounded-2 py-2" href="profile.html"><i class="fas fa-user-circle me-3 text-muted"></i>Profile</a></li>
                            <li><a class="dropdown-item rounded-2 py-2" href="settings.html"><i class="fas fa-cog me-3 text-muted"></i>Settings</a></li>
                            <li><a class="dropdown-item rounded-2 py-2" href="support.html"><i class="fas fa-headset me-3 text-info"></i>Support</a></li>
                            <li><hr class="dropdown-divider border-secondary opacity-25"></li>
                            <li>
                                <button class="dropdown-item rounded-2 py-2 text-danger fw-bold"
                                    onclick="fetch('${API_BASE}/api/auth/logout',{method:'POST',credentials:'include'}).then(()=>location.href='index.html')">
                                    <i class="fas fa-sign-out-alt me-3"></i>Logout
                                </button>
                            </li>
                        </ul>
                    </div>`;
            })
            .catch(() => { }); // Silent fail → show guest nav

        // Notification Logic
        window.fetchNotifications = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/notifications`, { credentials: 'include' });
                const data = await res.json();
                if (data.success) {
                    renderNotifications(data.notifications);
                }
            } catch (e) { console.error('Failed to fetch notifications', e); }
        };

        function renderNotifications(notifs) {
            const container = document.getElementById('notif-items-container');
            const countBadge = document.getElementById('notif-count');
            if (!container) return;

            const unreadCount = notifs.filter(n => !n.is_read).length;
            if (unreadCount > 0) {
                countBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                countBadge.classList.remove('d-none');
            } else {
                countBadge.classList.add('d-none');
            }

            if (notifs.length === 0) {
                container.innerHTML = '<div class="notif-empty">No new notifications</div>';
                return;
            }

            container.innerHTML = notifs.map(n => `
                <div class="notif-item ${n.is_read ? '' : 'unread'} d-flex gap-3 align-items-center" onclick="window.markNotifRead(${n.id}, '${n.link}')">
                    <div class="notif-dot"></div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-center">
                            <strong class="text-white small">${n.title}</strong>
                            <span class="text-muted" style="font-size: 10px;">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p class="text-muted x-small mb-0 mt-1">${n.message}</p>
                    </div>
                </div>
            `).join('');
        }

        window.markNotifRead = async (id, link) => {
            try {
                await fetch(`${API_BASE}/api/notifications/read`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notificationId: id }),
                    credentials: 'include'
                });
                if (link && link !== 'null' && link !== '') window.location.href = link;
                else window.fetchNotifications();
            } catch (e) { }
        };

        window.markAllNotifsRead = async () => {
            try {
                await fetch(`${API_BASE}/api/notifications/read-all`, {
                    method: 'POST',
                    credentials: 'include'
                });
                window.fetchNotifications();
            } catch (e) { }
        };

        // Initial fetch and faster poll for real-time smoothness
        setTimeout(() => {
            if (document.getElementById('notif-bell')) {
                window.fetchNotifications();
                setInterval(window.fetchNotifications, 12000); // 12s for snappier feedback
            }
        }, 800);
    });
})();
