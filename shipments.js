// ─────────────────────────────────────────────────────────────────
// shipments.js  — Full Dashboard Logic
// Features: Shipments list, 5-step timeline, Search & Filter,
//           Notification Bell, KPI counters, Activity Feed,
//           Support Tickets widget, Slide-in Detail Panel
// ─────────────────────────────────────────────────────────────────
const API_URL = ''; // Matches active server port automatically
window.ALL_SHIPMENTS = [];
window.NOTIFICATIONS = [];

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const r = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        const d = await r.json();
        if (d.success && d.user) updateUserProfile(d.user);
    } catch (e) { /* auth-guard handles it */ }

    // REAL-TIME SYNC: Hook for socket-client.js to trigger refreshes
    window.fetchShipments = fetchShipments;
    window.fetchNotifications = buildNotifications;

    await fetchShipments();
    buildNotifications();
    loadActivityFeed();
    loadSupportTickets();
    initQuickChips();

    // Close notification if click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.notif-bell-wrap')) {
            const d = document.getElementById('notif-dropdown');
            if (d) d.classList.remove('show');
        }
    });
});

function updateUserProfile(user) {
    const name = user?.name || 'User';
    const el = document.getElementById('user-name-display');
    const av = document.getElementById('user-avatar');
    const rl = document.getElementById('user-role-display');
    if (el) el.innerText = name;
    if (av) {
        av.innerText = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    if (rl) rl.innerText = user.role === 'company' ? 'Company' : user.role === 'admin' ? 'Admin' : 'Exporter';
}

// ── FETCH SHIPMENTS ───────────────────────────────────────────────
async function fetchShipments() {
    const body = document.getElementById('shipments-body');
    try {
        const res = await fetch(`${API_URL}/api/shipment/list`, { credentials: 'include' });
        const data = await res.json();

        if (data.success) {
            window.ALL_SHIPMENTS = data.shipments || [];
            renderTable(window.ALL_SHIPMENTS);
            updateKPIs(window.ALL_SHIPMENTS);
        } else {
            body.innerHTML = emptyRow('Failed to load shipments.');
        }
    } catch (err) {
        console.error(err);
        body.innerHTML = emptyRow('Cannot reach server. Is the backend running?');
    }
}

// ── RENDER TABLE ──────────────────────────────────────────────────
function renderTable(shipments) {
    const body = document.getElementById('shipments-body');
    const countEl = document.getElementById('filter-result-count');
    const sidebarCount = document.getElementById('sidebar-shipment-count');
    if (sidebarCount) sidebarCount.innerText = shipments.length;
    if (countEl) countEl.innerText = `${shipments.length} result${shipments.length !== 1 ? 's' : ''}`;

    if (!shipments.length) {
        body.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-white-50">
            <i class="fas fa-inbox fa-2x mb-3 d-block opacity-25"></i>
            No shipments found. <a href="wizard.html" class="text-primary">Book your first shipment</a>.
        </td></tr>`;
        return;
    }

    body.innerHTML = shipments.map(s => {
        const step = getStep(s.status);
        const mode = (s.mode || 'ocean').toLowerCase();
        const modeIcon = mode.includes('air') ? 'fa-plane' : 'fa-ship';
        const modeLabel = mode.includes('air') ? 'Air' : 'Ocean';
        const sType = (s.type || 'Export');
        const typeBadge = sType.toLowerCase() === 'import'
            ? '<span class="badge bg-success bg-opacity-15" style="color:#34d399;font-size:0.68rem;">Import</span>'
            : '<span class="badge bg-primary bg-opacity-15" style="color:#60a5fa;font-size:0.68rem;">Export</span>';
        const cost = Number(s.estimated_cost || 0) * 84; // USD → INR approx
        const surge = cost * 0.08;
        const total = cost + surge;
        const container = s.container_id || `MSCU${String(s.id).padStart(7, '0')}`;
        const eta = estimateETA(s);

        return `
        <tr onclick="openPanel(${s.id})" style="cursor:pointer;">
            <td class="fw-bold text-accent font-monospace text-nowrap">${s.user_prefix || 'SS'}-${s.id}</td>
            <td class="text-white-50 x-small font-monospace text-nowrap">${container}</td>
            <td>
                <div class="text-white small fw-semibold text-nowrap" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;">
                    ${s.origin_address || s.from_country || '—'}
                </div>
                <div class="text-muted x-small text-nowrap" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;">
                    → ${s.destination_address || s.to_country || '—'}
                </div>
            </td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <i class="fas ${modeIcon} text-muted small"></i>
                    ${typeBadge}
                    ${renderStatusPill(s.status)}
                </div>
            </td>
            <td>${renderTimeline5(step)}</td>
            <td class="text-white-50 x-small text-nowrap">${eta}</td>
            <td class="text-end text-nowrap">
                <span class="text-white small fw-semibold">₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-icon text-accent hover-bg rounded-2" onclick="event.stopPropagation(); openPanel(${s.id})" title="View Details">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ── 5-STEP TIMELINE ───────────────────────────────────────────────
const STEPS = [
    { key: 'booked', label: 'Booking Request', icon: 'fa-file-invoice' },
    { key: 'allocated', label: 'Ship Allocated', icon: 'fa-ship' },
    { key: 'port', label: 'Cargo at Port', icon: 'fa-warehouse' },
    { key: 'transit', label: 'In Transit', icon: 'fa-anchor' },
    { key: 'done', label: 'Delivered', icon: 'fa-home' },
];

function getStep(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('deliver')) return 5;
    if (s.includes('transit')) return 4;
    if (s.includes('port') || s.includes('ready') || s.includes('paid') || s.includes('doc')) return 3;
    if (s.includes('ship allocated') || s.includes('details') || s.includes('assigned')) return 2;
    if (s.includes('completed')) return 5;
    if (s.includes('pending manager approval') || s.includes('booked') || s.includes('pending')) return 1;
    return 1;
}

function renderTimeline5(step) {
    const segments = [];
    for (let i = 0; i < STEPS.length; i++) {
        const s = STEPS[i];
        const isDone = step > i + 1;
        const isActive = step === i + 1;
        const dotClass = isDone ? 'done' : isActive ? 'active' : 'pending';
        const icon = isDone ? 'fa-check' : s.icon;

        segments.push(`
            <div class="tstep">
                <div class="tstep-dot ${dotClass}"><i class="fas ${icon}"></i></div>
                <div class="tstep-label ${dotClass}">${s.label}</div>
            </div>`);

        if (i < STEPS.length - 1) {
            const lineClass = step > i + 1 ? 'done' : '';
            segments.push(`<div class="tstep-line ${lineClass}"></div>`);
        }
    }
    return `<div class="timeline-5step">${segments.join('')}</div>`;
}

function renderStatusPill(status) {
    const s = (status || 'booked').toLowerCase();
    let cls = 'booked', label = status || 'Booked';

    if (s.includes('deliver')) { cls = 'delivered'; label = 'Delivered'; }
    else if (s.includes('arriv') || s.includes('clear') || s.includes('out for delivery')) { cls = 'arrived'; label = status; }
    else if (s.includes('transit')) { cls = 'transit'; label = 'In Transit'; }
    else if (s.includes('details')) { cls = 'port'; label = 'Route Selected – Fill Details'; }
    else if (s.includes('doc')) { cls = 'port'; label = 'Details Filled – Upload Documents'; }
    else if (s.includes('assigned')) { cls = 'port'; label = 'Assigned - Complete Booking'; }
    else if (s.includes('ship allocated')) { cls = 'port'; label = 'Ship Allocated'; }
    else if (s.includes('completed')) { cls = 'delivered'; label = 'Completed'; }
    else if (s.includes('pending manager approval') || s.includes('booked')) { cls = 'delayed'; label = 'Awaiting Manager'; }
    else if (s.includes('accept')) { cls = 'port'; label = 'Accepted'; }
    else if (s.includes('port')) { cls = 'port'; label = 'At Port'; }
    else if (s.includes('paid')) { cls = 'booked'; label = 'Paid'; }
    else if (s.includes('delay')) { cls = 'delayed'; label = 'Delayed'; }
    else if (s.includes('cancel') || s.includes('decline')) { cls = 'delayed'; label = status; }

    return `<span class="status-pill ${cls}">${label}</span>`;
}

function estimateETA(s) {
    if (s.estimated_arrival) return new Date(s.estimated_arrival).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const days = Number(s.transit_time || 26);
    const booked = s.created_at ? new Date(s.created_at) : new Date();
    booked.setDate(booked.getDate() + days);
    return booked.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── KPI COUNTS ────────────────────────────────────────────────────
function updateKPIs(shipments) {
    const total = shipments.length;
    const active = shipments.filter(s => { const st = (s.status || '').toLowerCase(); return st.includes('transit') || st.includes('sea') || st.includes('port'); }).length;
    const delivered = shipments.filter(s => (s.status || '').toLowerCase().includes('deliver')).length;

    setText('count-total', total);
    setText('count-active', active);
    setText('count-delivered', delivered);
    setText('count-docs', '—'); // fetched separately

    // Fetch real pending doc count
    fetch(`${API_URL}/api/documents/user/all`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
            if (d.documents) {
                const pending = d.documents.filter(doc => doc.status === 'Pending' || doc.status === 'Submitted').length;
                setText('count-docs', pending);
            }
        }).catch(() => setText('count-docs', '—'));
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// ── SEARCH & FILTER ───────────────────────────────────────────────
function handleSearch(q) {
    if (!q) return renderTable(window.ALL_SHIPMENTS);
    const lq = q.toLowerCase();
    renderTable(window.ALL_SHIPMENTS.filter(s =>
        String(s.id).includes(lq) ||
        (s.status || '').toLowerCase().includes(lq) ||
        (s.from_country || s.origin_address || '').toLowerCase().includes(lq) ||
        (s.to_country || s.destination_address || '').toLowerCase().includes(lq) ||
        (s.mode || '').toLowerCase().includes(lq) ||
        (`mscu${String(s.id).padStart(7, '0')}`).includes(lq)
    ));
}

function applyFilters() {
    const id = (document.getElementById('filterById')?.value || '').toLowerCase().trim();
    const route = (document.getElementById('filterByRoute')?.value || '').toLowerCase().trim();
    const status = (document.getElementById('filterByStatus')?.value || '').toLowerCase();
    const mode = (document.getElementById('filterByMode')?.value || '').toLowerCase();
    const type = (document.getElementById('filterByType')?.value || '').toLowerCase();

    const filtered = window.ALL_SHIPMENTS.filter(s => {
        const st = (s.status || '').toLowerCase();
        const ms = (s.mode || '').toLowerCase();
        const from = (s.from_country || s.origin_address || '').toLowerCase();
        const to = (s.to_country || s.destination_address || '').toLowerCase();

        const matchId = !id || String(s.id).includes(id);
        const matchRoute = !route || from.includes(route) || to.includes(route);
        const matchMode = !mode || ms.includes(mode);
        const matchType = !type || (s.type || 'export').toLowerCase().includes(type);
        const matchStatus = !status || (() => {
            if (status === 'transit') return st.includes('transit') || st.includes('sea');
            if (status === 'port') return st.includes('port') || st.includes('accept');
            if (status === 'arrived') return st.includes('arriv');
            return st.includes(status);
        })();

        return matchId && matchRoute && matchStatus && matchMode && matchType;
    });

    renderTable(filtered);
}

function clearFilters() {
    ['filterById', 'filterByRoute', 'filterByStatus', 'filterByMode', 'filterByType', 'globalSearch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderTable(window.ALL_SHIPMENTS);
}

// Quick filter chips
function initQuickChips() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const q = chip.dataset.quick;
            if (q === 'all') return renderTable(window.ALL_SHIPMENTS);
            renderTable(window.ALL_SHIPMENTS.filter(s => {
                const st = (s.status || '').toLowerCase();
                if (q === 'transit') return st.includes('transit') || st.includes('sea');
                if (q === 'delayed') return st.includes('delay');
                if (q === 'delivered') return st.includes('deliver');
                return true;
            }));
        });
    });
}

