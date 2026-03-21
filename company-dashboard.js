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
        schedules: '📅 Schedule Management', containers: '📦 Container Management',
        pricing: '💰 Pricing & Rates', customers: '👤 Customer Management',
        documents: '📄 Document Handling', tracking: '🗺️ Tracking Updates',
        finance: '💹 Financial Management', notifications: '🔔 Notifications'
    };
    setV('section-title', titles[name] || 'Partner Hub');

    const loaders = {
        bookings: loadBookings, shipments: loadShipments,
        vessels: loadVessels, schedules: loadSchedules,
        pricing: loadPricing, customers: loadCustomers,
        documents: loadDocuments, tracking: loadTrackingLogs,
        finance: loadFinance, notifications: loadNotifications
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
    if (!grid) return;
    grid.innerHTML = '<div class="text-white-50 text-center py-5"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Loading...</div>';
    try {
        const r = await fetch(`${API}/api/v3/manager/booking-requests`, { credentials: 'include' });
        const d = await r.json();
        ALL_PENDING_REQUESTS = d.success ? d.requests : [];
        if (!d.success || !d.requests.length) {
            grid.innerHTML = `<div class="co-table-wrap p-5 text-center"><i class="fas fa-inbox fa-2x text-white-50 mb-3 d-block"></i><span class="text-white-50">No pending booking requests.</span></div>`;
            setV('bookings-count', '0 pending');
            setV('nav-bookings', '0');
            return;
        }
        setV('bookings-count', `${d.requests.length} pending`);
        setV('nav-bookings', d.requests.length);
        grid.innerHTML = d.requests.map(req => `
            <div class="booking-card new-req" id="req-${req.id}">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <span class="badge-co b-booked me-2">${req.mode || 'Ocean'} Freight</span>
                        ${(req.type || 'Export').toLowerCase() === 'import' ? '<span class="badge-role me-2" style="background:rgba(16,185,129,0.15);color:#34d399;">Import</span>' : '<span class="badge-role me-2" style="background:rgba(59,130,246,0.15);color:#60a5fa;">Export</span>'}
                        <span class="text-white-50 small">REQ-${req.id}</span>
                        <div class="text-white fw-bold mt-1" style="font-size:1rem;">
                            ${esc(req.origin_address || req.from_country || '—')} → ${esc(req.destination_address || req.to_country || '—')}
                        </div>
                        <div class="text-white-50 small mt-1"><i class="fas fa-user me-1"></i>${esc(req.customer_name || 'Customer')}</div>
                    </div>
                    <div class="text-end">
                        <div class="text-success fw-bold" style="font-size:1.1rem;">$${num(req.estimated_cost)}</div>
                        <div class="text-white-50 small mt-1">${fmtD(req.created_at)}</div>
                    </div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-4"><div class="co-table-wrap p-2 text-center"><div class="text-white-50" style="font-size:0.68rem;">WEIGHT</div><div class="text-white fw-semibold">${req.weight ? req.weight + ' kg' : '—'}</div></div></div>
                    <div class="col-4"><div class="co-table-wrap p-2 text-center"><div class="text-white-50" style="font-size:0.68rem;">CARGO</div><div class="text-white fw-semibold">${esc(req.product_type || 'General')}</div></div></div>
                    <div class="col-4"><div class="co-table-wrap p-2 text-center"><div class="text-white-50" style="font-size:0.68rem;">CONTAINER</div><div class="text-white fw-semibold">${esc(req.container_size || '20ft')}</div></div></div>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn-co btn-accept flex-fill" onclick="openAcceptModal(${req.id})"><i class="fas fa-check me-1"></i>Accept</button>
                    <button class="btn-co btn-sec" onclick="openDetailsModal(${req.id}, true)"><i class="fas fa-eye me-1"></i>Details</button>
                    <button class="btn-co btn-reject" onclick="rejectBooking(${req.id})"><i class="fas fa-times me-1"></i>Reject</button>
                </div>
            </div>`).join('');
    } catch (e) {
        grid.innerHTML = '<div class="text-danger text-center py-4">Failed to load booking requests.</div>';
    }
}

