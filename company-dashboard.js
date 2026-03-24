// company-dashboard.js — All logic for the Company Partner Hub (12 sections)
const API = `http://${location.hostname}:3000`;

let CURRENT_USER = null;
let ALL_SHIPMENTS = [];
let CO_NOTIFICATIONS = [];
let GLOBAL_CURRENT_REQ = null;

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || d.user?.role !== 'company') {
            location.href = 'auth.html'; return;
        }
        CURRENT_USER = d.user;

        // REAL-TIME SYNC: Hooks for socket-client.js
        window.fetchNotifications = loadNotifications;
        window.fetchShipments = loadDashboard;

        loadDashboard();
        loadNotifications();
        initDashboardMap(); // New Map View

        // fetch fresh profile for approval status
        const profileR = await fetch(`${API}/api/user/profile`, { credentials: 'include' }).catch(() => ({ ok: false }));
        const profileD = profileR.ok ? await profileR.json() : {};
        const status = profileD.success ? profileD.user?.company_status : CURRENT_USER.companyStatus;

        setV('company-name', CURRENT_USER.name || CURRENT_USER.email);
        const badge = document.getElementById('company-status-badge');
        if (badge) {
            if (status === 'approved') {
                badge.className = 'badge rounded-pill bg-success text-white';
                badge.innerText = 'Verified Partner';
                loadDashboard();
                loadNotifications();
                loadPortsToDatalist();

                // Real-time Port Sync
                const socket = io(API);
                socket.on('ports_updated', () => loadPortsToDatalist());
            } else {
                badge.className = 'badge rounded-pill bg-warning text-dark';
                badge.innerText = 'Pending Review';
                const banner = document.getElementById('pending-banner');
                if (banner) banner.style.display = 'block';
            }
        }
    } catch (e) {
        console.error('Auth error:', e);
        location.href = 'auth.html';
    }
});

