// admin-dashboard.js — Full Admin Panel Logic
const API = `http://${location.hostname}:3000`;
let ALL_PORTS = [];

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || d.user?.role !== 'admin') {
            location.href = 'auth.html'; return;
        }
        document.getElementById('admin-name').innerText = d.user.name || d.user.email;
    } catch (e) { location.href = 'auth.html'; return; }

    // REAL-TIME SYNC: Hooks for socket-client.js
    window.fetchShipments = loadDashboard;
    window.fetchNotifications = loadBellNotifications;

    await loadSettings(); 
    loadDashboard();
    loadBellNotifications();

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.bell-wrap')) {
            const dd = document.getElementById('notif-dropdown');
            if (dd) dd.style.display = 'none';
        }
    });
});

async function handleLogout() {
    try {
        await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        localStorage.clear();
        location.href = 'index.html';
    } catch (e) { location.href = 'index.html'; }
}

// ── NAVIGATION ────────────────────────────────────────────────────
function showSection(name, el) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active'));

    const sec = document.getElementById(`section-${name}`);
    if (sec) sec.classList.add('active');
    if (el) el.classList.add('active');

    const titles = {
        dashboard: '📊 Dashboard Overview', users: '👥 User Management',
        companies: '🏢 Company Management', shipments: '📦 Shipment Management',
        ports: '⚓ Port Management', routes: '🛣️ Routes & Pricing',
        mapping: '🗺️ Route Mapping',
        documents: '📄 Document Verification', tracking: '🗺️ Tracking Management',
        analytics: '📈 Analytics & Reports', notifications: '🔔 Notifications',
        support: '🎫 Support Tickets', roles: '🛡️ Role Management',
        logs: '📋 System Logs', settings: '⚙️ System Settings'
    };
    const titleEl = document.getElementById('section-title');
    if (titleEl) titleEl.innerText = titles[name] || 'Admin Panel';

    // Lazy load data when section opens
    const loaders = {
        users: loadUsers, companies: loadCompanies, shipments: loadAdminShipments,
        documents: loadDocuments, tracking: loadTrackingLogs, analytics: loadAnalytics,
        notifications: loadNotifications, roles: loadRoles, logs: loadLogs,
        ports: loadPorts, routes: loadRoutes, mapping: initRouteMap, support: loadTickets, settings: loadSettings
    };
    if (loaders[name]) loaders[name]();
    return false;
}

// ── DASHBOARD ─────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const r = await fetch(`${API}/api/admin/stats/detailed`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) return;

        setV('kpi-users', d.users);
        setV('kpi-companies', d.companies);
        setV('kpi-active', d.activeShipments);
        setV('kpi-delivered', d.delivered);
        setV('kpi-docs', d.pendingDocs);
        setV('kpi-pending-bookings', d.pendingBookings);

        const cur = document.getElementById('set-currency')?.value || 'INR';
        const symbol = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur + ' ';
        const rev = d.revenue * (cur === 'INR' ? 84 : 1); // Mock conversion for dashboard
        setV('kpi-revenue', `${symbol}${Number(rev).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);

        // Badges
        setV('nav-badge-users', d.users);
        setV('nav-badge-docs', d.pendingDocs);
        if (document.getElementById('nav-badge-tickets')) setV('nav-badge-tickets', d.openTickets || 0);

        // Monthly chart
        if (d.monthly && d.monthly.length) {
            const months = d.monthly.map(m => m.month);
            const counts = d.monthly.map(m => Number(m.count));
            drawBarChart('chart-monthly', months, counts, 'Shipments', '#ef4444');
        }

        // Status distribution
        if (d.statusDist && d.statusDist.length) {
            const labels = d.statusDist.map(s => s.status);
            const vals = d.statusDist.map(s => Number(s.count));
            drawDoughnut('chart-status', labels, vals);
        }

        // Export/Import breakdown
        setV('kpi-exports', d.exports || '—');
        setV('kpi-imports', d.imports || '—');
    } catch (e) { console.error('Dashboard load error:', e); }

    // Recent shipments
    try {
        const r2 = await fetch(`${API}/api/admin/recent-shipments`, { credentials: 'include' });
        const d2 = await r2.json();
        const tbody = document.getElementById('dash-recent-body');
        if (!tbody) return;
        if (!d2.success || !d2.shipments.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-white-50 py-4">No recent shipments.</td></tr>'; return;
        }
        tbody.innerHTML = d2.shipments.map(s => `
            <tr>
                <td class="text-accent fw-bold font-monospace">${s.user_prefix || 'SS'}-${s.id}</td>
                <td class="text-white">${esc(s.customer_name || 'Account #' + s.customer_id)}</td>
                <td class="text-white-50 small">${shortRoute(s)}</td>
                <td>${statusBadge(s.status)}</td>
                <td class="text-white-50">$${Number(s.estimated_cost || 0).toLocaleString()}</td>
                <td class="text-white-50 small">${fmtDate(s.created_at)}</td>
            </tr>`).join('');
    } catch (e) { console.error('Recent shipments error:', e); }
}

// ── USERS ─────────────────────────────────────────────────────────
async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(7);
    try {
        const r = await fetch(`${API}/api/admin/users`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(7, d.message || 'Failed to load users'); return; }
        tbody.innerHTML = d.users.map(u => `
            <tr id="user-row-${u.id}">
                <td class="text-white-50 font-monospace">#${u.id}</td>
                <td class="text-white fw-semibold">${esc(u.name || '—')}</td>
                <td class="text-white-50">${esc(u.email)}</td>
                <td><span class="badge-role badge-${u.role}">${u.role}</span></td>
                <td>${statusBadge(u.company_status || 'active')}</td>
                <td class="text-white-50 small">${fmtDate(u.created_at)}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-admin-sm btn-block" onclick="blockUser(${u.id}, ${u.company_status === 'blocked' ? 'false' : 'true'})">
                            <i class="fas ${u.company_status === 'blocked' ? 'fa-unlock' : 'fa-ban'}"></i>
                            ${u.company_status === 'blocked' ? 'Unblock' : 'Block'}
                        </button>
                        <button class="btn-admin-sm btn-delete" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(7, 'Server error'); }
}