// Accept Modal - population logic
async function openAcceptModal(id) {
    const req = ALL_PENDING_REQUESTS.find(r => r.id == id);
    if (!req) return;
    GLOBAL_CURRENT_REQ = req;

    setVal('accept-shipment-id', id);
    const prefix = req.user_prefix || 'SS';
    setVal('accept-shipment-ref', `${prefix}-${id}`);

    // Clear and load ships
    const select = document.getElementById('accept-vessel-select');
    select.innerHTML = '<option value="">-- Select Available Ship --</option>';

    try {
        let res = await fetch(`${API}/api/v3/manager/ships/available?nearPort=${req.source_port}`, { credentials: 'include' });
        let d = await res.json();

        // If no ships near source, fetch all available ships to provide options
        if (!d.success || d.ships.length === 0) {
            res = await fetch(`${API}/api/v3/manager/ships/available`, { credentials: 'include' });
            d = await res.json();
        }

        if (d.success && d.ships.length > 0) {
            d.ships.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (${s.type}) - ${s.available_slots || s.container_slots - s.used_slots} slots open`;
                select.appendChild(opt);
            });
            // Auto-select first ship (proactive)
            select.value = d.ships[0].id;
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
            <td class="text-white">${esc(s.customer_name || '—')}</td>
            <td class="text-white-50 small">${shortR(s)}</td>
            <td>${typeBadge}</td>
            <td class="text-white-50">${esc(s.mode || 'Ocean')}</td>
            <td>${stBadge(s.status)}</td>
            <td class="text-white-50 small">${s.estimated_arrival ? fmtD(s.estimated_arrival) : '—'}</td>
            <td class="text-white-50">$${num(s.estimated_cost)}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-dark border-secondary text-white-50" title="View Details" onclick="openDetailsModal(${s.id})"><i class="fas fa-eye"></i></button>
                    <select class="co-input" id="status-sel-${s.id}" style="width:130px;padding:4px 8px;font-size:0.75rem;">
                        <option value="">Change Status</option>
                        <option>Confirmed</option>
                        <option>Cargo Loaded</option>
                        <option>In Transit</option>
                        <option>Delivered</option>
                    </select>
                    <button class="btn-co btn-status" onclick="updateShipmentStatus(${s.id})"><i class="fas fa-save"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

let ALL_PENDING_REQUESTS = [];

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
            return `
            <tr>
                <td class="text-white fw-bold">${esc(v.name)}</td>
                <td>
                    <div class="text-white small">${esc(v.type)}</div>
                    <div class="text-white-50 x-small">${esc(v.cargo_types || 'General Cargo')}</div>
                </td>
                <td>
                    <div class="text-white small">${v.used_slots} / ${v.container_slots} TEU</div>
                    <div class="progress" style="height:4px; width:80px; background:rgba(255,255,255,0.05);">
                        <div class="progress-bar bg-primary" style="width:${slotsPct}%"></div>
                    </div>
                </td>
                <td>
                    <div class="text-info small">${esc(v.current_port || v.location)}</div>
                    <div class="text-white-50 x-small">Next: ${v.next || '—'}</div>
                </td>
                <td>${stBadge(v.status || 'Available')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-co btn-edit" title="Manage Route" onclick="openRouteModal(${v.id}, '${esc(v.name)}')"><i class="fas fa-map-marked-alt"></i></button>
                        <button class="btn-co btn-delete" onclick="deleteVessel(${v.id})"><i class="fas fa-trash"></i></button>
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
    if (!vessel.name) { toast('Enter vessel name', 'error'); return; }
    const r = await fetch(`${API}/api/company/vessels`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vessel)
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) { closeModal('vessel-modal'); loadVessels(); }
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
    if (!schedule.vessel || !schedule.from || !schedule.to) { toast('Fill vessel/ports', 'error'); return; }
    const r = await fetch(`${API}/api/company/schedules`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) { closeModal('schedule-modal'); loadSchedules(); }
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
    if (!rate.from || !rate.to) { toast('Fill origin and destination', 'error'); return; }
    const r = await fetch(`${API}/api/company/pricing`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rate)
    });
    const d = await r.json();
    toast(d.message, d.success ? 'success' : 'error');
    if (d.success) { closeModal('price-modal'); loadPricing(); }
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
        setV('nav-customers', d.customers.length);
        tbody.innerHTML = d.customers.map(c => `
            <tr>
                <td class="text-white fw-semibold">${esc(c.name)}</td>
                <td class="text-white-50">${esc(c.email)}</td>
                <td class="text-info">${c.shipment_count}</td>
                <td class="text-white-50 small">${fmtD(c.last_shipment)}</td>
                <td class="text-success">$${num(c.total_value)}</td>
                <td><a href="mailto:${esc(c.email)}" class="btn-co btn-status"><i class="fas fa-envelope me-1"></i>Contact</a></td>
            </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = errRow(6, 'Error loading customers');
        if (countEl) countEl.innerText = '';
        setV('nav-customers', '');
    }
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

async function submitTracking() {
    const shipmentId = val('tr-shipment');
    const status = val('tr-event');
    const location = val('tr-location');
    const notes = val('tr-notes');
    if (!shipmentId) { toast('Enter a shipment ID', 'error'); return; }
    try {
        const r = await fetch(`${API}/api/company/tracking/update`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId, status, location, notes })
        });
        const d = await r.json();
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) {
            setVal('tr-shipment', ''); setVal('tr-location', ''); setVal('tr-notes', '');
            loadTrackingLogs();
        }
    } catch (e) { toast('Server error', 'error'); }
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
                <td class="text-white-50">$${num(s.estimated_cost)}</td>
                <td class="text-success">$${num(s.estimated_cost * 0.95)}</td>
                <td>${stBadge('Delivered')}</td>
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