async function loadPortsToDatalist() {
    const list = document.getElementById('ports-list');
    if (!list) return;

    try {
        const res = await fetch(`${API}/api/ports`);
        const data = await res.json();
        if (data.success && data.ports.length > 0) {
            list.innerHTML = '';
            data.ports.forEach(p => {
                const opt = document.createElement('option');
                const stateStr = p.state ? ` - ${p.state}` : '';
                opt.value = `${p.name} (${p.country}${stateStr}) [${p.code}]`;
                list.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn("Failed to load ports for datalist:", e);
    }
}

// ── NAVIGATION ────────────────────────────────────────────────────
function showSection(name, el) {
    document.querySelectorAll('.co-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.co-nav a').forEach(a => a.classList.remove('active'));

    const sec = document.getElementById(`section-${name}`);
    if (sec) sec.classList.add('active');
    if (el) el.classList.add('active');

    const titles = {
        dashboard: '📊 Company Overview', bookings: '📥 Booking Requests',
        shipments: '📦 Shipment Management', vessels: '🚢 Vessel / Fleet',
        schedules: '📅 Schedule Management', pricing: '🏷️ Pricing & Rates',
        customers: '👤 Customer Management', support: '🎧 Customer Support',
        documents: '📄 Document Handling', tracking: '🗺️ Tracking Updates',
        finance: '💹 Financial Management', notifications: '🔔 Notifications'
    };
    setV('section-title', titles[name] || 'Partner Hub');

    const loaders = {
        bookings: loadBookings, shipments: loadShipments,
        vessels: loadVessels, schedules: loadSchedules,
        pricing: loadPricing, customers: loadCustomers,
        documents: loadDocuments, tracking: loadTrackingLogs,
        finance: loadFinance, notifications: loadNotifications,
        support: loadCompanyTickets
    };
    if (loaders[name]) loaders[name]();
    return false;
}

// ── DASHBOARD ─────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const r = await fetch(`${API}/api/company/stats/detailed`, { credentials: 'include' });
        const d = await r.json();
        if (d.success) {
            setV('kpi-total', d.total);
            setV('kpi-active', d.active);
            setV('kpi-delivered', d.delivered);
            setV('kpi-pending', d.pendingBookings);
            setV('kpi-revenue', `₹${num(d.revenue * 84)}`);
            setV('kpi-exports', d.exports || 0);
            setV('kpi-imports', d.imports || 0);
            setV('nav-bookings', d.pendingBookings);
            setV('nav-shipments', d.total);

            const months = d.monthly.map(m => m.month);
            const counts = d.monthly.map(m => Number(m.count));
            drawBar('chart-monthly', months, counts, 'Shipments', '#3b82f6');
        }
    } catch (e) { console.error('Dashboard stats error:', e); }

    loadCompanyTickets(); // Update support ticket badge count

    // Recent bookings table
    try {
        const r2 = await fetch(`${API}/api/company/all-shipments`, { credentials: 'include' });
        const d2 = await r2.json();
        if (d2.success) {
            ALL_SHIPMENTS = d2.shipments;
            setV('kpi-vessels', (await fetchVessels()).length);

            // Status distribution
            const dist = {};
            ALL_SHIPMENTS.forEach(s => { dist[s.status] = (dist[s.status] || 0) + 1; });
            drawDoughnut('chart-status', Object.keys(dist), Object.values(dist));

            const tbody = document.getElementById('dash-recent');
            if (tbody) {
                tbody.innerHTML = ALL_SHIPMENTS.slice(0, 6).map(s => {
                    const sType = (s.type || 'Export');
                    const typeBadge = sType.toLowerCase() === 'import'
                        ? '<span class="badge-role" style="background:rgba(16,185,129,0.15);color:#34d399;">Import</span>'
                        : '<span class="badge-role" style="background:rgba(59,130,246,0.15);color:#60a5fa;">Export</span>';
                    return `
                    <tr>
                        <td class="font-monospace fw-bold text-primary">${s.user_prefix || 'SS'}-${s.id}</td>
                        <td class="text-white">${esc(s.customer_name || '—')}</td>
                        <td class="text-white-50 small">${shortR(s)}</td>
                        <td>${typeBadge}</td>
                        <td>${stBadge(s.status)}</td>
                        <td class="text-white-50">$${num(s.estimated_cost)}</td>
                        <td class="text-white-50 small">${fmtD(s.created_at)}</td>
                    </tr>`;
                }).join('');
            }
        }
    } catch (e) { console.error('Dashboard shipments error:', e); }

    // Load customer count for sidebar
    try {
        const r3 = await fetch(`${API}/api/company/customers`, { credentials: 'include' });
        const d3 = await r3.json();
        if (d3.success) setV('nav-customers', d3.customers.length);
    } catch (e) { }
}

// ── BOOKING REQUESTS ──────────────────────────────────────────────
async function loadBookings() {
    const grid = document.getElementById('bookings-grid');
    const hist = document.getElementById('bookings-history-body');
    if (!grid) return;
    grid.innerHTML = '<div class="text-white-50 text-center py-5"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Analyzing incoming requests...</div>';

    try {
        const r = await fetch(`${API}/api/v3/manager/booking-requests`, { credentials: 'include' });
        const d = await r.json();
        const pending = d.success ? d.requests : [];
        ALL_PENDING_REQUESTS = pending; // Required for Accept Modal
        
        // 1. Render Active Inbox
        if (!pending.length) {
            grid.innerHTML = `<div class="p-5 text-center bg-dark bg-opacity-10 rounded border border-secondary border-opacity-10"><i class="fas fa-inbox fa-2x text-white-50 mb-3 d-block"></i><div class="text-white-50 small font-monospace">STATION_SILENT: All terminal requests cleared.</div></div>`;
            setV('bookings-count', '0 pending');
            setV('nav-bookings', '0');
        } else {
            setV('bookings-count', `${pending.length} pending`);
            setV('nav-bookings', pending.length);
            grid.innerHTML = pending.map(req => `
                <div class="booking-card hover-glow new-req d-flex justify-content-between align-items-center p-3 border border-secondary border-opacity-10 mb-2 rounded-3" id="req-${req.id}">
                    <div style="flex:1;">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="badge bg-primary bg-opacity-10 text-primary px-2 py-1 x-small font-monospace">${req.mode || 'Sea'}</span>
                            <span class="text-white fw-bold x-small opacity-75">REQ-${req.id}</span>
                            <span class="badge bg-dark rounded-pill border border-secondary border-opacity-20 x-small text-white-50 font-monospace">UID: ${req.customer_id || req.user_id}</span>
                        </div>
                        <div class="text-white fw-bold mb-1" style="font-size:0.95rem;">${esc(req.origin_address || req.from_country || '—')} → ${esc(req.destination_address || req.to_country || '—')}</div>
                        <div class="x-small text-white-50"><i class="fas fa-user-circle me-1"></i>${esc(req.customer_name || 'Anonymous Partner')}</div>
                    </div>
                    
                    <div class="px-4 text-center border-start border-end border-secondary border-opacity-10 mx-4" style="min-width:140px;">
                        <div class="text-success fw-bold" style="font-size:1.1rem;">₹${num(req.estimated_cost * 84)}</div>
                        <div class="text-white-50 x-small">${fmtD(req.created_at)}</div>
                    </div>

                    <div class="d-flex gap-2">
                        <button class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm" onclick="openAcceptModal(${req.id})">
                            <i class="fas fa-ship me-2"></i>Approve & Allocate
                        </button>
                        <button class="btn btn-outline-danger border-opacity-25 rounded-pill px-4 py-2" onclick="rejectBooking(${req.id})">
                            <i class="fas fa-times me-2"></i>Decline
                        </button>
                    </div>
                </div>`).join('');
        }

        // 2. Render Processed Archive
        const resAll = await fetch(`${API}/api/company/all-shipments`, { credentials: 'include' });
        const dAll = await resAll.json();
        const processed = (dAll.shipments || []).filter(s => s.status !== 'Booked' && s.status !== 'Pending Manager Approval');
        
        if (hist) {
            if (!processed.length) {
                hist.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-white-50 font-monospace">ARCHIVE_EMPTY: No historically processed records.</td></tr>';
            } else {
                hist.innerHTML = processed.slice(0, 10).map(s => `
                    <tr class="transition-all hover-glow">
                        <td class="font-monospace text-primary fw-bold" style="font-size: 11px;">REQ-${s.id}</td>
                        <td class="small">
                            <div class="text-white fw-bold">UID: ${s.customer_id || s.user_id || '---'}</div>
                            <div class="x-small text-white-50 font-monospace">${esc(s.customer_name || '---')}</div>
                        </td>
                        <td class="small text-white-50">
                            <div>${shortR(s)}</div>
                            ${s.vessel_route ? `<div class="mt-1 fst-italic text-info opacity-75 text-truncate" style="font-size:0.65rem; max-width: 180px;" title="${esc(s.vessel_route)}">Route: ${esc(s.vessel_route).replace(/ → /g, ' &raquo; ')}</div>` : ''}
                        </td>
                        <td>
                            <div class="text-info x-small fw-bold">${esc(s.mode || '---')}</div>
                            <div class="text-white-50 x-small">₹${num(s.estimated_cost * 84)}</div>
                            ${s.vessel_name ? `<div class="mt-1"><span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25" style="font-size: 0.65rem;"><i class="fas fa-ship me-1"></i>${esc(s.vessel_name)}</span></div>` : ''}
                        </td>
                        <td>${stBadge(s.status)}</td>
                        <td class="text-end text-white-50 small font-monospace">${fmtD(s.updated_at || s.created_at)}</td>
                    </tr>
                `).join('');
            }
        }

    } catch (e) {
        console.error('Request Load Failure:', e);
        grid.innerHTML = '<div class="text-danger text-center py-4 font-monospace"><i class="fas fa-exclamation-triangle me-2"></i>CRITICAL_LINK_ERROR: Database handshake failed.</div>';
    }
}

// Accept Modal - population logic
async function openAcceptModal(id) {
    const req = ALL_PENDING_REQUESTS.find(r => r.id == id);
    if (!req) return;
    GLOBAL_CURRENT_REQ = req;

    setVal('accept-shipment-id', id);
    const prefix = req.user_prefix || 'SS';
    const ref = `${prefix}-${id}`;
    const refEl = document.getElementById('accept-shipment-ref-display');
    if (refEl) refEl.innerText = ref;

    // Analyze Booking (Contextual Summary)
    setV('ana-mode', req.mode || 'Ocean');
    setV('ana-weight', (req.weight_kg || req.weight || '--') + ' kg');
    setV('ana-equip', req.container_size || '20ft FCL');
    setV('ana-product', req.product_type || 'General');

    // Clear and load ships
    const select = document.getElementById('accept-vessel-select');
    select.innerHTML = '<option value="">-- Select Available Ship --</option>';

    // Smart Ship Loading with Route-Based Matching
    const source = req.source_port || req.from_country || "";
    const dest = req.destination_port || req.to_country || "";
    
    try {
        let res = await fetch(`${API}/api/v3/manager/ships/available?fromPort=${source}&toPort=${dest}`, { credentials: 'include' });
        let d = await res.json();

        if (d.success && d.ships.length > 0) {
            d.ships.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                
                // Formulate Route String
                const routeStr = s.route_stops && s.route_stops.length > 0 ? s.route_stops.map(st => st.port_name).join(' → ') : 'No Route Defined';
                const openSlots = s.available_slots != null ? s.available_slots : (s.container_slots - s.used_slots);

                if (s.isMatch) {
                    opt.textContent = `✅ [SUGGESTED] ${s.name} (${openSlots} slots open) | MATCHES ROUTE: ${routeStr}`;
                    opt.style.color = '#34d399';
                    opt.style.fontWeight = 'bold';
                    opt.className = "text-success fw-bold bg-dark";
                } else {
                    opt.textContent = `❌ [MISMATCH] ${s.name} - Wrong Route / Reverse Direction | (Route: ${routeStr})`;
                    opt.style.color = '#f87171';
                    opt.className = "text-danger bg-dark";
                }
                select.appendChild(opt);
            });
            
            // System Logic (AUTO MATCH) - auto selects the first valid matching route
            const matchShip = d.ships.find(s => s.isMatch);
            select.value = matchShip ? matchShip.id : d.ships[0].id;
            onAcceptShipSelected();
        } else {
            const opt = document.createElement('option');
            opt.textContent = "No ships available in fleet.";
            opt.disabled = true;
            select.appendChild(opt);
        }
    } catch (e) { console.error('Ship load error:', e); }

    openModal('accept-modal');
}

// When ship is selected in accept modal, fetch its stops
async function onAcceptShipSelected() {
    const shipId = document.getElementById('accept-vessel-select').value;
    const dropSelect = document.getElementById('accept-drop-port-select');
    dropSelect.innerHTML = '<option value="">-- Select Drop Stop --</option>';

    if (!shipId) return;

    try {
        const res = await fetch(`${API}/api/v3/manager/ship/${shipId}/route`, { credentials: 'include' });
        const d = await res.json();
        if (d.success && d.stops.length > 0) {
            let autoMatch = null;
            d.stops.forEach(st => {
                const opt = document.createElement('option');
                opt.value = st.port_name;
                opt.textContent = `Stop ${st.stop_order}: ${st.port_name}`;
                dropSelect.appendChild(opt);

                // Auto-match logic based on destination
                if (GLOBAL_CURRENT_REQ) {
                    const dest = (GLOBAL_CURRENT_REQ.destination_port || GLOBAL_CURRENT_REQ.to_country || "").toLowerCase();
                    if (st.port_name.toLowerCase().includes(dest) || dest.includes(st.port_name.toLowerCase())) {
                        autoMatch = st.port_name;
                    }
                }
            });
            // Auto-select match if found, else first stop
            if (autoMatch) dropSelect.value = autoMatch;
            else dropSelect.selectedIndex = 1; // Pick the first available stop after the default option
        } else {
            const opt = document.createElement('option');
            opt.textContent = "No stops defined for this ship";
            opt.disabled = true;
            dropSelect.appendChild(opt);
        }
    } catch (e) { }
}

async function submitAccept() {
    const shipmentId = document.getElementById('accept-shipment-id').value;
    const vesselId = document.getElementById('accept-vessel-select').value;
    const dropPort = document.getElementById('accept-drop-port-select').value;
    const notes = document.getElementById('accept-notes').value;

    if (!vesselId) { toast('Please allocate a vessel.', 'error'); return; }

    try {
        const r = await fetch(`${API}/api/v3/manager/allocate-ship`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shipmentId,
                shipId: vesselId,
                cargoDropPort: dropPort,
                notes,
                departureDate: null,
                arrivalDate: null
            })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            closeModal('accept-modal');
            loadBookings();
            if (typeof loadShipments === 'function') loadShipments();
        }
    } catch (e) { toast('Error accepting booking', 'error'); }
}

async function rejectBooking(id) {
    if (!confirm('Reject this booking request?')) return;
    try {
        const r = await fetch(`${API}/api/company/bookings/reject`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId: id })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) document.getElementById(`req-${id}`)?.remove();
    } catch (e) { toast('Error', 'error'); }
}

// Also support old accept endpoint
async function acceptOld(id) {
    const r = await fetch(`${API}/api/company/accept`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: id })
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadBookings();
}

// ── SHIPMENTS ─────────────────────────────────────────────────────
async function loadShipments() {
    const tbody = document.getElementById('co-shipments-body');
    if (!tbody) return;
    tbody.innerHTML = loadRow(9);
    try {
        const r = await fetch(`${API}/api/company/all-shipments`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success) { tbody.innerHTML = errRow(9, 'Failed'); return; }
        ALL_SHIPMENTS = d.shipments;

        // Apply type filter if present
        let filtered = d.shipments;
        const typeFilter = document.getElementById('co-shipment-type-filter')?.value || '';
        if (typeFilter) filtered = filtered.filter(s => (s.type || '').toLowerCase() === typeFilter.toLowerCase());

        renderShipments(filtered);
    } catch (e) { tbody.innerHTML = errRow(9, 'Server error'); }
}

function renderShipments(list) {
    const tbody = document.getElementById('co-shipments-body');
    if (!list.length) { tbody.innerHTML = errRow(9, 'No shipments found.'); return; }
    tbody.innerHTML = list.map(s => {
        const sType = (s.type || 'Export');
        const typeBadge = sType.toLowerCase() === 'import'
            ? '<span class="badge-role" style="background:rgba(16,185,129,0.15);color:#34d399;">Import</span>'
            : '<span class="badge-role" style="background:rgba(59,130,246,0.15);color:#60a5fa;">Export</span>';
        return `
        <tr id="co-ship-${s.id}">
            <td class="font-monospace fw-bold text-primary">${s.user_prefix || 'SS'}-${s.id}</td>
            <td class="text-white">
                <div class="fw-bold">${esc(s.customer_name || '—')}</div>
                <div class="x-small text-white-50">${esc(s.mode || 'Ocean')} | ${esc(s.product_type || 'Cargo')}</div>
            </td>
            <td class="text-white-50 small">
                <div>${shortR(s)}</div>
                ${s.vessel_route ? `<div class="mt-1 fst-italic text-info opacity-75 text-truncate" style="font-size:0.65rem; max-width: 180px;" title="${esc(s.vessel_route)}">Route: ${esc(s.vessel_route).replace(/ → /g, ' &raquo; ')}</div>` : ''}
            </td>
            <td>${typeBadge}</td>
            <td>
                <div class="text-info x-small fw-bold text-truncate" style="max-width:140px;">
                    ${s.vessel_name ? `<i class="fas fa-ship me-1"></i>${esc(s.vessel_name)}` : esc(s.allocated_ship_name || s.ship_name || 'Pending Vessel')}
                </div>
                <div class="text-white-50 x-small">${s.estimated_arrival ? fmtD(s.estimated_arrival) : 'No ETA'} ${s.vessel_current_port ? `<span class="ms-1" title="Current Location">📍 ${esc(s.vessel_current_port)}</span>` : ''}</div>
            </td>
            <td>${stBadge(s.status)}</td>
            <td>
                <div class="d-flex gap-1 justify-content-end">
                    ${s.status === 'Ship Allocated' ? `<button class="btn btn-sm btn-success border-success bg-success bg-opacity-10 text-success fw-bold" onclick="quickConfirmShipment(${s.id})" title="Start Logistics Flow"><i class="fas fa-check-circle me-1"></i>Confirm</button>` : ''}
                    <button class="btn btn-sm btn-dark border-secondary text-primary" title="Manage Logistics" onclick="openShipmentManagement(${s.id})"><i class="fas fa-tasks"></i></button>
                    <button class="btn btn-sm btn-dark border-secondary text-white-50" title="View Details" onclick="openDetailsModal(${s.id})"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-dark border-secondary text-info" title="Invoice" onclick="generateInvoice(${s.id})"><i class="fas fa-file-invoice"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

let ALL_PENDING_REQUESTS = [];

async function quickConfirmShipment(id) {
    if(!confirm("Are you sure you want to Override and verify this Shipment for Live Tracking?")) return;
    try {
        const res = await fetch(`${API}/api/company/shipments/${id}/status`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Confirmed' })
        });
        const d = await res.json();
        if(d.success) {
            toast('Shipment Confirmed. Live Tracking Unlocked!', 'success');
            loadShipments(); // reload the table
            if(window.loadTrackingLogs) loadTrackingLogs();
        } else {
            toast(d.message, 'error');
        }
    } catch(e) {
        toast('Server error during confirmation', 'error');
    }
}

function openDetailsModal(id, isPending = false) {
    const s = isPending
        ? ALL_PENDING_REQUESTS.find(x => x.id == id)
        : ALL_SHIPMENTS.find(x => x.id == id);
    if (!s) return;

    let cd = {};
    try {
        cd = typeof s.cargo_details === 'string' ? JSON.parse(s.cargo_details) : (s.cargo_details || {});
    } catch (e) { cd = {}; }

    const services = cd.services || {};

    let html = `
        <div class="row g-3">
            <div class="col-12 mb-2">
                <div class="text-white-50 x-small fw-bold text-uppercase mb-1">Trade Type</div>
                <span class="badge ${s.type?.toLowerCase() === 'import' ? 'bg-success' : 'bg-primary'} px-3 py-1">
                    ${s.type || 'Export'}
                </span>
            </div>
            <div class="col-6">
                <div class="text-white-50 x-small fw-bold text-uppercase">Cargo Type</div>
                <div class="text-white fw-bold">${esc(s.product_type || 'General Cargo')}</div>
            </div>
            <div class="col-6">
                <div class="text-white-50 x-small fw-bold text-uppercase">Weight</div>
                <div class="text-white fw-bold">${s.weight_kg || s.weight || '—'} kg</div>
            </div>
            <div class="col-12 mt-3">
                <div class="text-white-50 x-small fw-bold text-uppercase">Description</div>
                <div class="text-white">${esc(s.description || 'No description provided.')}</div>
            </div>
    `;

    if (s.product_type === 'Vehicle' || cd.brand) {
        html += `
            <div class="col-12 mt-3">
                <div class="p-3 bg-primary bg-opacity-10 rounded border border-primary border-opacity-10">
                    <h6 class="text-primary x-small fw-bold mb-3 text-uppercase">Vehicle Details</h6>
                    <div class="row g-3">
                        <div class="col-3"><div class="text-white-50 x-small">BRAND</div><div class="text-white fw-bold">${esc(cd.brand || '—')}</div></div>
                        <div class="col-3"><div class="text-white-50 x-small">MODEL</div><div class="text-white fw-bold">${esc(cd.model || '—')}</div></div>
                        <div class="col-3"><div class="text-white-50 x-small">YEAR</div><div class="text-white fw-bold">${esc(cd.year || '—')}</div></div>
                        <div class="col-3"><div class="text-white-50 x-small">VIN</div><div class="text-white font-monospace small">${esc(cd.vin || '—')}</div></div>
                    </div>
                </div>
            </div>
        `;
    }

    html += `
            <div class="col-12 mt-3 text-white">
                <i class="fas fa-ship me-2 text-info"></i> SHIPPING METHOD: <span class="fw-bold text-info">${esc(cd.shippingMethod || 'General')}</span>
            </div>
            <div class="col-12 mt-3">
                <h6 class="text-white-50 x-small fw-bold mb-2 text-uppercase">Additional Services</h6>
                <div class="d-flex flex-wrap gap-2">
                    <span class="badge ${services.insurance ? 'bg-success' : 'bg-dark border border-secondary text-muted'}"><i class="fas fa-shield-alt me-1"></i>Insurance</span>
                    <span class="badge ${services.pickup ? 'bg-info text-dark' : 'bg-dark border border-secondary text-muted'}"><i class="fas fa-truck me-1"></i>Door Pickup</span>
                    <span class="badge ${services.delivery ? 'bg-warning text-dark' : 'bg-dark border border-secondary text-muted'}"><i class="fas fa-home me-1"></i>Final Delivery</span>
                </div>
            </div>
            <div class="col-md-6 mt-3">
                <div class="text-white-50 x-small fw-bold text-uppercase">HS CODE</div>
                <div class="text-white fw-bold">${esc(s.hs_code || '—')}</div>
            </div>
            <div class="col-md-6 mt-3">
                <div class="text-white-50 x-small fw-bold text-uppercase">CARGO VALUE</div>
                <div class="text-white fw-bold">$${num(s.cargo_value)}</div>
            </div>
            <div class="col-12 mt-3">
                <div class="text-white-50 x-small fw-bold text-uppercase">CONSIGNEE</div>
                <div class="text-white fw-bold">${esc(s.consignee_name || '—')} | ${esc(s.consignee_contact || '—')}</div>
            </div>
            <div class="col-12 mt-3 p-3 bg-dark rounded border border-secondary border-opacity-10">
                <div class="text-white-50 x-small fw-bold text-uppercase mb-1">Origin Country</div>
                <div class="text-white small">${esc(s.origin_country || s.origin_address)}</div>
                <div class="text-white-50 x-small fw-bold text-uppercase mt-2 mb-1">Destination Country</div>
                <div class="text-white small">${esc(s.destination_country || s.destination_address)}</div>
            </div>
        </div>
    `;

    document.getElementById('shipment-details-content').innerHTML = html;
    openModal('details-modal');
}

async function openShipmentManagement(id) {
    const s = ALL_SHIPMENTS.find(x => x.id == id);
    if (!s) return;
    
    setVal('edit-ship-id', s.id);
    setV('edit-ship-ref', `${s.user_prefix || 'SS'}-${s.id}`);
    setVal('edit-departure', s.estimated_departure ? s.estimated_departure.split('T')[0] : '');
    setVal('edit-arrival', s.estimated_arrival ? s.estimated_arrival.split('T')[0] : '');
    setVal('edit-location', s.current_port || '');

    // Load ship options
    const select = document.getElementById('edit-vessel-select');
    select.innerHTML = '<option value="">-- No Vessel Assigned --</option>';
    try {
        const ships = await fetchVessels();
        ships.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = `${v.name} (${v.type})`;
            if (v.id == s.allocated_ship_id) opt.selected = true;
            select.appendChild(opt);
        });
    } catch(e) {}

    openModal('edit-shipment-modal');
}

async function saveShipmentManagement() {
    const id = val('edit-ship-id');
    const update = {
        shipId: val('edit-vessel-select'),
        departureDate: val('edit-departure'),
        arrivalDate: val('edit-arrival'),
        location: val('edit-location')
    };

    try {
        const res = await fetch(`${API}/api/company/shipment/${id}/manage-logistics`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(update)
        });
        const d = await res.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            closeModal('edit-shipment-modal');
            loadShipments();
        }
    } catch (e) { toast('Failed to update logistics', 'error'); }
}

async function updateShipmentStatus(id) {
    const sel = document.getElementById(`status-sel-${id}`);
    if (!sel?.value) { toast('Select a status first', 'error'); return; }
    try {
        const r = await fetch(`${API}/api/company/shipments/${id}/status`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: sel.value })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadShipments();
    } catch (e) { toast('Error', 'error'); }
}