async function blockUser(id, block) {
    try {
        const r = await fetch(`${API}/api/admin/users/${id}/block`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block })
        });
        const d = await r.json();
        toast(d.message || 'Done', d.success ? 'success' : 'error');
        if (d.success) loadUsers();
    } catch (e) { toast('Error', 'error'); }
}

async function deleteUser(id) {
    if (!confirm('Delete this user permanently?')) return;
    try {
        const r = await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadUsers();
    } catch (e) { toast('Error', 'error'); }
}

// ── COMPANIES ─────────────────────────────────────────────────────
async function loadCompanies() {
    const tbody = document.getElementById('companies-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(6);
    try {
        const r = await fetch(`${API}/api/admin/companies`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(6, 'Failed to load companies'); return; }
        tbody.innerHTML = d.companies.map(c => `
            <tr id="comp-row-${c.id}">
                <td class="font-monospace text-white-50">#${c.id}</td>
                <td class="text-white fw-semibold">${esc(c.company_name || c.name || '—')}</td>
                <td class="text-white-50">${esc(c.email)}</td>
                <td><span class="badge-role badge-${c.company_status || 'pending'}">${c.company_status || 'pending'}</span></td>
                <td class="text-white-50 small">${fmtDate(c.created_at)}</td>
                <td>
                    <div class="d-flex gap-1">
                        ${c.company_status === 'pending' ? `
                            <button class="btn-admin-sm btn-approve" onclick="verifyCompany(${c.id}, 'approved')"><i class="fas fa-check"></i> Approve</button>
                            <button class="btn-admin-sm btn-reject" onclick="verifyCompany(${c.id}, 'rejected')"><i class="fas fa-times"></i> Reject</button>
                        ` : c.company_status === 'approved' ?
                `<button class="btn-admin-sm btn-block" onclick="verifyCompany(${c.id}, 'blocked')"><i class="fas fa-ban"></i> Deactivate</button>`
                : `<button class="btn-admin-sm btn-approve" onclick="verifyCompany(${c.id}, 'approved')"><i class="fas fa-check"></i> Activate</button>`
            }
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(6, 'Server error'); }
}

async function verifyCompany(id, status) {
    if (!confirm(`Are you sure you want to set company #${id} to ${status}?`)) return;
    try {
        let endpoint = '';
        if (status === 'approved') endpoint = '/api/admin/approve-company';
        else if (status === 'rejected') endpoint = '/api/admin/reject-company';
        else if (status === 'blocked') {
            return blockUser(id, true);
        }

        const r = await fetch(`${API}${endpoint}`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: id })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadCompanies();
    } catch (e) { toast('Server error', 'error'); }
}

// ── SHIPMENTS ─────────────────────────────────────────────────────
let ALL_ADMIN_SHIPMENTS = [];
async function loadAdminShipments() {
    const tbody = document.getElementById('shipments-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(9);
    try {
        const r = await fetch(`${API}/api/admin/shipments`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(9, 'Failed to load shipments'); return; }
        ALL_ADMIN_SHIPMENTS = d.shipments;

        // Apply filters
        let filtered = d.shipments;
        const statusFilter = document.getElementById('shipment-status-filter')?.value || '';
        const typeFilter = document.getElementById('shipment-type-filter')?.value || '';
        if (statusFilter) filtered = filtered.filter(s => (s.status || '').toLowerCase().includes(statusFilter.toLowerCase()));
        if (typeFilter) filtered = filtered.filter(s => (s.type || '').toLowerCase() === typeFilter.toLowerCase());

        renderAdminShipments(filtered);
    } catch (e) { tbody.innerHTML = errorRow(9, 'Server error'); }
}

function renderAdminShipments(shipments) {
    const tbody = document.getElementById('shipments-body');
    if (!shipments.length) { tbody.innerHTML = errorRow(9, 'No shipments found.'); return; }
    tbody.innerHTML = shipments.map(s => {
        const sType = (s.type || 'Export');
        const typeBadge = sType.toLowerCase() === 'import'
            ? '<span class="badge-role" style="background:rgba(16,185,129,0.15);color:#34d399;">Import</span>'
            : '<span class="badge-role" style="background:rgba(59,130,246,0.15);color:#60a5fa;">Export</span>';
        return `
        <tr id="ship-row-${s.id}">
            <td class="fw-bold font-monospace text-accent">${s.user_prefix || 'SS'}-${s.id}</td>
            <td class="text-white">${esc(s.customer_name || '—')}</td>
            <td class="text-white-50 small">${shortRoute(s)}</td>
            <td>${typeBadge}</td>
            <td class="text-white-50">${s.mode || 'Ocean'}</td>
            <td>${statusBadge(s.status)}</td>
            <td class="text-white-50">$${Number(s.estimated_cost || 0).toLocaleString()}</td>
            <td class="text-white-50 small">${fmtDate(s.created_at)}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn-admin-sm btn-approve" onclick="openStatusModal(${s.id},'${esc(s.status)}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-admin-sm btn-delete" onclick="cancelShipment(${s.id})"><i class="fas fa-ban"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function openStatusModal(id, status) {
    document.getElementById('modal-shipment-id').value = id;
    document.getElementById('modal-shipment-ref').value = `REF-${id}`; // Hide prefix in internal ref or logic if preferred, but user wants display
    const prefix = ALL_ADMIN_SHIPMENTS.find(s => s.id == id)?.user_prefix || 'SS';
    document.getElementById('modal-shipment-ref').value = `${prefix}-${id}`;
    document.getElementById('modal-new-status').value = status;
    openModal('status-modal');
}

async function submitStatusUpdate() {
    const id = document.getElementById('modal-shipment-id').value;
    const status = document.getElementById('modal-new-status').value;
    try {
        const r = await fetch(`${API}/api/admin/shipments/${id}/status`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) { closeModal('status-modal'); loadAdminShipments(); }
    } catch (e) { toast('Error', 'error'); }
}

async function cancelShipment(id) {
    const shipment = ALL_ADMIN_SHIPMENTS?.find(x => x.id == id);
    const prefix = shipment?.user_prefix || 'SS';
    if (!confirm(`Cancel / delete shipment ${prefix}-${id}?`)) return;
    const r = await fetch(`${API}/api/admin/shipments/${id}`, { method: 'DELETE', credentials: 'include' });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadAdminShipments();
}

// ── DOCUMENTS ─────────────────────────────────────────────────────
async function loadDocuments() {
    const tbody = document.getElementById('documents-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(7);
    try {
        const r = await fetch(`${API}/api/admin/documents`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(7, 'Failed to load documents'); return; }
        tbody.innerHTML = d.documents.map(doc => `
            <tr id="doc-row-${doc.id}">
                <td class="text-white fw-semibold">${esc(doc.doc_type || doc.name || 'Unnamed')}</td>
                <td class="text-white-50">${esc(doc.type || '—')}</td>
                <td class="text-info">${esc(doc.uploader_name || doc.uploader_email || '—')}</td>
                <td class="font-monospace text-white-50">${doc.shipment_id ? `${doc.user_prefix || 'SS'}-${doc.shipment_id}` : '—'}</td>
                <td>${statusBadge(doc.status)}</td>
                <td class="text-white-50 small">${fmtDate(doc.uploaded_at)}</td>
                <td>
                    <div class="d-flex gap-1">
                        ${doc.file_url ? `<a href="${doc.file_url}" target="_blank" class="btn-admin-sm btn-block"><i class="fas fa-eye"></i></a>` : ''}
                        <button class="btn-admin-sm btn-approve" onclick="verifyDoc(${doc.id},'Approved')"><i class="fas fa-check"></i></button>
                        <button class="btn-admin-sm btn-reject" onclick="verifyDoc(${doc.id},'Rejected')"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(7, 'Server error'); }
}

async function verifyDoc(id, status) {
    const r = await fetch(`${API}/api/admin/documents/${id}/status`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadDocuments();
}

// ── TRACKING ──────────────────────────────────────────────────────
async function loadTrackingLogs() {
    const el = document.getElementById('tracking-log');
    if (!el) return;
    try {
        const r = await fetch(`${API}/api/admin/logs`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.logs.length) {
            el.innerHTML = '<p class="text-white-50 small text-center py-4">No tracking events yet.</p>'; return;
        }
        el.innerHTML = d.logs.map(l => `
            <div class="tl-entry">
                <div class="tl-dot"><i class="fas fa-circle" style="font-size:6px;"></i></div>
                <div>
                    <div class="text-white small fw-semibold">${l.user_prefix || 'SS'}-${l.shipment_id} • ${esc(l.stage || '—')}</div>
                    <div class="text-white-50 x-small">${esc(l.description || '—')}</div>
                    <div class="text-muted" style="font-size:10px;">${fmtDate(l.updated_at)} • ${esc(l.user_name || '—')}</div>
                </div>
            </div>`).join('');
    } catch (e) { el.innerHTML = '<p class="text-danger small">Failed to load logs.</p>'; }
}

async function updateTracking() {
    const shipmentId = document.getElementById('track-shipment-id').value;
    const status = document.getElementById('track-status').value;
    const location = document.getElementById('track-location').value;
    const notes = document.getElementById('track-notes').value;
    if (!shipmentId) { toast('Enter a Shipment ID', 'error'); return; }
    try {
        const r = await fetch(`${API}/api/admin/tracking/update`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId, status, location, notes })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            document.getElementById('track-shipment-id').value = '';
            document.getElementById('track-notes').value = '';
            loadTrackingLogs();
        }
    } catch (e) { toast('Server error', 'error'); }
}

// ── ANALYTICS ─────────────────────────────────────────────────────
async function loadAnalytics() {
    try {
        const r = await fetch(`${API}/api/admin/stats/detailed`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) return;

        // 1. Monthly Trends
        const months = d.monthly.map(m => m.month);
        const counts = d.monthly.map(m => Number(m.count));
        const revenues = d.monthly.map(m => Number(m.revenue));

        drawBarChart('chart-monthly-2', months, counts, 'Shipments', '#ef4444');
        drawLineChart('chart-revenue', months, revenues, 'Revenue ($)', '#22c55e');

        // 2. Mode Distribution
        if (d.modes && d.modes.length) {
            drawDoughnut('chart-modes', d.modes.map(m => m.mode), d.modes.map(m => Number(m.count)));
        }

        // 3. Top Routes
        const routesTbody = document.getElementById('routes-analytics');
        if (routesTbody && d.topRoutes) {
            routesTbody.innerHTML = d.topRoutes.map(r => `
                <tr>
                    <td class="text-white small">${esc(r.route)}</td>
                    <td class="text-info">${r.count}</td>
                    <td class="text-success">$${Number(r.revenue).toLocaleString()}</td>
                </tr>`).join('');
        }

        // 4. Customer Activity
        const customerTbody = document.getElementById('customer-analytics');
        if (customerTbody && d.customerActivity) {
            customerTbody.innerHTML = d.customerActivity.map(c => `
                <tr>
                    <td class="text-white small">${esc(c.customer)}</td>
                    <td class="text-info">${c.shipments}</td>
                    <td class="text-success">$${Number(c.spent).toLocaleString()}</td>
                </tr>`).join('');
        }
    } catch (e) { console.error('Analytics error:', e); }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
async function loadNotifications() {
    const tbody = document.getElementById('notif-log');
    if (!tbody) return;
    try {
        const r = await fetch(`${API}/api/admin/notifications`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.notifications.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-white-50 py-4">No notifications sent yet.</td></tr>'; return;
        }
        tbody.innerHTML = d.notifications.map(n => `
            <tr>
                <td><span class="badge-role badge-${n.type === 'warning' ? 'pending' : n.type === 'success' ? 'approved' : 'company'}">${n.type}</span></td>
                <td class="text-white fw-semibold">${esc(n.title)}</td>
                <td class="text-white-50 small">${esc(n.message)}</td>
                <td class="text-white-50 small">${fmtDate(n.created_at)}</td>
            </tr>`).join('');
    } catch (e) { }
}

let BELL_NOTIFICATIONS = [];

async function loadBellNotifications() {
    try {
        const r = await fetch(`${API}/api/notifications`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) return;

        BELL_NOTIFICATIONS = d.notifications;
        renderBellNotifications();
    } catch (e) { console.error('Bell Error:', e); }
}

function renderBellNotifications() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-count');
    if (!list) return;

    const unread = BELL_NOTIFICATIONS.filter(n => !n.is_read).length;
    if (badge) {
        badge.innerText = unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    if (!BELL_NOTIFICATIONS.length) {
        list.innerHTML = `<div class="text-white-50 x-small text-center py-4">No new notifications</div>`;
        return;
    }

    list.innerHTML = BELL_NOTIFICATIONS.map((n, i) => `
        <div class="px-3 py-2 border-bottom border-secondary border-opacity-10 d-flex gap-2 align-items-start ${!n.is_read ? 'bg-primary bg-opacity-10' : ''}" style="cursor:pointer;" onclick="markBellRead(${i})">
            <div class="rounded-circle bg-dark d-flex align-items-center justify-content-center mt-1" style="width:28px;height:28px;flex-shrink:0;">
                <i class="fas ${n.type === 'error' ? 'fa-exclamation-circle text-danger' : n.type === 'success' ? 'fa-check-circle text-success' : 'fa-info-circle text-info'}" style="font-size:12px;"></i>
            </div>
            <div style="flex:1;">
                <div class="text-white small fw-bold" style="font-size:11px;">${esc(n.title)}</div>
                <div class="text-white-50 x-small" style="line-height:1.3;">${esc(n.message)}</div>
                <div class="text-muted mt-1" style="font-size:9px;">${fmtDate(n.created_at)}</div>
            </div>
            ${!n.is_read ? '<div class="rounded-circle bg-primary mt-1" style="width:6px;height:6px;flex-shrink:0;"></div>' : ''}
        </div>`).join('');
}

function toggleNotifs() {
    const dd = document.getElementById('notif-dropdown');
    if (dd) {
        const isShown = dd.style.display === 'block';
        dd.style.display = isShown ? 'none' : 'block';
        if (!isShown) loadBellNotifications();
    }
}

async function markBellRead(index) {
    const n = BELL_NOTIFICATIONS[index];
    if (!n || n.is_read) return;

    try {
        await fetch(`${API}/api/notifications/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId: n.id }),
            credentials: 'include'
        });
        n.is_read = true;
        renderBellNotifications();
    } catch (e) { }
}

async function markAllRead() {
    try {
        await fetch(`${API}/api/notifications/read-all`, {
            method: 'POST',
            credentials: 'include'
        });
        BELL_NOTIFICATIONS.forEach(n => n.is_read = true);
        renderBellNotifications();
    } catch (e) { }
}

async function sendNotification() {
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-msg').value.trim();
    const type = document.getElementById('notif-type').value;
    if (!title || !message) { toast('Please fill in title and message.', 'error'); return; }
    try {
        const r = await fetch(`${API}/api/admin/notify`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message, type })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            document.getElementById('notif-title').value = '';
            document.getElementById('notif-msg').value = '';
            loadNotifications();
        }
    } catch (e) { toast('Error sending notification', 'error'); }
}

// ── ROLES ─────────────────────────────────────────────────────────
async function loadRoles() {
    const tbody = document.getElementById('roles-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(5);
    try {
        const r = await fetch(`${API}/api/admin/users`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(5, 'Failed'); return; }
        tbody.innerHTML = d.users.map(u => `
            <tr>
                <td class="font-monospace text-white-50">#${u.id}</td>
                <td class="text-white">${esc(u.name || '—')}</td>
                <td class="text-white-50">${esc(u.email)}</td>
                <td><span class="badge-role badge-${u.role}">${u.role}</span></td>
                <td>
                    <div class="d-flex gap-2 align-items-center">
                        <select class="admin-select" id="role-select-${u.id}" style="width:140px;">
                            <option value="customer" ${u.role === 'customer' ? 'selected' : ''}>Customer</option>
                            <option value="company"  ${u.role === 'company' ? 'selected' : ''}>Company</option>
                            <option value="admin"    ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        <button class="btn-admin-sm btn-approve" onclick="changeRole(${u.id})">Apply</button>
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(5, 'Error'); }
}

async function changeRole(id) {
    const role = document.getElementById(`role-select-${id}`)?.value;
    if (!role) return;
    if (!confirm(`Change user #${id} role to "${role}"?`)) return;
    const r = await fetch(`${API}/api/admin/users/${id}/role`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadRoles();
}

// ── LOGS ──────────────────────────────────────────────────────────
async function loadLogs() {
    const tbody = document.getElementById('logs-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(5);
    try {
        const r = await fetch(`${API}/api/admin/logs`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.logs.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-white-50 py-4">No system logs found.</td></tr>'; return; }
        tbody.innerHTML = d.logs.map(l => `
            <tr>
                <td class="font-monospace text-accent">${l.user_prefix || 'SS'}-${l.shipment_id}</td>
                <td class="text-white fw-semibold">${esc(l.stage || '—')}</td>
                <td class="text-white-50 small">${esc(l.description || '—')}</td>
                <td class="text-info">${esc(l.user_name || '—')}</td>
                <td class="text-white-50 small">${fmtDate(l.updated_at)}</td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(5, 'Failed to load logs'); }
}

// ── SETTINGS ──────────────────────────────────────────────────────
async function loadSettings() {
    try {
        const r = await fetch(`${API}/api/admin/settings`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) return;
        const s = d.settings;
        if (document.getElementById('set-currency')) document.getElementById('set-currency').value = s.currency || 'INR';
        if (document.getElementById('set-units')) document.getElementById('set-units').value = s.unitSystem || 'metric';
        if (document.getElementById('set-tax')) document.getElementById('set-tax').value = s.taxRate || 18;
        if (document.getElementById('set-insurance')) document.getElementById('set-insurance').value = s.insuranceRate || 1.5;
        if (document.getElementById('set-fuel')) document.getElementById('set-fuel').value = s.fuelSurcharge || 8;
        if (document.getElementById('set-platform')) document.getElementById('set-platform').value = s.platformFee || 2;
    } catch (e) { }
}

async function saveSettings() {
    const settings = {
        currency: document.getElementById('set-currency').value,
        unitSystem: document.getElementById('set-units').value,
        taxRate: parseFloat(document.getElementById('set-tax').value),
        insuranceRate: parseFloat(document.getElementById('set-insurance').value),
        fuelSurcharge: parseFloat(document.getElementById('set-fuel').value),
        platformFee: parseFloat(document.getElementById('set-platform').value),
    };
    try {
        const r = await fetch(`${API}/api/admin/settings`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
    } catch (e) { toast('Error saving settings', 'error'); }
}

// ── PORTS ─────────────────────────────────────────────────────────
async function loadPorts() {
    const tbody = document.getElementById('ports-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(7);
    try {
        const r = await fetch(`${API}/api/admin/ports`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(7, 'Failed to load ports'); return; }

        ALL_PORTS = d.ports;
        populatePortSelects();
        renderStateSummary(d.ports);

        const congestionColors = { Low: 'approved', Medium: 'pending', High: 'rejected' };
        tbody.innerHTML = d.ports.map(p => `
            <tr>
                <td class="text-white fw-semibold">${esc(p.name)}</td>
                <td class="text-white-50">${esc(p.country)}</td>
                <td class="text-white-50 small">${esc(p.state || '—')}</td>
                <td class="font-monospace text-info">${esc(p.code)}</td>
                <td><span class="badge-role badge-${congestionColors[p.congestion] || 'pending'}">${p.congestion}</span></td>
                <td class="text-white-50">${p.handling_days || 2} days</td>
                <td class="text-white-50">$${p.cost_per_cbm}/unit</td>
                <td>
                    <button class="btn-admin-sm btn-delete" onclick="deletePort(${p.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(7, 'Server error'); }
}

function populatePortSelects() {
    const s1 = document.getElementById('route-from');
    const s2 = document.getElementById('route-to');
    if (!s1 || !s2) return;
    const opts = ALL_PORTS.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.code)})</option>`).join('');
    const ph1 = '<option value="">Select Origin Port...</option>';
    const ph2 = '<option value="">Select Destination Port...</option>';
    s1.innerHTML = ph1 + opts;
    s2.innerHTML = ph2 + opts;
}

function renderStateSummary(ports) {
    const wrap = document.getElementById('state-summary-wrap');
    const grid = document.getElementById('state-stats-grid');
    if (!wrap || !grid) return;

    if (!ports.length) { wrap.style.display = 'none'; return; }

    const states = {};
    ports.forEach(p => {
        const key = `${p.country} - ${p.state || 'Other'}`;
        states[key] = (states[key] || 0) + 1;
    });

    const entries = Object.entries(states).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) { wrap.style.display = 'none'; return; }

    wrap.style.display = 'block';
    grid.innerHTML = entries.map(([name, count]) => `
        <div class="col-md-3 col-sm-6">
            <div class="kpi-card h-100 py-3" style="background:rgba(96,165,250,0.05); border-color:rgba(96,165,250,0.1);">
                <div class="kpi-label" style="font-size:0.6rem; color:#93c5fd;">${name}</div>
                <div class="d-flex align-items-center justify-content-between mt-1">
                    <div class="kpi-value" style="font-size:1.3rem;">${count}</div>
                    <div class="text-white-50 small"><i class="fas fa-anchor opacity-50"></i></div>
                </div>
                <div class="progress mt-2" style="height:3px; background:rgba(255,255,255,0.05);">
                    <div class="progress-bar bg-info" style="width:${Math.min(100, (count / ports.length) * 100)}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

async function addPort() {
    const payload = {
        name: document.getElementById('port-name').value,
        country: document.getElementById('port-country').value,
        state: document.getElementById('port-state').value,
        code: document.getElementById('port-code').value,
        congestion: document.getElementById('port-congestion').value,
        cost_per_cbm: parseFloat(document.getElementById('port-cost').value || 0),
        latitude: parseFloat(document.getElementById('port-lat').value) || null,
        longitude: parseFloat(document.getElementById('port-lng').value) || null
    };
    try {
        const r = await fetch(`${API}/api/admin/ports`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) { closeModal('port-modal'); loadPorts(); }
    } catch (e) { toast('Error adding port', 'error'); }
}

async function deletePort(id) {
    if (!confirm('Delete this port permanently?')) return;
    try {
        const r = await fetch(`${API}/api/admin/ports/${id}`, { method: 'DELETE', credentials: 'include' });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadPorts();
    } catch (e) { toast('Error deleting port', 'error'); }
}

// ── ROUTES ────────────────────────────────────────────────────────
async function loadRoutes() {
    const tbody = document.getElementById('routes-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(8);
    try {
        const r = await fetch(`${API}/api/admin/routes`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(8, 'Failed to load routes'); return; }
        tbody.innerHTML = d.routes.map(r => `
            <tr>
                <td class="text-white fw-semibold">${esc(r.from_port)}</td>
                <td class="text-white fw-semibold">${esc(r.to_port)}</td>
                <td class="text-white-50">${esc(r.mode)}</td>
                <td class="text-info">${r.duration_days} days</td>
                <td class="text-success">$${r.base_price_per_cbm}/CBM</td>
                <td>${r.is_fastest ? '<span class="badge-role badge-approved">Fastest</span>' : '—'}</td>
                <td>${r.is_cheapest ? '<span class="badge-role badge-company">Cheapest</span>' : '—'}</td>
                <td>
                    <button class="btn-admin-sm btn-delete" onclick="deleteRoute(${r.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(8, 'Server error'); }
}

async function addRoute() {
    const payload = {
        from_port_id: parseInt(document.getElementById('route-from').value),
        to_port_id: parseInt(document.getElementById('route-to').value),
        mode: document.getElementById('route-mode').value,
        duration_days: parseInt(document.getElementById('route-days').value),
        base_price_per_cbm: parseInt(document.getElementById('route-price').value),
        carrier_name: document.getElementById('route-carrier').value,
        distance_km: parseFloat(document.getElementById('route-distance').value),
        co2_per_kg: parseFloat(document.getElementById('route-co2').value),
        is_fastest: document.getElementById('route-fastest').checked,
        is_cheapest: document.getElementById('route-cheapest').checked
    };
    try {
        const r = await fetch(`${API}/api/admin/routes`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) { closeModal('route-modal'); loadRoutes(); }
    } catch (e) { toast('Error adding route', 'error'); }
}

async function deleteRoute(id) {
    if (!confirm('Delete this route?')) return;
    try {
        const r = await fetch(`${API}/api/admin/routes/${id}`, { method: 'DELETE', credentials: 'include' });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadRoutes();
    } catch (e) { toast('Error', 'error'); }
}

// ── SUPPORT TICKETS ───────────────────────────────────────────────
async function loadTickets() {
    const tbody = document.getElementById('tickets-body');
    if (!tbody) return;
    tbody.innerHTML = loadingRow(7);
    try {
        const r = await fetch(`${API}/api/admin/tickets`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errorRow(7, 'Failed to load tickets'); return; }
        if (!d.tickets.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-white-50 py-5">No tickets found.</td></tr>'; return; }
        tbody.innerHTML = d.tickets.map(t => `
            <tr>
                <td class="font-monospace text-accent small">TKT-${t.id}</td>
                <td class="text-white small">${esc(t.user_name)}<br><small class="text-white-50">${esc(t.user_email)}</small></td>
                <td class="text-info small">${t.shipment_id ? `${t.user_prefix || 'SS'}-${t.shipment_id}` : 'General'}</td>
                <td class="text-white-50 small"><strong>${esc(t.issue_type)}</strong>: ${esc(t.description)}</td>
                <td><span class="badge-role badge-${t.status.toLowerCase()}">${t.status}</span></td>
                <td class="text-white-50 small">${fmtDate(t.created_at)}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-admin-sm btn-approve" onclick="updateTicketStatus(${t.id}, 'Resolved')"><i class="fas fa-check"></i></button>
                        <button class="btn-admin-sm btn-reject" onclick="updateTicketStatus(${t.id}, 'Closed')"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errorRow(7, 'Server error'); }
}

async function updateTicketStatus(id, status) {
    try {
        const r = await fetch(`${API}/api/admin/tickets/${id}`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, priority: 'Medium' })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadTickets();
    } catch (e) { toast('Error', 'error'); }
}

// ── SEARCH / FILTER ───────────────────────────────────────────────
function filterTable(tbodyId, searchId, cols) {
    const q = (document.getElementById(searchId)?.value || '').toLowerCase();
    const rows = document.querySelectorAll(`#${tbodyId} tr`);
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const match = cols.some(c => cells[c]?.innerText.toLowerCase().includes(q));
        row.style.display = (!q || match) ? '' : 'none';
    });
}

// ── CHARTS ────────────────────────────────────────────────────────
function drawBarChart(id, labels, data, label, color) {
    const el = document.getElementById(id);
    if (!el) return;
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
    new Chart(el, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{ label, data: data.length ? data : [2, 5, 8, 3, 9, 6], backgroundColor: color + '55', borderColor: color, borderWidth: 2, borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#888' }, grid: { color: '#1a2035' } }, y: { ticks: { color: '#888' }, grid: { color: '#1a2035' } } } }
    });
}

function drawLineChart(id, labels, data, label, color) {
    const el = document.getElementById(id);
    if (!el) return;
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
    new Chart(el, {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{ label, data: data.length ? data : [1200, 2400, 1800, 3200, 2900, 4100], borderColor: color, backgroundColor: color + '18', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#888' }, grid: { color: '#1a2035' } }, y: { ticks: { color: '#888' }, grid: { color: '#1a2035' } } } }
    });
}

function drawDoughnut(id, labels, data) {
    const el = document.getElementById(id);
    if (!el) return;
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];
    new Chart(el, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 6 }] },
        options: { responsive: true, cutout: '70%', plugins: { legend: { labels: { color: '#888', font: { size: 11 } } } } }
    });
}

// ── MODALS ────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id, e) {
    if (!e || e.target.id === id) document.getElementById(id).style.display = 'none';
}

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
    const icons = { success: 'fa-check-circle text-success', error: 'fa-times-circle text-danger', info: 'fa-info-circle text-info', warning: 'fa-exclamation-circle text-warning' };
    const el = document.getElementById('admin-toast');
    const item = document.createElement('div');
    item.className = `toast-item ${type}`;
    item.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span class="text-white small">${esc(msg)}</span>`;
    el.appendChild(item);
    setTimeout(() => item.remove(), 3500);
}

// ── HELPERS ───────────────────────────────────────────────────────
function setV(id, v) { const el = document.getElementById(id); if (el) el.innerText = v; }
function esc(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function shortRoute(s) { return `${(s.origin_address || s.from_country || '—').substring(0, 18)} → ${(s.destination_address || s.to_country || '—').substring(0, 18)}`; }
function loadingRow(cols) { return `<tr><td colspan="${cols}" class="text-center py-4 text-white-50"><div class="spinner-border spinner-border-sm text-danger me-2"></div>Loading...</td></tr>`; }
function errorRow(cols, msg) { return `<tr><td colspan="${cols}" class="text-center py-4 text-white-50">${esc(msg)}</td></tr>`; }

function statusBadge(s) {
    const map = {
        'approved': 'approved', 'verified': 'verified', 'Verified': 'verified',
        'pending': 'pending', 'Submitted': 'submitted', 'booked': 'pending', 'Booked': 'pending',
        'Accepted': 'approved', 'Declined': 'rejected',
        'rejected': 'rejected', 'Rejected': 'rejected', 'blocked': 'blocked', 'cancelled': 'rejected',
        'In Transit': 'transit', 'transit': 'transit', 'Delivered': 'delivered', 'delivered': 'delivered'
    };
    const cls = map[s] || 'pending';
    return `<span class="badge-role badge-${cls}">${esc(s)}</span>`;
}

// ── ROUTE MAPPING ──────────────────────────────────────────────────
let adminMap;
async function initRouteMap() {
    // Small delay to ensure container is visible before Leaflet calculates size
    setTimeout(async () => {
        if (!adminMap) {
            // Set local image path for markers
            L.Icon.Default.imagePath = 'dist/images/';

            adminMap = L.map('route-map').setView([20, 10], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; CARTO'
            }).addTo(adminMap);
        } else {
            adminMap.invalidateSize();
        }

        // Clear existing layers (markers and lines)
        adminMap.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.Polyline) {
                adminMap.removeLayer(layer);
            }
        });

        try {
            const [pRes, rRes] = await Promise.all([
                fetch(`${API}/api/admin/ports`, { credentials: 'include' }),
                fetch(`${API}/api/admin/routes`, { credentials: 'include' })
            ]);
            const pData = await pRes.json();
            const rData = await rRes.json();

            const portCoords = {};
            if (pData.success) {
                pData.ports.forEach(p => {
                    if (p.latitude && p.longitude) {
                        const marker = L.circleMarker([p.latitude, p.longitude], {
                            radius: 6,
                            fillColor: "#3b82f6",
                            color: "#fff",
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).addTo(adminMap).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.code)}`);
                        portCoords[p.id] = [p.latitude, p.longitude];
                    }
                });
            }

            if (rData.success) {
                rData.routes.forEach(r => {
                    const start = portCoords[r.from_port_id];
                    const end = portCoords[r.to_port_id];
                    if (start && end) {
                        L.polyline([start, end], {
                            color: '#ef4444',
                            weight: 2,
                            opacity: 0.6,
                            dashArray: r.mode === 'Air' ? '5, 10' : null
                        }).addTo(adminMap).bindPopup(`${esc(r.from_port)} → ${esc(r.to_port)} (${esc(r.mode)})`);
                    }
                });
            }

            // --- FLEET GLOBAL VIEW (Live Ships) ---
            const fRes = await fetch(`${API}/api/v3/tracking/all-ships`, { credentials: 'include' });
            const fData = await fRes.json();
            if (fData.success) {
                fData.ships.forEach(s => {
                    if (s.current_lat && s.current_lng) {
                        const icon = L.divIcon({
                            html: `<i class="fas fa-ship fa-lg" style="color:#fbbf24; filter: drop-shadow(0 0 4px #fbbf24);"></i>`,
                            className: 'vessel-icon', iconSize: [20, 20]
                        });
                        L.marker([s.current_lat, s.current_lng], { icon })
                            .addTo(adminMap)
                            .bindPopup(`
                                <div class="text-white p-1">
                                    <h6 class="mb-1">${esc(s.name)}</h6>
                                    <div class="small fw-bold text-warning mb-1">${esc(s.status)}</div>
                                    <div class="x-small text-white-50">Current: ${esc(s.current_port || 'At Sea')}</div>
                                    <div class="x-small text-white-50">Active Shipments: ${s.active_shipments || 0}</div>
                                </div>
                             `);
                    }
                });
            }
        } catch (err) { console.error("Map fleet & initialization error:", err); }
    }, 100);
}