// ── NOTIFICATION BELL ─────────────────────────────────────────────
async function buildNotifications() {
    try {
        const res = await fetch(`${API_URL}/api/notifications`, { credentials: 'include' });
        const data = await res.json();

        if (data.success && data.notifications) {
            window.NOTIFICATIONS = data.notifications.map(n => {
                const typeInfo = {
                    info: { icon: 'fa-info-circle', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
                    success: { icon: 'fa-check-circle', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
                    warning: { icon: 'fa-exclamation-triangle', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
                    error: { icon: 'fa-times-circle', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
                    shipment: { icon: 'fa-truck', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' }
                };
                const theme = typeInfo[n.type] || typeInfo.info;
                return {
                    id: n.id,
                    message: n.message,
                    time: timeAgo((Date.now() - new Date(n.created_at).getTime()) / 1000),
                    read: n.is_read,
                    icon: theme.icon,
                    color: theme.color,
                    bg: theme.bg
                };
            });
            renderNotifications();
        } else {
            // Fallback to mock if none or if user is new
            mockNotificationsFallback();
        }
    } catch (err) {
        console.error("Failed to fetch notifications:", err);
        mockNotificationsFallback();
    }
}

function mockNotificationsFallback() {
    window.NOTIFICATIONS = window.ALL_SHIPMENTS.slice(0, 4).map((s, i) => ({
        id: `mock-${i}`,
        message: `Shipment ${s.user_prefix || 'SS'}-${s.id} updated status to ${s.status}`,
        time: timeAgo(i * 3600),
        read: i > 1,
        icon: 'fa-bell',
        color: '#6366f1',
        bg: 'rgba(99,102,241,0.15)'
    }));
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    if (!list) return;

    const unread = window.NOTIFICATIONS.filter(n => !n.read).length;
    if (badge) {
        badge.innerText = unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    if (!window.NOTIFICATIONS.length) {
        list.innerHTML = `<div class="text-white-50 x-small text-center py-4">No notifications</div>`;
        return;
    }

    list.innerHTML = window.NOTIFICATIONS.map((n, i) => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markRead(${i})">
            <div class="notif-icon" style="background:${n.bg};color:${n.color};">
                <i class="fas ${n.icon}"></i>
            </div>
            <div style="flex:1;">
                <div class="text-white x-small fw-semibold">${n.message}</div>
                <div class="text-muted" style="font-size:10px;">${n.time}</div>
            </div>
            ${!n.read ? '<div style="width:6px;height:6px;border-radius:50%;background:#3b82f6;margin-top:6px;"></div>' : ''}
        </div>`).join('');
}

function toggleNotifDropdown() {
    const d = document.getElementById('notif-dropdown');
    if (d) d.classList.toggle('show');
}

async function markRead(index) {
    const n = window.NOTIFICATIONS[index];
    if (!n) return;

    try {
        await fetch(`${API_URL}/api/notifications/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId: n.id }),
            credentials: 'include'
        });
        n.read = true;
        renderNotifications();
    } catch (e) { console.error('Failed to mark read', e); }
}

async function markAllRead() {
    try {
        await fetch(`${API_URL}/api/notifications/read-all`, {
            method: 'POST',
            credentials: 'include'
        });
        window.NOTIFICATIONS.forEach(n => n.read = true);
        renderNotifications();
    } catch (e) { console.error('Failed to mark all read', e); }
}

// ── ACTIVITY FEED ─────────────────────────────────────────────────
async function loadActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    try {
        const res = await fetch(`${API_URL}/api/notifications`, { credentials: 'include' });
        const data = await res.json();

        if (data.success && data.notifications && data.notifications.length > 0) {
            feed.innerHTML = data.notifications.slice(0, 5).map(n => {
                const typeMap = {
                    shipment: 'fa-ship text-primary',
                    success: 'fa-check-circle text-success',
                    warning: 'fa-exclamation-triangle text-warning',
                    info: 'fa-info-circle text-info',
                    error: 'fa-times-circle text-danger'
                };
                const iconCls = typeMap[n.type] || 'fa-bell text-muted';
                return `
                <li class="d-flex gap-2">
                    <i class="fas ${iconCls} mt-1 flex-shrink-0" style="font-size:0.85rem;"></i>
                    <div>
                        <span class="d-block text-white x-small">${n.message}</span>
                        <span class="text-muted x-small">${timeAgo((Date.now() - new Date(n.created_at).getTime()) / 1000)}</span>
                    </div>
                </li>`;
            }).join('');
        } else {
            feed.innerHTML = `<li class="text-white-50 x-small text-center py-2">No recent activity yet.</li>`;
        }
    } catch (err) {
        console.error("Activity feed error:", err);
        feed.innerHTML = `<li class="text-white-50 x-small text-center py-2">No recent activity yet.</li>`;
    }
}

// ── SUPPORT TICKETS WIDGET ────────────────────────────────────────
function loadSupportTickets() {
    const el = document.getElementById('tickets-list');
    if (!el) return;
    // No tickets API yet — show empty state with link
    el.innerHTML = `
        <div class="text-center py-2">
            <span class="text-white-50 x-small d-block mb-2">No open tickets</span>
            <a href="support.html" class="btn btn-sm btn-outline-light rounded-pill px-3 x-small">
                <i class="fas fa-plus me-1"></i>Open a Ticket
            </a>
        </div>`;
}

// ── SLIDE PANEL ───────────────────────────────────────────────────
async function openPanel(id) {
    const s = window.ALL_SHIPMENTS.find(x => x.id == id);
    if (!s) return;

    const step = getStep(s.status);
    const container = s.container_id || `MSCU${String(s.id).padStart(7, '0')}`;
    const cost = Number(s.estimated_cost || 0) * 84;
    const surge = cost * 0.08;
    const total = cost + surge;
    const eta = estimateETA(s);

    setText('panel-id', `${s.user_prefix || 'SS'}-${s.id}`);
    setText('panel-container', container);
    setText('panel-route', `${s.origin_address || s.from_country || '—'} → ${s.destination_address || s.to_country || '—'}`);
    setText('panel-mode', `${s.mode || 'Ocean Freight'} • Transit ${s.transit_time || 26} days`);
    setText('panel-eta', eta);

    // 5-step panel timeline
    const tlEl = document.getElementById('panel-timeline');
    if (tlEl) {
        tlEl.innerHTML = STEPS.map((st, i) => {
            const stepNum = i + 1;
            const isDone = step > stepNum;
            const isActive = step === stepNum;
            const cls = isDone ? 'done' : isActive ? 'active' : 'pending';
            const icon = isDone ? 'fa-check' : st.icon;
            return `
            <div class="ptl-step ${cls}">
                <div class="ptl-dot ${cls}"><i class="fas ${icon}"></i></div>
                <div>
                    <div class="text-white small fw-semibold">${st.label}</div>
                    ${isActive ? `<div class="text-primary x-small">Current Status</div>` : ''}
                    ${isDone ? `<div class="text-success x-small"><i class="fas fa-check me-1"></i>Completed</div>` : ''}
                    ${(!isDone && !isActive) ? `<div class="text-muted x-small">Pending</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    // Gated workflow UI
    const docsHeader = document.querySelector('#panel-docs-status').parentElement;
    const gatedAreaId = 'panel-gated-actions';
    let gatedArea = document.getElementById(gatedAreaId);
    if (!gatedArea) {
        gatedArea = document.createElement('div');
        gatedArea.id = gatedAreaId;
        docsHeader.insertAdjacentElement('afterend', gatedArea);
    }
    gatedArea.innerHTML = '';

    // Check status
    const isWaiting = ['pending', 'booked', 'pending manager approval'].includes(s.status.toLowerCase());
    const isAssigned = ['assigned', 'ship allocated', 'details filled', 'documents pending'].includes(s.status.toLowerCase());

    if (isWaiting) {
        gatedArea.innerHTML = `
            <div class="p-3 bg-warning bg-opacity-10 border border-warning border-opacity-25 rounded-3 mb-4">
                <div class="d-flex gap-2">
                    <i class="fas fa-clock text-warning mt-1"></i>
                    <div>
                        <div class="text-white small fw-bold">Awaiting Manager Approval</div>
                        <div class="text-muted x-small">Our team is reviewing your request and allocating a vessel. Documents and Payment will be enabled shortly.</div>
                    </div>
                </div>
            </div>`;
    } else if (isAssigned) {

        // --- MULTI-QUOTE SELECTION logic ---
        let quotes = s.plan_options;
        if (!Array.isArray(quotes) && typeof s.plan_options === 'string') {
            try { quotes = JSON.parse(s.plan_options); } catch { quotes = []; }
        }
        if ((!quotes || !Array.isArray(quotes) || !quotes.length) && s.negotiated_quotes) {
            quotes = s.negotiated_quotes;
            if (typeof quotes === 'string') {
                try { quotes = JSON.parse(quotes); } catch { quotes = []; }
            }
        }
        console.log('[UI] Plan options for shipment', s.id, ':', quotes);
        const hasSelected = !!(s.selected_service_level || s.selected_plan);

        if (quotes && Array.isArray(quotes) && !hasSelected) {
            let quotesHtml = `<div class="text-white small fw-bold mb-3"><i class="fas fa-tags me-2 text-primary"></i>Select Your Service Option:</div>`;
            quotesHtml += `<div class="d-grid gap-2 mb-4">`;
            quotes.forEach((q, idx) => {
                // Use manager-provided plan name/type for label
                const planLabel = q.name || q.type || q.badge || `Plan ${idx + 1}`;
                const cost = parseFloat(q.price || q.cost || 0) * 84;
                quotesHtml += `
                <button class="btn btn-outline-light text-start p-3 rounded-4 border-secondary border-opacity-25 position-relative hover-glow" 
                        onclick="selectNegotiatedQuote(${s.id}, ${idx}, '${planLabel}', ${q.price || q.cost})">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge bg-primary bg-opacity-25 text-primary x-small">${planLabel}</span>
                        <span class="text-success fw-bold">₹${cost.toLocaleString()}</span>
                    </div>
                    <div class="text-white small mb-1">${q.carrier || 'Global Logistics'} | ${q.mode || s.mode || 'Sea'}</div>
                    <div class="text-muted x-small"><i class="far fa-clock me-1"></i>Transit: ${q.days || s.transit_time || '—'} Days</div>
                </button>`;
            });
            quotesHtml += `</div>`;
            gatedArea.innerHTML = quotesHtml;
        } else {
            // Already selected or no quotes, show the standard "Complete Booking" action
            gatedArea.innerHTML = `
                <div class="p-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-3 mb-4">
                    <div class="text-white small fw-bold mb-2"><i class="fas fa-ship me-2"></i>Ship Allocated!</div>
                    <div class="text-muted x-small mb-1">Vessel <strong>${s.ship_name || s.vehicle_type || 'Assigned'}</strong> is ready.</div>
                    ${hasSelected ? `<div class="mb-3"><span class="badge bg-success bg-opacity-25 text-success x-small"><i class="fas fa-check-circle me-1"></i>${s.selected_service_level} Plan Selected</span></div>` : ''}
                    <div class="d-grid gap-2">
                        <button class="btn btn-primary btn-sm rounded-pill py-2" onclick="openCompleteShipmentModal(${s.id})">
                            ${hasSelected ? 'Continue Booking' : 'Complete Booking'} <i class="fas fa-arrow-right ms-2"></i>
                        </button>
                    </div>
                </div>`;
        }
    }

    // Live Map Mini in Panel
    const mapWrap = document.getElementById('panel-map-wrap');
    if (mapWrap) {
        if (isAssigned || s.status.includes('Transit') || s.status.includes('Accepted')) {

            mapWrap.style.display = 'block';
            setTimeout(() => initPanelMap(s.id), 300);
        } else {
            mapWrap.style.display = 'none';
        }
    }

    // Doc status
    const docsEl = document.getElementById('panel-docs-status');
    if (docsEl) {
        docsEl.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
        fetch(`${API_URL}/api/documents/${id}`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.success && data.documents) {
                    const isVehicle = (s.product_type || '').toLowerCase().includes('car') || (s.product_type || '').toLowerCase().includes('vehi');
                    const required = ['Government ID', 'Commercial Invoice', 'Packing List', 'IEC Certificate'];
                    if (isVehicle) required.push('Vehicle RC', 'Insurance Policy', 'Pre-shipment Inspection');

                    docsEl.innerHTML = required.map(type => {
                        const found = data.documents.find(d =>
                            (d.type || '').toLowerCase() === type.toLowerCase() ||
                            (d.doc_name || '').toLowerCase() === type.toLowerCase()
                        );
                        const st = found ? (found.status === 'Verified' ? 'Verified' : 'Pending Review') : 'Missing';
                        const cls = st === 'Verified' ? 'bg-success' : st === 'Pending Review' ? 'bg-warning text-dark' : 'bg-danger';
                        return `
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="text-white-50 x-small">${type}</span>
                            <span class="badge ${cls} x-small" style="font-size: 8px; padding: 2px 6px;">${st}</span>
                        </div>`;
                    }).join('');
                } else {
                    docsEl.innerHTML = `<div class="text-white-50 x-small text-center py-2">No documents uploaded yet</div>`;
                }
            })
            .catch(() => docsEl.innerHTML = `<div class="text-white-50 x-small text-center py-2">Error loading docs</div>`);
    }

    // Add Contextual Quick Links connecting the actual user flow
    const quickLinksId = 'panel-quick-links';
    let quickLinksArea = document.getElementById(quickLinksId);
    if (!quickLinksArea) {
        quickLinksArea = document.createElement('div');
        quickLinksArea.id = quickLinksId;
        quickLinksArea.className = "d-grid gap-2";
        const docsElNode = document.getElementById('panel-docs-status').parentElement;
        docsElNode.insertAdjacentElement('afterend', quickLinksArea);
    }
    quickLinksArea.innerHTML = `
        <h6 class="text-white-50 x-small fw-bold text-uppercase mt-2 mb-2">Shipment Actions</h6>
        <button class="btn btn-outline-primary btn-sm rounded-pill text-start px-3 py-2 fw-semibold" onclick="window.location.href='track.html?id=${s.id}'"><i class="fas fa-map-marker-alt w-5 me-2 text-primary"></i>Live Track Shipment</button>
        <button class="btn btn-outline-info btn-sm rounded-pill text-start px-3 py-2 fw-semibold" onclick="window.location.href='documents.html?shipmentId=${s.id}'"><i class="fas fa-folder-open w-5 me-2 text-info"></i>Manage Documents</button>
        <button class="btn btn-outline-success btn-sm rounded-pill text-start px-3 py-2 fw-semibold" onclick="window.location.href='finance.html?shipmentId=${s.id}'"><i class="fas fa-file-invoice-dollar w-5 me-2 text-success"></i>Billing & Payments</button>
        <button class="btn btn-outline-warning btn-sm rounded-pill text-start px-3 py-2 fw-semibold" onclick="window.location.href='support.html?shipmentId=${s.id}'"><i class="fas fa-headset w-5 me-2 text-warning"></i>Open Support Ticket</button>
    `;

    document.getElementById('slide-panel').classList.add('open');
}

async function selectNegotiatedQuote(shipmentId, index, serviceLevel, price) {
    const sid = String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId;
    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Selecting...`;

    try {
        console.log('[UI] User selecting plan:', { sid, index, serviceLevel, price });
        const res = await fetch(`${API_URL}/api/v3/shipment/${sid}/select-quote`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteIdx: index, serviceLevel: serviceLevel })
        });
        const data = await res.json();

        if (data.success) {
            await fetchShipments();
            openCompleteShipmentModal(shipmentId);
        } else {
            alert("Selection failed: " + (data.message || "Unknown error"));
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    } catch (e) {
        console.error('Selection Error:', e);
        alert("Server connection error during selection: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}


let panelMapInstance = null;
async function initPanelMap(shipmentId) {
    const mapEl = document.getElementById('panel-map');
    if (!mapEl) return;
    if (panelMapInstance) { panelMapInstance.remove(); panelMapInstance = null; }
    panelMapInstance = L.map('panel-map').setView([20, 78], 3);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CARTO' }).addTo(panelMapInstance);
    try {
        const res = await fetch(`${API_URL}/api/v3/tracking/live/${shipmentId}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success && data.tracking.livePosition) {
            const pos = [data.tracking.livePosition.lat, data.tracking.livePosition.lng];
            const icon = L.divIcon({ className: 'mini-ship', html: `<div style="color:#22c55e;"><i class="fas fa-ship fa-rotate-270"></i></div>`, iconSize: [20, 20] });
            L.marker(pos, { icon }).addTo(panelMapInstance).bindPopup(data.tracking.shipName).openPopup();
            panelMapInstance.flyTo(pos, 5);
        }
    } catch (e) { }
}