// ── VESSELS ───────────────────────────────────────────────────────
async function fetchVessels() {
    try {
        const r = await fetch(`${API}/api/company/vessels`, { credentials: 'include' });
        const d = await r.json();
        return d.success ? d.vessels : [];
    } catch (e) { return []; }
}

async function loadVessels() {
    const tbody = document.getElementById('vessels-body');
    if (!tbody) return;
    try {
        const res = await fetch(`${API}/api/v3/manager/ships/available`, { credentials: 'include' });
        const d = await res.json();
        if (!d.success || !d.ships.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No vessels available.</td></tr>'; return; }

        tbody.innerHTML = d.ships.map(v => {
            const slotsPct = Math.round((v.used_slots / v.container_slots) * 100);
            const cargoCount = ALL_SHIPMENTS.filter(s => s.allocated_ship_id == v.id).length;
            return `
            <tr class="transition-all hover-glow">
                <td class="text-white fw-bold">
                    <div>${esc(v.name)}</div>
                    <div class="x-small text-white-50 font-monospace">${v.mmsi || 'IMO-Unknown'}</div>
                </td>
                <td>
                    <div class="text-white small">${esc(v.type)}</div>
                    <div class="text-white-50 x-small">${esc(v.cargo_types || 'Multi-Modal')}</div>
                </td>
                <td>
                    <div class="d-flex justify-content-between x-small mb-1">
                        <span class="text-white-50">${v.used_slots} / ${v.container_slots} TEU</span>
                        <span class="text-primary">${slotsPct}%</span>
                    </div>
                    <div class="progress" style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px;">
                        <div class="progress-bar bg-primary" style="width:${slotsPct}%"></div>
                    </div>
                </td>
                <td>
                    <div class="text-white small fw-bold">${esc(v.current_port || 'At Sea')}</div>
                    <div class="x-small text-white-50">${v.route_stops?.length ? v.route_stops.map(s => s.port_name).join(' → ') : 'No fixed route assigned'}</div>
                </td>
                <td class="text-center">
                    <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-20 rounded-pill px-3">
                        <i class="fas fa-box-open me-1"></i> ${cargoCount}
                    </span>
                </td>
                <td>${stBadge(v.status || 'Available')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-co btn-edit btn-sm" title="Route Planner" onclick="openRouteModal(${v.id}, '${esc(v.name)}')"><i class="fas fa-map-marked-alt"></i></button>
                        <button class="btn-co btn-delete btn-sm" onclick="deleteVessel(${v.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        setV('kpi-vessels', d.ships.length);
    } catch (e) { console.error('Vessels load error:', e); }
}

// ── ROUTE STOP LOGIC ──────────────────────────────────────────────
let CURRENT_ROUTE_STOPS = [];

async function openRouteModal(shipId, shipName) {
    document.getElementById('route-ship-id').value = shipId;
    document.getElementById('route-ship-name').innerText = shipName;
    CURRENT_ROUTE_STOPS = [];

    try {
        const res = await fetch(`${API}/api/v3/manager/ship/${shipId}/route`, { credentials: 'include' });
        const d = await res.json();
        if (d.success) {
            CURRENT_ROUTE_STOPS = d.stops.sort((a, b) => a.stop_order - b.stop_order);
        }
        renderRouteStops();
    } catch (e) { toast('Failed to load route', 'error'); }

    openModal('route-modal');
}

function renderRouteStops() {
    const list = document.getElementById('route-stops-list');
    if (!CURRENT_ROUTE_STOPS.length) {
        list.innerHTML = '<div class="text-white-50 x-small text-center py-3">No stops defined. Add the journey path below.</div>';
        return;
    }
    list.innerHTML = CURRENT_ROUTE_STOPS.map((s, i) => `
        <div class="d-flex align-items-center gap-3 p-2 border-bottom border-secondary border-opacity-10">
            <div class="rounded-circle bg-primary text-white x-small fw-bold d-flex align-items-center justify-content-center" style="width:20px;height:20px;">${s.stop_order}</div>
            <div style="flex:1;">
                <div class="text-white small fw-bold">${esc(s.port_name)}</div>
                <div class="text-white-50 x-small">${fmtD(s.estimated_arrival)} → ${fmtD(s.estimated_departure)}</div>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary p-1" title="Mark Vessel Here" onclick="markVesselAt(${s.ship_id}, ${s.id}, '${esc(s.port_name)}')">
                    <i class="fas fa-map-pin"></i>
                </button>
                <button class="btn btn-link text-danger p-0" onclick="removeStop(${i})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Update Modal Map Preview
    updateRouteModalMap();
}

let routeModalMap = null;
function updateRouteModalMap() {
    const container = document.getElementById('route-preview-map');
    if (!container) return;

    if (!routeModalMap) {
        routeModalMap = L.map('route-preview-map').setView([20, 78], 4);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CARTO' }).addTo(routeModalMap);
    } else {
        routeModalMap.invalidateSize();
    }

    // Draw Polylines and Markers
    const points = CURRENT_ROUTE_STOPS
        .sort((a, b) => a.stop_order - b.stop_order)
        .filter(s => s.lat && s.lng)
        .map(s => [s.lat, s.lng]);

    // Clear existing
    routeModalMap.eachLayer(l => { if (l instanceof L.Polyline || l instanceof L.CircleMarker) routeModalMap.removeLayer(l); });

    if (points.length > 0) {
        L.polyline(points, { color: '#3b82f6', weight: 4, opacity: 0.6 }).addTo(routeModalMap);
        points.forEach((p, i) => {
            L.circleMarker(p, { radius: 5, color: '#fff' }).addTo(routeModalMap).bindPopup(`Stop ${i + 1}`);
        });
        routeModalMap.fitBounds(points, { padding: [20, 20] });
    }
}

function addStopToUI() {
    const port = document.getElementById('new-stop-port').value;
    const order = parseInt(document.getElementById('new-stop-order').value);
    const arr = document.getElementById('new-stop-arrival').value;
    const dep = document.getElementById('new-stop-departure').value;

    if (!port || isNaN(order)) { toast('Port and Order are required', 'error'); return; }

    CURRENT_ROUTE_STOPS.push({
        port_name: port,
        stop_order: order,
        estimated_arrival: arr || null,
        estimated_departure: dep || null
    });

    CURRENT_ROUTE_STOPS.sort((a, b) => a.stop_order - b.stop_order);
    renderRouteStops();

    // Clear inputs
    document.getElementById('new-stop-port').value = '';
    document.getElementById('new-stop-order').value = CURRENT_ROUTE_STOPS.length + 1;
}

async function markVesselAt(shipId, stopId, portName) {
    if (!confirm(`Mark vessel as arrived at ${portName}? This will update tracking for ALL users on this ship.`)) return;
    try {
        const r = await fetch(`${API}/api/v3/manager/ship/${shipId}/mark-current-stop`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stopId })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) loadVessels();
    } catch (e) { toast('Error updating position', 'error'); }
}

function removeStop(index) {
    CURRENT_ROUTE_STOPS.splice(index, 1);
    renderRouteStops();
}

async function saveVesselRoute() {
    const shipId = document.getElementById('route-ship-id').value;
    try {
        const r = await fetch(`${API}/api/v3/manager/ship/${shipId}/route`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stops: CURRENT_ROUTE_STOPS })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) closeModal('route-modal');
    } catch (e) { toast('Error saving route', 'error'); }
}