async function openCompleteShipmentModal(id) {
    const sid = String(id).includes('-') ? String(id).split('-').pop() : id;
    
    // Fetch fresh details + quotes + docs to ensure we have the manager-assigned values
    let s = null;
    let quotes = [];
    let requestedDocs = [];

    try {
        const res = await fetch(`${API_URL}/api/v3/shipment/${sid}/booking-details`, { credentials: 'include' });
        const data = await res.json();
        console.log(`[DEBUG] Fetched booking details for shipment ${sid}:`, data);
        if (data.success) {
            s = data.shipment;
            quotes = data.planOptions || [];
            requestedDocs = data.requiredDocuments || [];

            if (s) {
                s.negotiated_quotes = quotes;
                s.requested_documents = requestedDocs;
                s.selected_quote_id = data.selectedId;
            }
        } else if (data.waiting) {
            alert("Waiting for manager approval: " + data.message);
            return;
        }
    } catch (e) { console.error("Failed to fetch fresh booking details", e); }

    let modalEl = document.getElementById('completeShipmentModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'completeShipmentModal';
        modalEl.className = 'modal fade';
        document.body.appendChild(modalEl);
    }
    
    if (!s) return alert("Shipment data not found or still pending manager approval.");

    modalEl.innerHTML = `
        <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content bg-dark border border-secondary text-white shadow-lg overflow-hidden">
                <div class="modal-header border-secondary bg-black bg-opacity-25 py-3">
                    <h5 class="modal-title fw-bold"><i class="fas fa-id-card-alt text-primary me-2"></i>Finalize Your Shipment</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body pb-1 px-0">
                    <!-- Step Progress Bar -->
                    <div class="d-flex justify-content-between mb-5 mt-3 px-5 position-relative mx-auto" style="max-width: 600px;">
                        <div style="position:absolute; top:14px; left:10%; right:10%; height:2px; background:rgba(255,255,255,0.05); z-index:0;"></div>
                        <div style="position:absolute; top:14px; left:10%; width:0%; height:2px; background:#3b82f6; z-index:0; transition:width 0.4s ease;" id="comp-progress-line"></div>
                        <div id="step-dot-0" class="step-dot active">0<br><small>Service Plan</small></div>
                        <div id="step-dot-1" class="step-dot">1<br><small>Details & Docs</small></div>
                        <div id="step-dot-2" class="step-dot">2<br><small>Payment</small></div>
                    </div>

                    <div class="px-5">
                        <!-- Step 0: Select Plan -->
                        <div id="comp-step-0">
                            <h6 class="text-primary small fw-bold text-uppercase mb-4 text-center">Step 0: Choose Your Manager-Assigned Service Level</h6>
                            <div class="row g-4 justify-content-center mb-4" id="comp-quote-pool">
                                <!-- Quotes injected here -->
                            </div>
                        </div>

                        <!-- Step 1: Details & Documents -->
                        <div id="comp-step-1" style="display:none;">
                            <h6 class="text-primary small fw-bold text-uppercase mb-3"><i class="fas fa-info-circle me-2"></i>1. Shipment Information & Document Upload</h6>
                            <div class="row g-3 mb-4">
                                <div class="col-md-6">
                                    <label class="small text-white-50 mb-1">HS Code *</label>
                                    <input type="text" id="comp-hs-code" class="form-control bg-dark border-secondary text-white" placeholder="e.g. 8703">
                                </div>
                                <div class="col-md-6">
                                    <label class="small text-white-50 mb-1">Consignee Name *</label>
                                    <input type="text" id="comp-consignee" class="form-control bg-dark border-secondary text-white">
                                </div>
                                <div class="col-md-12">
                                    <label class="small text-white-50 mb-1">Goods Description *</label>
                                    <textarea id="comp-desc" class="form-control bg-dark border-secondary text-white" rows="2"></textarea>
                                </div>
                                <div class="col-md-6">
                                    <label class="small text-white-50 mb-1">Consignee Contact *</label>
                                    <input type="text" id="comp-contact" class="form-control bg-dark border-secondary text-white">
                                </div>
                                <div class="col-md-6">
                                    <label class="small text-white-50 mb-1">Cargo Value (USD) *</label>
                                    <input type="number" id="comp-value" class="form-control bg-dark border-secondary text-white">
                                </div>
                            </div>
                            
                            <h6 class="text-primary small fw-bold text-uppercase mb-3"><i class="fas fa-file-upload me-2"></i>Mandatory Documents</h6>
                            <div class="row g-3" id="comp-docs-container">
                                 <!-- Dynamic docs here -->
                            </div>
                            <div id="comp-vehicle-docs" style="display:none;" class="mt-3 bg-white bg-opacity-5 p-3 rounded-3">
                                 <div class="row g-3">
                                    <div class="col-md-4">
                                        <label class="small text-white-50 mb-1">Vehicle RC *</label>
                                        <input type="file" id="comp-rc" class="form-control bg-dark border-secondary text-white">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="small text-white-50 mb-1">Insurance Policy *</label>
                                        <input type="file" id="comp-insurance" class="form-control bg-dark border-secondary text-white">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="small text-white-50 mb-1">Inspection *</label>
                                        <input type="file" id="comp-inspection" class="form-control bg-dark border-secondary text-white">
                                    </div>
                                 </div>
                            </div>

                            <div class="mt-5 d-flex justify-content-between">
                                <button class="btn btn-outline-light rounded-pill px-4" onclick="goToStep(0)"><i class="fas fa-arrow-left me-2"></i> Change Plan</button>
                                <button class="btn btn-primary px-4 rounded-pill" id="uploadAllBtn">Upload & Continue <i class="fas fa-cloud-upload-alt ms-2"></i></button>
                            </div>
                        </div>

                        <!-- Step 2: Payment -->
                        <div id="comp-step-2" style="display:none;">
                            <h6 class="text-primary small fw-bold text-uppercase mb-3"><i class="fas fa-credit-card me-2"></i>3. Final Review & Payment</h6>
                            <div class="bg-dark bg-opacity-50 p-4 rounded-4 border border-secondary mb-4 mx-auto" style="max-width: 500px;">
                                 <div class="d-flex justify-content-between mb-2">
                                    <span class="text-white-50">Base Freight Cost:</span>
                                    <span id="comp-amt-base" class="fw-bold fs-5 text-white">₹0</span>
                                </div>
                                <div class="d-flex justify-content-between mb-2">
                                    <span class="text-white-50">Taxes & Platform Fees (8%):</span>
                                    <span id="comp-amt-tax" class="text-warning fw-bold">₹0</span>
                                </div>
                                <hr class="border-secondary border-opacity-25 my-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <h5 class="m-0 fw-bold text-white">Total Payable:</h5>
                                    <h4 id="comp-amt-total" class="m-0 text-success fw-bold">₹0</h4>
                                </div>
                            </div>
                            <div class="mt-5 d-flex justify-content-between">
                                <button class="btn btn-outline-light rounded-pill px-4" onclick="goToStep(1)"><i class="fas fa-arrow-left me-2"></i> Back</button>
                                <button class="btn btn-success px-5 rounded-pill fw-bold btn-lg shadow" id="payProceedBtn">Pay Securely <i class="fas fa-shield-alt ms-2"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <style>
            .step-dot { 
                width: 32px; height: 32px; border-radius: 50%; background: #1e293b; 
                display: flex; align-items: center; justify-content: center; font-size: 13px;
                font-weight: 800; color: #fff; z-index: 1; position: relative;
                border: 2px solid #334155;
            }
            .step-dot.active { background: #3b82f6; border-color: #3b82f6; box-shadow: 0 0 15px rgba(59,130,246,0.5); }
            .step-dot small { position: absolute; top: 38px; left: 50%; transform: translateX(-50%); font-size: 10px; text-transform: uppercase; white-space: nowrap; color: #64748b; font-weight: 600; }
            .step-dot.active small { color: #3b82f6; }
        </style>
    `;

    // Render Price Pool
    const poolEl = document.getElementById('comp-quote-pool');
    if (quotes && Array.isArray(quotes) && quotes.length > 0) {
        poolEl.innerHTML = quotes.map((q, idx) => {
            const badge = q.name || q.badge || (idx === 0 ? 'Economy' : idx === 1 ? 'Standard' : 'Premium');
            const cost = parseFloat(q.price || q.cost || 0) * 84;
            const isSelected = s.selected_plan == (q.name || String(idx));
            return `
            <div class="col-md-4">
                <div class="card bg-dark border-${isSelected ? 'primary' : 'secondary'} border-opacity-50 h-100 hover-glow cursor-pointer quote-card rounded-4 overflow-hidden" 
                     onclick="selectQuoteInModal(${sid}, ${idx}, '${badge}', this)">
                    <div class="card-body p-4 text-center">
                        <div class="badge bg-primary bg-opacity-15 text-primary mb-3 px-3 py-2 rounded-pill">${badge}</div>
                        <h2 class="fw-bold mb-1 text-white">₹${cost.toLocaleString()}</h2>
                        <p class="text-white-50 small mb-4">Transit: <strong>${q.days || q.transitTime || s.transit_time || 26}</strong></p>
                        <div class="d-grid mt-auto">
                            <button class="btn btn-${isSelected ? 'primary' : 'outline-primary'} rounded-pill py-2 fw-bold shadow-sm">
                                ${isSelected ? '<i class="fas fa-check me-2"></i>Selected' : 'Select Plan'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } else {
        poolEl.innerHTML = `<div class="col-12 py-5 text-center text-white-50 mt-4"><i class="fas fa-hourglass-half fa-2x mb-3 d-block opacity-25"></i>No price options assigned by manager yet.</div>`;
    }

    // Dynamic Documents Step
    const docsContainer = document.getElementById('comp-docs-container');
    if (docsContainer) {
        if (requestedDocs && requestedDocs.length > 0) {
            // Hotfix: Ensure IEC Certificate is always requested even if old allocated shipment missed it
            if (!requestedDocs.includes('IEC Certificate')) {
                requestedDocs.push('IEC Certificate');
            }
            docsContainer.innerHTML = requestedDocs.map(docName => {
                const id = 'comp-' + docName.toLowerCase().replace(/ /g, '-').replace(/[^a-z-]/g, '');
                return `
                <div class="col-md-6">
                    <label class="small text-white-50 mb-1">${docName} *</label>
                    <input type="file" id="${id}" data-type="${docName}" class="form-control bg-dark border-secondary text-white">
                </div>`;
            }).join('');
        } else {
            // Default docs fallback
            const defaultDocs = ['Government ID', 'Commercial Invoice', 'Packing List', 'IEC Certificate'];
            docsContainer.innerHTML = defaultDocs.map(type => {
                const id = 'comp-' + type.toLowerCase().replace(/ /g, '-');
                return `<div class="col-md-6"><label class="small text-white-50 mb-1">${type} *</label><input type="file" id="${id}" data-type="${type}" class="form-control bg-dark border-secondary text-white"></div>`;
            }).join('');
        }
    }

    // Auto-detect starting step
    let startStep = 0;
    if (s.selected_service_level || s.selected_quote_id) {
        const stats = (s.status || '').toLowerCase();
        if (stats.includes('detail')) startStep = 1;
        else if (stats.includes('doc')) startStep = 2;
        else if (stats.includes('payment') || stats.includes('ready')) startStep = 3;
        else startStep = 1; // Fallback if plan is selected but status is unmapped
    }

    goToStep(startStep);

    // Bootstrap Modal Toggle
    const modal = new bootstrap.Modal(document.getElementById('completeShipmentModal'));
    modal.show();

    // Fill form fields
    document.getElementById('comp-hs-code').value = s.hs_code || '';
    document.getElementById('comp-consignee').value = s.consignee_name || '';
    document.getElementById('comp-desc').value = s.description || '';
    document.getElementById('comp-contact').value = s.consignee_contact || '';
    document.getElementById('comp-value').value = s.cargo_value || '';

    const isVehicle = (s.product_type || '').toLowerCase().includes('car') || (s.product_type || '').toLowerCase().includes('vehi');
    const vehArea = document.getElementById('comp-vehicle-docs');
    if (vehArea) vehArea.style.display = isVehicle ? 'block' : 'none';

    updatePaymentSummary(s);

    document.getElementById('uploadAllBtn').onclick = () => uploadAllShipmentDocs(sid);
    document.getElementById('payProceedBtn').onclick = () => processBookingPayment(sid);
}

async function updateShipmentDetails(shipmentId) {
    const sid = String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId;
    const details = {
        hsCode: document.getElementById('comp-hs-code').value,
        consigneeName: document.getElementById('comp-consignee').value,
        description: document.getElementById('comp-desc').value,
        consigneeContact: document.getElementById('comp-contact').value,
        cargoValue: document.getElementById('comp-value').value
    };

    if (!details.hsCode || !details.consigneeName) {
        return alert("Please provide Consignee name and HS code.");
    }

    try {
        const res = await fetch(`${API_URL}/api/v3/shipment/${sid}/update-details`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details)
        });
        const data = await res.json();
        if (data.success) {
            goToStep(2);
        } else {
            alert(data.message || "Failed to update details.");
        }
    } catch (e) {
        console.error(e);
        alert("Server error updating details.");
    }
}

function goToStep(n) {
    ['0', '1', '2'].forEach(s => {
        const el = document.getElementById(`comp-step-${s}`);
        if (el) el.style.display = (s == n) ? 'block' : 'none';
    });

    const progressLine = document.getElementById('comp-progress-line');
    if (progressLine) {
        let width = 0;
        if (n == 1) width = 50;
        if (n == 2) width = 100;
        progressLine.style.width = width + '%';
    }

    document.querySelectorAll('.step-dot').forEach(d => d.classList.remove('active'));
    for (let i = 0; i <= n; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        if (dot) dot.classList.add('active');
    }
}

async function selectQuoteInModal(shipmentId, index, serviceLevel, cardEl) {
    const sid = String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId;
    const allCards = document.querySelectorAll('.quote-card');
    allCards.forEach(c => c.classList.remove('border-primary'));
    allCards.forEach(c => c.classList.add('border-secondary'));
    cardEl.classList.remove('border-secondary');
    cardEl.classList.add('border-primary');

    try {
        const res = await fetch(`${API_URL}/api/v3/shipment/${sid}/select-quote`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteIdx: index, serviceLevel })
        });

        const data = await res.json();
        if (data.success) {
            await fetchShipments(); // Update local state
            const updated = window.ALL_SHIPMENTS.find(x => x.id == shipmentId);
            updatePaymentSummary(updated || { estimated_cost: 0 });
            goToStep(1); // Auto move to Details
        } else {
            alert(data.message);
        }
    } catch (e) { console.error(e); }
}


function updatePaymentSummary(s) {
    const elBase = document.getElementById('comp-amt-base');
    const elTax = document.getElementById('comp-amt-tax');
    const elTotal = document.getElementById('comp-amt-total');
    if (!elBase || !elTax || !elTotal) return;

    const cost = Number(s.estimated_cost || 0) * 84;
    const tax = cost * 0.08;
    const total = cost + tax;
    elBase.innerText = `₹${cost.toLocaleString()}`;
    elTax.innerText = `₹${tax.toLocaleString()}`;
    elTotal.innerText = `₹${total.toLocaleString()}`;
}

async function uploadAllShipmentDocs(shipmentId) {
    const sid = String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId;
    
    // 1. Save details from Step 1
    const details = {
        hsCode: document.getElementById('comp-hs-code').value,
        consigneeName: document.getElementById('comp-consignee').value,
        description: document.getElementById('comp-desc').value,
        consigneeContact: document.getElementById('comp-contact').value,
        cargoValue: document.getElementById('comp-value').value
    };

    if (!details.hsCode || !details.consigneeName) {
        alert("Please ensure Consignee name and HS code are filled.");
        goToStep(1);
        return;
    }

    const btn = document.getElementById('uploadAllBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Saving & Uploading...';

    try {
        // Save details first
        const detRes = await fetch(`${API_URL}/api/v3/shipment/${sid}/update-details`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details)
        });
        const detData = await detRes.json();
        
        if (!detData.success) {
            throw new Error(detData.message || "Failed to update shipment details.");
        }

        // Loop through all inputs with data-type (dynamic docs)
        const inputs = document.querySelectorAll('#comp-docs-container input[type="file"]');
        for (const input of inputs) {
            if (input.files.length > 0) {
                const type = input.getAttribute('data-type') || 'Other';
                const formData = new FormData();
                formData.set('docFile', input.files[0]);
                formData.set('type', type);
                formData.set('shipmentId', sid);
                await fetch(`${API_URL}/api/documents/upload`, { method: 'POST', credentials: 'include', body: formData });
            }
        }
        
        // Vehicle docs
        const vehArea = document.getElementById('comp-vehicle-docs');
        if (vehArea && vehArea.style.display !== 'none') {
            const vInputs = vehArea.querySelectorAll('input[type="file"]');
            for (const input of vInputs) {
                if (input.files.length > 0) {
                    const type = input.id.replace('comp-', '').replace(/-/g, ' ').toUpperCase();
                    const formData = new FormData();
                    formData.set('docFile', input.files[0]);
                    formData.set('type', type);
                    formData.set('shipmentId', sid);
                    await fetch(`${API_URL}/api/documents/upload`, { method: 'POST', credentials: 'include', body: formData });
                }
            }
        }

        goToStep(2);
    } catch (e) {
        console.error(e);
        alert('Upload failed. Please check your connection.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function processBookingPayment(shipmentId) {
    const sid = String(shipmentId).includes('-') ? String(shipmentId).split('-').pop() : shipmentId;
    const btn = document.getElementById('payProceedBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Redirecting...';

    try {
        const res = await fetch(`${API_URL}/api/payment/create-checkout-session`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId: sid })
        });
        const data = await res.json();
        if (data.success && data.url) {
            window.location.href = data.url;
        } else {
            alert(data.message || 'Payment failed.');
            btn.disabled = false;
            btn.innerHTML = 'Pay Securely <i class="fas fa-shield-alt ms-2"></i>';
        }
    } catch (e) {
        alert('Network error.');
        btn.disabled = false;
        btn.innerHTML = 'Pay Securely <i class="fas fa-shield-alt ms-2"></i>';
    }
}

function closePanel() {
    document.getElementById('slide-panel').classList.remove('open');
}

function emptyRow(msg) {
    return `<tr><td colspan="8" class="text-center py-5 text-white-50">${msg}</td></tr>`;
}

function timeAgo(secondsAgo) {
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)} min ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)} hours ago`;
    return `${Math.floor(secondsAgo / 86400)} days ago`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('complete');
    const sessionId = params.get('session_id');

    if (sid && sessionId) {
        // Payment success callback - verify and finalize
        try {
            const res = await fetch(`${API_URL}/api/payment/verify-payment`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, shipmentId: sid })
            });
            const data = await res.json();
            if (data.success) {
                // Finalize the booking status to 'completed'
                await fetch(`${API_URL}/api/v3/shipment/${sid}/complete-booking`, { method: 'POST', credentials: 'include' });
                alert('Booking Completed Successfully!');
                window.history.replaceState({}, document.title, window.location.pathname);
                fetchShipments();
            }
        } catch (e) { console.error(e); }
    } else if (sid) {
        setTimeout(() => {
            if (typeof openCompleteShipmentModal === 'function') {
                openCompleteShipmentModal(sid);
            }
        }, 1500);
    }
});