async function addVessel() {
    const vessel = {
        name: val('v-name'), type: val('v-type'),
        capacity: val('v-capacity'), location: val('v-location'),
        next: val('v-next'), status: val('v-status')
    };
    if (!vessel.name || !vessel.type || !vessel.capacity || !vessel.location) { 
        toast('Please fill all mandatory vessel fields (*)', 'error'); 
        return; 
    }
    const r = await fetch(`${API}/api/company/vessels`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vessel)
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) { 
        closeModal('vessel-modal'); 
        loadVessels(); 
        // INTEGRATED FLOW: Redirect to Schedules
        setTimeout(() => {
            showSection('schedules');
            toast('Vessel added! Now create a journey schedule for it.', 'info');
        }, 800);
    }
}

async function deleteVessel(vid) {
    if (!confirm('Remove this vessel?')) return;
    const r = await fetch(`${API}/api/company/vessels/${vid}`, { method: 'DELETE', credentials: 'include' });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadVessels();
}

// ── SCHEDULES ─────────────────────────────────────────────────────
async function loadSchedules() {
    const tbody = document.getElementById('schedules-body');
    if (!tbody) return;
    try {
        const r = await fetch(`${API}/api/company/schedules`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.schedules.length) { tbody.innerHTML = errRow(7, 'No schedules created yet.'); return; }
        tbody.innerHTML = d.schedules.map(s => `
            <tr>
                <td class="text-white fw-semibold">${esc(s.vessel)}</td>
                <td class="text-white-50">${esc(s.from)}</td>
                <td class="text-white-50">${esc(s.to)}</td>
                <td class="text-info">${fmtD(s.depart)}</td>
                <td class="text-success">${fmtD(s.arrive)}</td>
                <td>${stBadge('Scheduled')}</td>
                <td><button class="btn-co btn-delete" onclick="deleteSchedule(${s.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errRow(7, 'Error loading schedules'); }
}

async function addSchedule() {
    const schedule = { vessel: val('sch-vessel'), from: val('sch-from'), to: val('sch-to'), depart: val('sch-depart'), arrive: val('sch-arrive') };
    if (!schedule.vessel || !schedule.from || !schedule.to || !schedule.depart || !schedule.arrive) { 
        toast('All schedule fields are mandatory (*)', 'error'); 
        return; 
    }
    const r = await fetch(`${API}/api/company/schedules`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) { 
        closeModal('schedule-modal'); 
        loadSchedules(); 
        // INTEGRATED FLOW: Redirect to Pricing
        setTimeout(() => {
            showSection('rates');
            toast('Schedule set! Define rates for this route.', 'info');
        }, 800);
    }
}

async function deleteSchedule(sid) {
    if (!confirm('Delete this schedule?')) return;
    const r = await fetch(`${API}/api/company/schedules/${sid}`, { method: 'DELETE', credentials: 'include' });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadSchedules();
}

// ── CONTAINERS ────────────────────────────────────────────────────
let containerLog = [];
function assignContainer() {
    const shipId = val('cont-shipment-id');
    const type = val('cont-type');
    const contId = val('cont-id');
    if (!shipId || !contId) { toast('Enter shipment ID and container ID', 'error'); return; }
    containerLog.unshift({ shipId, type, contId, ts: new Date() });
    const logEl = document.getElementById('container-log');
    logEl.innerHTML = containerLog.map(c => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom" style="border-color:rgba(255,255,255,0.06)!important;">
            <div>
                <span class="text-primary fw-bold">${esc(c.user_prefix || 'SS')}-${esc(c.shipId)}</span>
                <span class="text-white ms-2">${esc(c.contId)}</span>
                <span class="badge-co b-accepted ms-2">${esc(c.type)}</span>
            </div>
            <span class="text-white-50 small">${c.ts.toLocaleTimeString()}</span>
        </div>`).join('');
    toast(`Container ${contId} assigned to ${shipId}`, 'success');

    setVal('cont-shipment-id', '');
    setVal('cont-id', '');
}

// ── PRICING ───────────────────────────────────────────────────────
async function loadPricing() {
    const tbody = document.getElementById('pricing-body');
    if (!tbody) return;
    try {
        const r = await fetch(`${API}/api/company/pricing`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.pricing.length) { tbody.innerHTML = errRow(7, 'No pricing rates set yet.'); return; }
        tbody.innerHTML = d.pricing.map(p => `
            <tr>
                <td class="text-white fw-semibold">${esc(p.from)}</td>
                <td class="text-white fw-semibold">${esc(p.to)}</td>
                <td class="text-white-50">${esc(p.mode)}</td>
                <td class="text-success">$${esc(p.rate)}/CBM</td>
                <td class="text-white-50">$${esc(p.min)}</td>
                <td class="text-info">${esc(p.days)} days</td>
                <td><button class="btn-co btn-delete" onclick="deletePrice(${p.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = errRow(7, 'Error'); }
}

async function addPrice() {
    const rate = { from: val('pr-from'), to: val('pr-to'), mode: val('pr-mode'), rate: val('pr-rate'), min: val('pr-min'), days: val('pr-days') };
    if (!rate.from || !rate.to || !rate.mode || !rate.rate || !rate.min || !rate.days) { 
        toast('All pricing fields are mandatory (*)', 'error'); 
        return; 
    }
    const r = await fetch(`${API}/api/company/pricing`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rate)
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) { 
        closeModal('price-modal'); 
        loadPricing(); 
        // INTEGRATED FLOW COMPLETED
        toast('Pricing active! You can now accept marketplace bookings with these rates.', 'success');
    }
}

async function deletePrice(pid) {
    const r = await fetch(`${API}/api/company/pricing/${pid}`, { method: 'DELETE', credentials: 'include' });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) loadPricing();
}

// ── CUSTOMERS ─────────────────────────────────────────────────────
async function loadCustomers() {
    const tbody = document.getElementById('customers-body');
    const countEl = document.getElementById('customers-count');
    if (!tbody) return;
    tbody.innerHTML = loadRow(6);
    try {
        const r = await fetch(`${API}/api/company/customers`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.customers.length) {
            tbody.innerHTML = errRow(6, 'No customers yet.');
            if (countEl) countEl.innerText = '';
            return;
        }
        if (countEl) countEl.innerText = d.customers.length;
        setV('nav-customers', d.customers.length || '--');
        
        tbody.innerHTML = d.customers.map(c => {
            const kycStatus = c.kyc_status || 'Pending';
            const kycBadge = kycStatus === 'Approved' ? 'bg-success' : kycStatus === 'Rejected' ? 'bg-danger' : 'bg-warning';
            const isActive = c.is_blocked !== 1;
            
            return `
            <tr class="transition-all hover-glow">
                <td>
                    <div class="text-white fw-bold">${esc(c.name)}</div>
                    <div class="x-small text-white-50">${esc(c.email)}</div>
                </td>
                <td class="text-center">
                    <div class="text-white small fw-bold">${c.shipment_count}</div>
                    <div class="x-small text-white-50">Shipments</div>
                </td>
                <td class="text-white-50 small">${fmtD(c.last_shipment)}</td>
                <td>
                    <span class="badge ${kycBadge} bg-opacity-10 text-capitalize px-3 rounded-pill" style="font-size:10px; border: 1px solid currentColor;">${kycStatus}</span>
                </td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleUserStatus(${c.id}, this.checked)">
                        <label class="x-small ${isActive ? 'text-success' : 'text-danger'}">${isActive ? 'Active' : 'Blocked'}</label>
                    </div>
                </td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-co btn-status py-1 px-2" onclick="location.href='mailto:${esc(c.email)}'"><i class="fas fa-envelope"></i></button>
                        <button class="btn-co btn-edit py-1 px-2" onclick="viewCustomerDetails(${c.id})"><i class="fas fa-user-gear"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = errRow(6, 'Error loading customers');
    }
}

async function toggleUserStatus(userId, active) {
    try {
        const res = await fetch(`${API}/api/company/customer/${userId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ isBlocked: !active })
        });
        const d = await res.json();
        toast(d.message || (active ? 'User Activated' : 'User Blocked'), d.success ? 'success' : 'error');
        loadCustomers();
    } catch (e) { toast('Status update failed', 'error'); }
}

// ── DOCUMENTS ─────────────────────────────────────────────────────
let ALL_DOCUMENTS_CACHE = [];

async function loadDocuments() {
    const tbody = document.getElementById('documents-body');
    if (!tbody) return;

    // Only show loading on initial fetch or empty cache
    if (!ALL_DOCUMENTS_CACHE.length) tbody.innerHTML = loadRow(6);

    try {
        if (!ALL_DOCUMENTS_CACHE.length) {
            const r = await fetch(`${API}/api/company/documents`, { credentials: 'include' });
            const d = await r.json();
            if (d.success) ALL_DOCUMENTS_CACHE = d.documents || [];
        }

        const pending = ALL_DOCUMENTS_CACHE.filter(x => x.status === 'Submitted').length;
        const verified = ALL_DOCUMENTS_CACHE.filter(x => x.status === 'Verified').length;
        const rejected = ALL_DOCUMENTS_CACHE.filter(x => x.status === 'Rejected').length;
        setV('nav-docs', pending || '');
        setV('doc-kpi-total', ALL_DOCUMENTS_CACHE.length);
        setV('doc-kpi-pending', pending);
        setV('doc-kpi-verified', verified);
        setV('doc-kpi-rejected', rejected);

        let filteredDocs = [...ALL_DOCUMENTS_CACHE];

        // Status Filter
        const filterVal = document.getElementById('doc-filter')?.value;
        if (filterVal) filteredDocs = filteredDocs.filter(doc => doc.status === filterVal);

        // Type Filter
        const typeFilterVal = document.getElementById('doc-type-filter')?.value;
        if (typeFilterVal) filteredDocs = filteredDocs.filter(doc => (doc.type || '').includes(typeFilterVal));

        // Search Filter
        const searchVal = document.getElementById('doc-search')?.value.toLowerCase();
        if (searchVal) {
            filteredDocs = filteredDocs.filter(doc =>
                (doc.shipment_ref && doc.shipment_ref.toString().includes(searchVal)) ||
                (doc.customer_name && doc.customer_name.toLowerCase().includes(searchVal))
            );
        }

        if (!filteredDocs.length) { tbody.innerHTML = errRow(6, 'No documents matched your search.'); return; }

        tbody.innerHTML = filteredDocs.map(doc => {
            const shipId = doc.shipment_ref || doc.shipment_id;
            const refStr = shipId ? `${doc.user_prefix || 'SS'}-${shipId}` : '—';

            return `
            <tr id="doc-row-${doc.id}">
                <td>
                    <div class="font-monospace text-primary fw-bold">${refStr}</div>
                </td>
                <td>
                    <div class="text-white fw-bold">${esc(doc.customer_name || 'Customer')}</div>
                    <div class="text-white-50 small">${esc(doc.cargo_type || 'General Cargo')}</div>
                </td>
                <td>
                    <div class="text-white fw-semibold"><i class="fas fa-file-alt text-secondary me-2"></i>${esc(doc.doc_name || doc.name || 'Document')}</div>
                    <div class="text-white-50 small">${esc(doc.type || '—')}</div>
                </td>
                <td>${stBadge(doc.status)}</td>
                <td>
                    <div class="text-white-50">${fmtD(doc.uploaded_at)}</div>
                    <div class="small text-info">By ${esc(doc.uploader_name || '—')}</div>
                </td>
                <td>
                    <div class="d-flex gap-2">
                        ${doc.file_url ? `<button onclick="previewCompanyDoc('${doc.file_url}', '${esc(doc.doc_name || 'Document')}')" class="btn-co btn-status text-primary" title="Preview Document"><i class="fas fa-eye"></i></button>` : ''}
                        ${doc.file_url ? `<a href="${doc.file_url}" target="_blank" download class="btn-co btn-status text-info" title="Download"><i class="fas fa-download"></i></a>` : ''}
                        <button class="btn-co btn-accept" onclick="verifyDoc(${doc.id},'Verified')" title="Approve"><i class="fas fa-check"></i></button>
                        <button class="btn-co btn-reject" onclick="verifyDoc(${doc.id},'Rejected')" title="Reject / Request Re-upload"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { console.error(e); tbody.innerHTML = errRow(6, 'Error loading documents'); }
}

async function verifyDoc(id, status) {
    const r = await fetch(`${API}/api/company/documents/${id}/verify`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) {
        ALL_DOCUMENTS_CACHE = []; // clear cache to force refetch
        loadDocuments();
    }
}

function previewCompanyDoc(url, filename) {
    if (!url) return toast('Document URL not available', 'error');
    document.getElementById('previewTitle').innerHTML = `<i class="fas fa-file-alt text-primary me-2"></i> Document Preview: ${filename}`;
    document.getElementById('previewFrame').src = url;
    const modal = new bootstrap.Modal(document.getElementById('previewModal'));
    modal.show();
}

async function managerUploadDocument() {
    const type = document.getElementById('mgrDocType').value;
    const shipmentId = document.getElementById('mgrShipmentId').value;
    const fileInput = document.getElementById('mgrDocFile');

    if (!shipmentId) return toast("Target Shipment ID is required.", "error");
    if (!fileInput.files.length) return toast("Please select a document file.", "error");

    const formData = new FormData();
    formData.append('docFile', fileInput.files[0]);
    formData.append('type', type);
    formData.append('shipmentId', shipmentId);
    formData.append('docName', fileInput.files[0].name);

    try {
        const res = await fetch(`${API}/api/documents/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await res.json();
        if (data.success) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('managerDocUploadModal'));
            modal.hide();

            // clear form
            document.getElementById('managerUploadForm').reset();

            toast("Logistics document uploaded and attached successfully!", "success");

            ALL_DOCUMENTS_CACHE = []; // clear cache
            loadDocuments();
        } else {
            toast(data.error || "Upload failed", "error");
        }
    } catch (err) {
        console.error(err);
        toast("Network error during upload.", "error");
    }
}

function downloadAllDocs() {
    // In a real application, this would trigger a backend endpoint that zips all filteredDocuments
    // For this demo, we'll open download links natively for the currently filtered view.
    const container = document.getElementById('documents-body');
    const links = container.querySelectorAll('a[download]');
    if (links.length === 0) return toast("No documents visible to download.", "warning");

    toast(`Initiating download for ${Math.min(links.length, 5)} documents...`, "info");

    // Prevent opening too many tabs at once, cap to 5
    const limit = Math.min(links.length, 5);
    for (let i = 0; i < limit; i++) {
        setTimeout(() => links[i].click(), i * 500);
    }

    if (links.length > 5) {
        setTimeout(() => toast(`To prevent browser blocking, only 5 documents were downloaded. Please use specific filters to narrow down.`, "warning"), 3000);
    }
}

// ── TRACKING ──────────────────────────────────────────────────────
async function loadTrackingLogs() {
    const el = document.getElementById('tracking-timeline');
    if (!el) return;
    try {
        const r = await fetch(`${API}/api/admin/logs`, { credentials: 'include' });
        const d = await r.json();
        if (!d.success || !d.logs.length) { el.innerHTML = '<p class="text-white-50 small text-center py-4">No tracking events yet.</p>'; return; }
        el.innerHTML = d.logs.slice(0, 10).map(l => `
            <div class="tl-entry">
                <div class="tl-dot"><i class="fas fa-circle" style="font-size:6px;"></i></div>
                <div>
                    <div class="text-white small fw-semibold">${l.user_prefix || 'SS'}-${l.shipment_id} • ${esc(l.stage || '—')}</div>
                    <div class="text-white-50 small">${esc(l.description || '—')}</div>
                    <div class="text-muted" style="font-size:10px;">${fmtD(l.updated_at)}</div>
                </div>
            </div>`).join('');
    } catch (e) { el.innerHTML = '<p class="text-danger small">Failed to load events.</p>'; }
}

function lookupShipmentForTracking() {
    const q = val('tr-lookup').toLowerCase();
    const src = val('tr-source').toLowerCase();
    const dst = val('tr-dest').toLowerCase();
    const resultsArea = document.getElementById('vessel-search-results');
    if (!resultsArea) return;

    if (!q && !src && !dst) { resultsArea.innerHTML = ''; return; }

    const matches = ALL_SHIPMENTS.filter(s => {
        const idMatch = !q || String(s.id).includes(q) || (s.customer_name || '').toLowerCase().includes(q);
        const routeMatch = (!src || (s.origin_address || '').toLowerCase().includes(src)) && 
                          (!dst || (s.destination_address || '').toLowerCase().includes(dst));
        return idMatch && routeMatch;
    });

    if (matches.length > 0) {
        resultsArea.innerHTML = matches.map(s => `
            <div class="booking-card mb-2 p-3 border border-secondary border-opacity-10" id="search-res-${s.id}" style="cursor:pointer;" onclick="selectShipmentForTracking(${s.id})">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="text-white small fw-bold">${esc(s.customer_name)}</div>
                        <div class="text-white-50 x-small">${s.origin_address} → ${s.destination_address}</div>
                    </div>
                    <span class="badge bg-primary x-small">${s.user_prefix || 'SH'}-${s.id}</span>
                </div>
            </div>
        `).join('');
    } else {
        resultsArea.innerHTML = `<div class="text-white-50 x-small text-center py-3">No matching shipments found for this route.</div>`;
    }
}

async function selectShipmentForTracking(id) {
    const s = ALL_SHIPMENTS.find(x => x.id === id);
    if (!s) return;

    // Highlight selected card
    document.querySelectorAll('#vessel-search-results .booking-card').forEach(el => el.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10'));
    const selectedEl = document.getElementById(`search-res-${id}`);
    if (selectedEl) selectedEl.classList.add('border-primary', 'bg-primary', 'bg-opacity-10');

    setVal('tr-shipment', s.id);
    document.getElementById('push-track-btn').disabled = false;
    
    // 3. Pre-fill Search Context (UI Cleanup)
    document.getElementById('tr-source').value = s.origin_address || s.from_country || '';
    document.getElementById('tr-dest').value = s.destination_address || s.to_country || '';

    // 1. Update Map Context
    updateTrackingContextMap(s);

    // 2. Fetch and Render Recent Events (Internal + External)
    const timeline = document.getElementById('tracking-timeline');
    if (timeline) {
        timeline.innerHTML = '<div class="text-white-50 small text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Loading History...</div>';
        try {
            const res = await fetch(`${API}/api/shipment/${id}/tracking`, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                let eventsHtml = '';

                // Combine Local Logs and External Parcel Data
                const allEvents = [...(data.logs || [])];
                
                if (data.external && data.external.events) {
                    data.external.events.forEach(ev => {
                        allEvents.push({
                            stage: `[COURIER] ${ev.status}`,
                            description: ev.location,
                            updated_at: ev.date
                        });
                    });
                }

                // Sort by time
                allEvents.sort((a,b) => new Date(b.updated_at || b.timestamp) - new Date(a.updated_at || a.timestamp));

                if (allEvents.length === 0) {
                    eventsHtml = '<p class="text-white-50 small text-center py-4">No tracking history found.</p>';
                } else {
                    eventsHtml = allEvents.map(l => `
                        <div class="tl-entry">
                            <div class="tl-dot bg-dark border-secondary"><i class="fas fa-map-marker-alt" style="font-size:10px;"></i></div>
                            <div>
                                <div class="text-white small fw-bold">${esc(l.stage || l.status || 'Update')}</div>
                                <div class="text-white-50 x-small">${esc(l.description || l.location_note || '—')}</div>
                                <div class="text-muted mt-1" style="font-size:10px;">${fmtD(l.updated_at || l.timestamp)}</div>
                            </div>
                        </div>
                    `).join('');
                }
                timeline.innerHTML = eventsHtml;
            }
        } catch (e) {
            timeline.innerHTML = '<p class="text-danger small text-center">Failed to load real-time events.</p>';
        }
    }
}

async function submitIntegratedAccept() {
    const sid = val('accept-shipment-id');
    const shipId = val('accept-vessel-select');
    const dropPort = val('accept-drop-port-select');
    const dep = val('accept-departure');
    const arr = val('accept-arrival');
    
    // Quotes (Point 4)
    const q1 = val('quote-economy'), q2 = val('quote-standard'), q3 = val('quote-express');
    
    // Docs (Point 3)
    const docs = Array.from(document.querySelectorAll('#accept-docs-checklist input:checked')).map(i => i.value);

    if (!shipId || !q2) { toast('Assign a vessel and at least Standard Price', 'error'); return; }

    try {
        const r = await fetch(`${API}/api/v3/manager/shipment/${sid}/integrated-accept`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shipId, 
                cargoDropPort: dropPort,
                departureDate: dep,
                arrivalDate: arr,
                docs,
                quotes: [
                    { name: 'Economy', price: q1 || (q2*0.8), transitTime: 'Slow/Ocean' },
                    { name: 'Standard', price: q2, transitTime: 'Direct Sea' },
                    { name: 'Express', price: q3 || (q2*1.4), transitTime: 'Fast/Priority' }
                ]
            })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            closeModal('accept-modal');
            loadBookings();
        }
    } catch (e) { toast('Server Error', 'error'); }
}

let contextMapInstance = null;
async function updateTrackingContextMap(s) {
    const el = document.getElementById('tracking-context-map');
    if (!el) return;
    if (!contextMapInstance) {
        L.Icon.Default.imagePath = 'dist/images/';
        contextMapInstance = L.map('tracking-context-map').setView([20, 78], 3);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CARTO' }).addTo(contextMapInstance);
    } else {
        contextMapInstance.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline) contextMapInstance.removeLayer(l); });
    }

    const points = [];
    const addPt = (lat, lng, iconHtml, label) => {
        if (!lat || !lng) return;
        const icon = L.divIcon({ html: `<div class="map-pnt-icon">${iconHtml}</div>`, className: 'custom-map-icon', iconSize: [30, 30], iconAnchor: [15, 15] });
        L.marker([lat, lng], { icon }).addTo(contextMapInstance).bindPopup(`<b>${label}</b>`);
        points.push([lat, lng]);
    };

    // 1. Plot Ports (Origin/Dest)
    addPt(s.origin_lat, s.origin_lng, '<i class="fas fa-home text-success"></i>', 'Origin: ' + (s.origin_address || 'Source'));
    addPt(s.dest_lat, s.dest_lng, '<i class="fas fa-flag-checkered text-danger"></i>', 'Destination: ' + (s.destination_address || 'Dest'));

    const plannedPoints = [[s.origin_lat, s.origin_lng], [s.dest_lat, s.dest_lng]];
    const actualPoints = [];

    // 2. Multi-Stops (Vessel Plan)
    if (s.allocated_ship_id) {
        try {
            const r = await fetch(`${API}/api/v3/manager/ship/${s.allocated_ship_id}/route`, { credentials: 'include' });
            const d = await r.json();
            if (d.success && d.stops) {
                const routeStops = d.stops.sort((a,b) => a.stop_order - b.stop_order);
                routeStops.forEach(st => {
                    addPt(st.lat, st.lng, '<i class="fas fa-anchor text-info"></i>', 'Stop: ' + st.port_name);
                    plannedPoints.splice(plannedPoints.length-1, 0, [st.lat, st.lng]); // Insert between O and D
                });
            }
        } catch (e) {}
    }

    // 3. Historical Tracking Logs (Actual Trail)
    try {
        const r2 = await fetch(`${API}/api/shipment/${s.id}/tracking`, { credentials: 'include' });
        const d2 = await r2.json();
        if (d2.success && d2.logs) {
            d2.logs.forEach(l => {
                const iconHtml = '<i class="fas fa-ship text-primary" style="font-size:12px;"></i>';
                const icon = L.divIcon({ html: `<div class="map-pnt-icon">${iconHtml}</div>`, className: 'custom-map-icon', iconSize:[26,26] });
                L.marker([l.lat, l.lng], { icon }).addTo(contextMapInstance).bindPopup(`<b>Ping: ${l.status}</b>`);
                actualPoints.push([l.lat, l.lng]);
            });
        }
    } catch(e) {}

    // Draw Planned Path (Dashed)
    if (plannedPoints.filter(p => p[0]).length > 1) {
        L.polyline(plannedPoints.filter(p => p[0]), { color: '#ffffff', weight: 1, dashArray: '10, 15', opacity: 0.3 }).addTo(contextMapInstance);
    }
    // Draw Actual Path (Solid Blue)
    if (actualPoints.length > 0) {
        const trail = L.polyline(actualPoints, { color: '#3b82f6', weight: 3, opacity: 0.8 }).addTo(contextMapInstance);
        contextMapInstance.fitBounds(trail.getBounds(), { padding: [50, 50] });
    } else if (plannedPoints.filter(p => p[0]).length > 1) {
        contextMapInstance.fitBounds(L.polyline(plannedPoints.filter(p => p[0])).getBounds(), { padding: [50, 50] });
    }
}
async function submitTracking() {
    const shipmentId = val('tr-shipment');
    if (!shipmentId) { toast('Select a shipment first', 'error'); return; }
    
    // Bind to the exact UI Dropdown value to pass strict Validation Strings
    const status = val('tr-event'); 
    
    const s = ALL_SHIPMENTS.find(x => x.id == shipmentId);
    const location = s?.vessel_current_port || 'AIS Network Ping';

    // Disable button to prevent double fire
    const btn = document.getElementById('push-track-btn');
    if (btn) btn.disabled = true;

    try {
        const r = await fetch(`${API}/api/company/tracking/update`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId, status, location, notes: `Manual status logged by system: ${status}` })
        });
        const d = await r.json();
        toast(d.success ? 'Live Pipeline Successfully Updated!' : d.message, d.success ? 'success' : 'error');
        
        if (d.success) {
            // refresh timeline visual right side
            selectShipmentForTracking(shipmentId);
            // Refresh main table
            loadShipments(); 
        }
    } catch (e) { 
        toast('Server error over pipeline', 'error'); 
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ── FINANCIAL ─────────────────────────────────────────────────────
async function loadFinance() {
    try {
        const r = await fetch(`${API}/api/company/finance/summary`, { credentials: 'include' });
        const d = await r.json();
        if (d.success) {
            setV('fin-revenue', `₹${num(d.totalRevenue * 84)}`);
            const months = d.monthly.map(m => m.month);
            const earnings = d.monthly.map(m => Number(m.earnings));
            const counts = d.monthly.map(m => Number(m.shipment_count));
            setV('fin-completed', counts.reduce((a, b) => a + b, 0));
            const totalShips = counts.reduce((a, b) => a + b, 0);
            const totalRev = earnings.reduce((a, b) => a + b, 0);
            setV('fin-avg', totalShips ? `₹${num(totalRev / totalShips * 84)}` : '₹0');
            drawBar('chart-earnings', months, earnings, 'Earnings ($)', '#22c55e');
            drawDoughnut('chart-rev-pie', ['Ocean FCL', 'Air Freight', 'LCL'], [60, 25, 15]);
        }
    } catch (e) { console.error('Finance error:', e); }

    // Finance table (recent delivered shipments)
    try {
        const r2 = await fetch(`${API}/api/company/all-shipments`, { credentials: 'include' });
        const d2 = await r2.json();
        const tbody = document.getElementById('finance-body');
        if (!tbody) return;
        const delivered = (d2.shipments || []).filter(s => s.status === 'Delivered').slice(0, 10);
        if (!delivered.length) { tbody.innerHTML = errRow(7, 'No completed shipments yet.'); return; }
        tbody.innerHTML = delivered.map(s => {
            const sType = (s.type || 'Export');
            const typeBadge = sType.toLowerCase() === 'import'
                ? '<span class="badge-role" style="background:rgba(16,185,129,0.15);color:#34d399;">Import</span>'
                : '<span class="badge-role" style="background:rgba(59,130,246,0.15);color:#60a5fa;">Export</span>';
            return `
            <tr>
                <td class="font-monospace text-primary fw-bold">${s.user_prefix || 'SS'}-${s.id}</td>
                <td class="text-white">${esc(s.customer_name || '—')}</td>
                <td class="text-white-50 small">${shortR(s)}</td>
                <td>${typeBadge}</td>
                <td class="text-white-50">₹${num(s.estimated_cost * 84)}</td>
                <td class="text-success">₹${num(s.estimated_cost * 84 * 0.95)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-info rounded-pill px-3 py-1" onclick="generateInvoice(${s.id})">
                        <i class="fas fa-file-invoice me-1"></i> Invoice
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
async function loadNotifications() {
    try {
        const r = await fetch(`${API}/api/company/notifications`, { credentials: 'include' });
        const d = await r.json();
        CO_NOTIFICATIONS = d.success ? d.notifications : [];

        // Unread count
        const unread = CO_NOTIFICATIONS.filter(n => !n.is_read).length;
        const badge = document.getElementById('notif-count');
        if (badge) { badge.style.display = unread ? 'flex' : 'none'; badge.innerText = unread; }

        // Dropdown list
        const list = document.getElementById('notif-list');
        if (list) {
            list.innerHTML = CO_NOTIFICATIONS.length
                ? CO_NOTIFICATIONS.slice(0, 8).map((n, i) => `
                    <div class="notif-item ${!n.is_read ? 'unread' : ''}" onclick="markRead(${i})">
                        <div class="d-flex justify-content-between">
                            <span class="text-white small fw-semibold">${esc(n.title)}</span>
                            <span class="text-muted" style="font-size:10px;">${fmtD(n.created_at)}</span>
                        </div>
                        <div class="text-white-50 small mt-1">${esc(n.message)}</div>
                    </div>`).join('')
                : '<div class="text-white-50 text-center py-4 small">No new notifications.</div>';
        }

        // Full notifications section
        const fullList = document.getElementById('notif-full-list');
        if (fullList) {
            fullList.innerHTML = CO_NOTIFICATIONS.length
                ? CO_NOTIFICATIONS.map(n => `
                    <div class="booking-card mb-3 d-flex justify-content-between align-items-start">
                        <div>
                            <span class="badge-co ${n.type === 'error' ? 'b-declined' : n.type === 'success' ? 'b-delivered' : 'b-accepted'} me-2">${esc(n.type || 'info')}</span>
                            <span class="text-white fw-semibold">${esc(n.title)}</span>
                            <div class="text-white-50 small mt-1">${esc(n.message)}</div>
                        </div>
                        <span class="text-white-50 small ms-3">${fmtD(n.created_at)}</span>
                    </div>`).join('')
                : '<div class="text-white-50 text-center py-5">No notifications yet.</div>';
        }
    } catch (e) { console.error('Notifications error:', e); }
}

async function generateInvoice(id) {
    toast(`Generating invoice for Shipment #${id}...`, 'info');
    try {
        const res = await fetch(`${API}/api/finance/invoice/generate/${id}`, { method: 'POST', credentials: 'include' });
        const d = await res.json();
        if (d.success) {
            toast('Invoice generated successfully!', 'success');
            window.open(`documents.html?shipmentId=${id}`, '_blank');
        } else {
            toast(d.error || 'Failed to generate', 'error');
        }
    } catch (e) { toast('Server error', 'error'); }
}

function toggleNotifs() {
    const dd = document.getElementById('notif-dropdown');
    dd.classList.toggle('show');
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.bell-wrap')) dd.classList.remove('show');
    }, { once: true });
}

async function markRead(index) {
    const n = CO_NOTIFICATIONS[index];
    if (!n || n.is_read) return;

    try {
        await fetch(`${API}/api/notifications/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId: n.id }),
            credentials: 'include'
        });
        n.is_read = true;
        loadNotifications(); // Refresh both dropdown and full list
    } catch (e) { console.error('Failed to mark read', e); }
}

async function markAllRead() {
    try {
        await fetch(`${API}/api/notifications/read-all`, {
            method: 'POST',
            credentials: 'include'
        });
        CO_NOTIFICATIONS.forEach(n => n.is_read = true);
        loadNotifications();
    } catch (e) { console.error('Failed to mark all read', e); }
}

// ── DOCUMENT UPLOAD ───────────────────────────────────────────────
async function submitDocuments() {
    const fi = document.getElementById('doc-file-input');
    if (!fi?.files.length) { toast('Select a file first', 'error'); return; }
    const form = new FormData();
    form.append('document', fi.files[0]);
    try {
        const r = await fetch(`${API}/api/company/upload-documents`, { method: 'POST', credentials: 'include', body: form });
        const d = await r.json();
        toast(d.message || (d.success ? 'Documents submitted!' : 'Failed'), d.success ? 'success' : 'error');
    } catch (e) { toast('Upload error', 'error'); }
}

// ── LOGOUT ────────────────────────────────────────────────────────
function handleLogout() {
    fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' }).finally(() => { location.href = 'auth.html'; });
}

// ── SEARCH FILTER ─────────────────────────────────────────────────
function filterTable(tbodyId, searchId, cols) {
    const q = (document.getElementById(searchId)?.value || '').toLowerCase();
    [...document.querySelectorAll(`#${tbodyId} tr`)].forEach(row => {
        const cells = row.querySelectorAll('td');
        const match = cols.some(c => cells[c]?.innerText.toLowerCase().includes(q));
        row.style.display = !q || match ? '' : 'none';
    });
}

// ── CHARTS ────────────────────────────────────────────────────────
function drawBar(id, labels, data, label, color) {
    const el = document.getElementById(id);
    if (!el) return;
    const ex = Chart.getChart(id);
    if (ex) ex.destroy();
    new Chart(el, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{ label, data: data.length ? data : [1, 3, 5, 2, 7, 4], backgroundColor: color + '55', borderColor: color, borderWidth: 2, borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#888' }, grid: { color: '#1a2035' } }, y: { ticks: { color: '#888' }, grid: { color: '#1a2035' } } } }
    });
}

function drawDoughnut(id, labels, data) {
    const el = document.getElementById(id);
    if (!el) return;
    const ex = Chart.getChart(id);
    if (ex) ex.destroy();
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    new Chart(el, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 6 }] },
        options: { responsive: true, cutout: '70%', plugins: { legend: { labels: { color: '#888', font: { size: 11 } } } } }
    });
}

// ── MODALS ────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id, e) { if (!e || e.target.id === id) document.getElementById(id).style.display = 'none'; }

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
    const icons = { success: 'fa-check-circle text-success', error: 'fa-times-circle text-danger', info: 'fa-info-circle text-info' };
    const el = document.getElementById('co-toast');
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.style.borderColor = type === 'success' ? 'rgba(34,197,94,0.3)' : type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)';
    item.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span class="text-white small">${esc(msg)}</span>`;
    el.appendChild(item);
    setTimeout(() => item.remove(), 3500);
}

// ── HELPERS ───────────────────────────────────────────────────────
function setV(id, v) { const el = document.getElementById(id); if (el) el.innerText = v; }
function val(id) { return document.getElementById(id)?.value?.trim() || ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtD(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function num(n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function shortR(s) { return `${String(s.origin_address || s.from_country || '—').substring(0, 18)} → ${String(s.destination_address || s.to_country || '—').substring(0, 18)}`; }
function loadRow(c) { return `<tr><td colspan="${c}" class="text-center py-4 text-white-50"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Loading...</td></tr>`; }
function errRow(c, m) { return `<tr><td colspan="${c}" class="text-center py-4 text-white-50">${esc(m)}</td></tr>`; }

function stBadge(s) {
    const map = {
        'Booked': 'b-booked', 'booked': 'b-booked', 'Accepted': 'b-accepted', 'At Port': 'b-port',
        'In Transit': 'b-transit', 'Delivered': 'b-delivered', 'delivered': 'b-delivered',
        'Declined': 'b-declined', 'Rejected': 'b-declined', 'Verified': 'b-delivered', 'Submitted': 'b-booked',
        'Available': 'b-accepted', 'At Sea': 'b-transit', 'Maintenance': 'b-declined', 'Scheduled': 'b-port',
        'Pending Manager Approval': 'b-booked', 'Ship Allocated': 'b-port', 'Documents Pending': 'b-booked',
        'Payment Pending': 'b-booked', 'Cargo Ready': 'b-accepted', 'Confirmed': 'b-accepted',
        'Cargo Loaded': 'b-port'
    };
    const cls = map[s] || 'b-accepted';
    return `<span class="badge-co ${cls}">${esc(s)}</span>`;
}
// ── FLEET TRACKING MAP (MANAGER VIEW) ──────────────────────────────
let fleetMap = null;
let fleetMarkers = {};
let routeLines = [];

async function initDashboardMap() {
    const mapEl = document.getElementById('fleet-map');
    if (!mapEl) return;

    if (!fleetMap) {
        L.Icon.Default.imagePath = 'dist/images/';
        fleetMap = L.map('fleet-map').setView([15, 75], 3);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© CARTO'
        }).addTo(fleetMap);
    } else {
        fleetMap.invalidateSize();
    }

    // Clear previous
    Object.values(fleetMarkers).forEach(m => fleetMap.removeLayer(m));
    routeLines.forEach(l => fleetMap.removeLayer(l));
    fleetMarkers = {};
    routeLines = [];

    try {
        const res = await fetch(`${API}/api/v3/manager/ships/available`, { credentials: 'include' });
        const data = await res.json();

        if (data.success) {
            for (const s of data.ships) {
                // 1. Draw Vessel Marker
                if (s.current_lat && s.current_lng) {
                    const icon = L.divIcon({
                        html: `<i class="fas fa-ship fa-lg" style="color:#3b82f6; text-shadow: 0 0 8px #3b82f6;"></i>`,
                        className: 'vessel-marker', iconSize: [20, 20]
                    });
                    const m = L.marker([s.current_lat, s.current_lng], { icon })
                        .addTo(fleetMap)
                        .bindPopup(`<b>${esc(s.name)}</b><br>${esc(s.status)}<br>Port: ${esc(s.current_port || 'At Sea')}`);
                    fleetMarkers[s.id] = m;
                }

                // 2. Load and Draw Route Polylines
                const rRes = await fetch(`${API}/api/v3/manager/ship/${s.id}/route`, { credentials: 'include' });
                const rData = await rRes.json();
                if (rData.success && rData.stops.length > 1) {
                    const points = rData.stops
                        .sort((a, b) => a.stop_order - b.stop_order)
                        .filter(st => st.lat && st.lng)
                        .map(st => [st.lat, st.lng]);

                    if (points.length > 1) {
                        const line = L.polyline(points, {
                            color: '#3b82f6', weight: 2, opacity: 0.4, dashArray: '5, 10'
                        }).addTo(fleetMap);
                        routeLines.push(line);

                        // Draw Port Dots
                        rData.stops.forEach(st => {
                            if (st.lat && st.lng) {
                                L.circleMarker([st.lat, st.lng], {
                                    radius: 3, color: '#fff', weight: 1, fillOpacity: 0.7
                                }).addTo(fleetMap).bindPopup(`Stop: ${esc(st.port_name)}`);
                            }
                        });
                    }
                }
            }
        }
    } catch (e) { console.error('Fleet Map Error:', e); }
}

async function submitDirectShipment() {
    const cargo = {
        customerNameManual: val('ds-customer'),
        fromCountry: val('ds-from'),
        toCountry: val('ds-to'),
        trackingNumber: val('ds-tracking'),
        mode: val('ds-mode'),
        productType: val('ds-product')
    };

    if (!cargo.customerNameManual || !cargo.fromCountry || !cargo.toCountry || !cargo.trackingNumber) {
        toast('Fill all mandatory fields (*)', 'error'); return;
    }

    try {
        const r = await fetch(`${API}/api/shipment/manager/create`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cargo)
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            const mEl = document.getElementById('directShipmentModal');
            const modal = bootstrap.Modal.getInstance(mEl) || new bootstrap.Modal(mEl);
            modal.hide();
            loadShipments();
            document.getElementById('directShipmentForm').reset();
        }
    } catch (e) { toast('Error creating shipment', 'error'); }
}

// ── AUTO-REFRESH (30s HEARTBEAT) ──────────────────────────────────
setInterval(() => {
    // If tracking section is active, refresh the selected shipment tracking
    const activeSection = document.querySelector('.co-section.active');
    if (activeSection && activeSection.id === 'section-tracking') {
        const selectedId = val('tr-shipment');
        if (selectedId) {
            console.log('🔄 Live Pulse: Refreshing Shipment #' + selectedId);
            selectShipmentForTracking(parseInt(selectedId));
        }
    }
}, 30000); 

// ── SUPPORT TICKETS ───────────────────────────────────────────────
async function loadCompanyTickets() {
    const list = document.getElementById('support-tickets-body');
    const statusFilter = val('support-status-filter');
    if (!list) return;

    try {
        const res = await fetch(`${API}/api/support/company-tickets`, { credentials: 'include' });
        const data = await res.json();
        
        if (data.success) {
            let tickets = data.tickets;
            if (statusFilter) {
                tickets = tickets.filter(t => t.status === statusFilter);
            }

            // Update badge
            const openCount = data.tickets.filter(t => t.status === 'Open').length;
            const badge = document.getElementById('nav-support');
            if (badge) {
                badge.innerText = openCount || '--';
                badge.style.display = openCount > 0 ? 'inline-block' : 'none';
            }

            if (tickets.length === 0) {
                list.innerHTML = '<tr><td colspan="7" class="text-center text-white-50 py-4">No tickets found.</td></tr>';
                return;
            }

            list.innerHTML = tickets.map(t => `
                <tr class="transition-all hover-glow">
                    <td><span class="text-info fw-bold">TKT-${t.id}</span></td>
                    <td>
                        <div class="fw-bold text-white">${t.customer_name}</div>
                        <div class="x-small text-white-50">${t.customer_email}</div>
                    </td>
                    <td>
                        <div class="x-small badge bg-dark border border-secondary border-opacity-20">#${t.shipment_id || 'N/A'}</div>
                        <div class="x-small text-white-50 mt-1">${t.tracking_number || ''}</div>
                    </td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-white border border-white border-opacity-10">${t.issue_type}</span></td>
                    <td style="max-width: 200px;">
                        <div class="text-truncate text-white-50 small" title="${t.description}">${t.description}</div>
                    </td>
                    <td>
                        <span class="badge ${getTicketStatusClass(t.status)} px-3 rounded-pill">${t.status}</span>
                    </td>
                    <td>
                        <div class="d-flex gap-1">
                            <select class="co-input py-1 px-2 x-small" style="width:110px;" onchange="updateTicketStatus(${t.id}, this.value)">
                                <option value="Open" ${t.status === 'Open' ? 'selected' : ''}>Open</option>
                                <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                <option value="Resolved" ${t.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                                <option value="Closed" ${t.status === 'Closed' ? 'selected' : ''}>Closed</option>
                            </select>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

function getTicketStatusClass(status) {
    switch (status) {
        case 'Open': return 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25';
        case 'In Progress': return 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25';
        case 'Resolved': return 'bg-success bg-opacity-10 text-success border border-success border-opacity-25';
        default: return 'bg-secondary bg-opacity-10 text-white-50 border border-secondary border-opacity-25';
    }
}

async function updateTicketStatus(id, newStatus) {
    try {
        const res = await fetch(`${API}/api/support/ticket/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });
        const d = await res.json();
        if (d.success) {
            showToast(`Ticket TKT-${id} updated to ${newStatus}`, 'success');
            loadCompanyTickets();
        }
    } catch (e) { showToast('Update failed', 'error'); }
}
