/**
 * fleet-routes-ui.js
 * ═══════════════════════════════════════════════════════════
 * Manager Dashboard: Multi-Stop Route Management & Vessel Pin Control
 * Allows managers to:
 * - View vessel routes (Mumbai → Chennai → Kolkata)
 * - Pin/mark ship at current port (updates live tracking)
 * - Add/edit multi-stop routes
 * 
 * Real API Integration:
 * - GET /api/v3/manager/ship/:shipId/route
 * - POST /api/v3/manager/ship/:shipId/route
 * - POST /api/v3/manager/ship/:shipId/mark-current-stop
 */

const API_URL = window.API_BASE_URL||"";
let routeModal, selectedShipId;
let allPorts = []; // Cached port list

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 1: Initialize Route UI (Runs after Vessel List Loaded)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attach Route Control Buttons to Each Vessel Card
 * Called from vehicles.html after fetching vessel list
 */
function initFleetRouteUI() {
    console.log('🚢 Initializing Fleet Route UI...');

    // Create modal structure if not exists
    if (!document.getElementById('route-modal')) {
        createRouteModal();
    }

    // Fetch all major ports once for autocomplete
    fetchPortDatabase();

    // Listen for vessel table updates to add route buttons
    const tableBody = document.querySelector('tbody');
    if (tableBody) {
        addRouteButtonsToVessels();
    }

    console.log('✅ Fleet Route UI Ready');
}

/**
 * Create Route Management Modal
 * Contains: Route list, port pin controls, add stop form
 */
function createRouteModal() {
    const modal = document.createElement('div');
    modal.id = 'route-modal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content bg-dark border-secondary">
                <div class="modal-header border-secondary">
                    <h5 class="modal-title text-white">
                        <i class="fas fa-route text-primary me-2"></i>Vessel Route Management
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <!-- Route List -->
                    <div class="mb-4">
                        <h6 class="text-white-50 text-uppercase small fw-bold mb-3">📍 Multi-Stop Route</h6>
                        <div id="route-stops-list" class="d-flex flex-column gap-2" style="max-height: 300px; overflow-y: auto;">
                            <div class="text-white-50 text-center py-4">
                                <div class="spinner-border spinner-border-sm me-2"></div>Loading route...
                            </div>
                        </div>
                    </div>

                    <!-- Add New Stop Form -->
                    <div class="border-top border-secondary pt-4">
                        <h6 class="text-white-50 text-uppercase small fw-bold mb-3">➕ Add Port Stop</h6>
                        <form id="add-stop-form" class="d-grid gap-2">
                            <div>
                                <label class="text-white-50 small mb-1">Port Name *</label>
                                <input type="text" id="port-name-input" class="form-control bg-secondary text-white border-secondary" 
                                    placeholder="e.g., Mumbai, Chennai, Kolkata" autocomplete="off" required>
                                <!-- Port Autocomplete Dropdown -->
                                <div id="port-suggestions" class="position-absolute bg-secondary text-white rounded mt-1 w-100" 
                                    style="display: none; z-index: 1000; max-height: 150px; overflow-y: auto;"></div>
                            </div>
                            <div>
                                <label class="text-white-50 small mb-1">Stop Order # *</label>
                                <input type="number" id="stop-order-input" class="form-control bg-secondary text-white border-secondary" 
                                    placeholder="e.g., 1, 2, 3" min="1" required>
                            </div>
                            <div class="row g-2">
                                <div class="col">
                                    <label class="text-white-50 small mb-1">Latitude</label>
                                    <input type="number" id="port-lat-input" class="form-control bg-secondary text-white border-secondary" 
                                        placeholder="e.g., 19.0176" step="0.0001">
                                </div>
                                <div class="col">
                                    <label class="text-white-50 small mb-1">Longitude</label>
                                    <input type="number" id="port-lng-input" class="form-control bg-secondary text-white border-secondary" 
                                        placeholder="e.g., 72.8479" step="0.0001">
                                </div>
                            </div>
                            <div class="row g-2">
                                <div class="col">
                                    <label class="text-white-50 small mb-1">Est. Arrival</label>
                                    <input type="datetime-local" id="port-arrival-input" class="form-control bg-secondary text-white border-secondary">
                                </div>
                                <div class="col">
                                    <label class="text-white-50 small mb-1">Est. Departure</label>
                                    <input type="datetime-local" id="port-departure-input" class="form-control bg-secondary text-white border-secondary">
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary btn-sm rounded-pill mt-2">
                                <i class="fas fa-plus me-2"></i>Add Stop
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    routeModal = new bootstrap.Modal(modal);

    // Port autocomplete listener
    document.getElementById('port-name-input').addEventListener('input', (e) => {
        filterPortSuggestions(e.target.value);
    });

    // Add stop form submit
    document.getElementById('add-stop-form').addEventListener('submit', handleAddStop);
}

/**
 * Add Route Buttons to Each Vessel Row
 */
function addRouteButtonsToVessels() {
    const rows = document.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const shipName = row.querySelector('td')?.innerText;
        const shipId = row.dataset.shipId; // Assumption: vessel rows have data-ship-id

        if (shipId && !row.querySelector('.route-btn-cell')) {
            const routeBtnCell = document.createElement('td');
            routeBtnCell.className = 'route-btn-cell action-cell text-center';
            routeBtnCell.innerHTML = `
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openRouteModal(${shipId}, '${shipName}')" 
                    title="Manage route stops">
                    <i class="fas fa-route"></i> Route
                </button>
                <button class="btn btn-sm btn-outline-success" onclick="openPortPinModal(${shipId}, '${shipName}')" 
                    title="Pin ship to port">
                    <i class="fas fa-map-pin"></i> Pin
                </button>
            `;
            row.appendChild(routeBtnCell);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 2: Route Modal Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open Route Management Modal for Selected Ship
 */
async function openRouteModal(shipId, shipName) {
    selectedShipId = shipId;
    document.querySelector('#route-modal .modal-title').innerHTML = `
        <i class="fas fa-route text-primary me-2"></i>Route: MV ${shipName}
    `;

    // Fetch existing route
    await loadRouteStops(shipId);

    routeModal.show();
}

/**
 * Fetch Route Stops from Backend
 */
async function loadRouteStops(shipId) {
    try {
        const res = await fetch(`${API_URL}/api/v3/manager/ship/${shipId}/route`, {
            credentials: 'include'
        });
        const data = await res.json();

        const list = document.getElementById('route-stops-list');

        if (data.success && data.stops?.length > 0) {
            list.innerHTML = data.stops.map((stop, idx) => `
                <div class="glass-panel p-3 d-flex justify-content-between align-items-center border border-primary">
                    <div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary">${stop.stop_order}</span>
                            <strong class="text-white">${stop.port_name}</strong>
                            ${stop.port_code ? `<span class="text-white-50 small">${stop.port_code}</span>` : ''}
                        </div>
                        <div class="text-white-50 small mt-1">
                            ${stop.lat ? `📍 ${parseFloat(stop.lat).toFixed(4)}, ${parseFloat(stop.lng).toFixed(4)}` : ''}
                        </div>
                        ${stop.estimated_arrival ? `
                            <div class="text-white-50 x-small mt-1">
                                📅 Arr: ${new Date(stop.estimated_arrival).toLocaleDateString()}
                            </div>
                        ` : ''}
                    </div>
                    <button class="btn btn-sm btn-outline-warning" onclick="markShipAtStop(${shipId}, ${stop.id}, '${stop.port_name}')" 
                        title="Mark ship at this port">
                        <i class="fas fa-map-pin text-warning"></i> Pin Here
                    </button>
                </div>
            `).join('');
        } else {
            list.innerHTML = `
                <div class="alert alert-warning small">
                    <i class="fas fa-alert-circle me-2"></i>No route defined. Add ports below to create a route.
                </div>
            `;
        }
    } catch (err) {
        console.error('Load route error:', err);
        document.getElementById('route-stops-list').innerHTML = `
            <div class="alert alert-danger small">Error loading route</div>
        `;
    }
}

/**
 * Handle "Add Stop" Form Submission
 */
async function handleAddStop(e) {
    e.preventDefault();

    const portName = document.getElementById('port-name-input').value;
    const stopOrder = parseInt(document.getElementById('stop-order-input').value);
    const lat = document.getElementById('port-lat-input').value || null;
    const lng = document.getElementById('port-lng-input').value || null;
    const arrival = document.getElementById('port-arrival-input').value || null;
    const departure = document.getElementById('port-departure-input').value || null;

    if (!portName || !stopOrder) {
        alert('⚠️ Port Name and Stop Order are required');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/v3/manager/ship/${selectedShipId}/route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                stops: [{
                    port_name: portName,
                    stop_order: stopOrder,
                    lat: lat ? parseFloat(lat) : null,
                    lng: lng ? parseFloat(lng) : null,
                    estimated_arrival: arrival ? new Date(arrival).toISOString() : null,
                    estimated_departure: departure ? new Date(departure).toISOString() : null
                }]
            })
        });

        const data = await res.json();

        if (data.success) {
            showToastFleet('✅ Port added successfully', 'success');
            document.getElementById('add-stop-form').reset();
            await loadRouteStops(selectedShipId);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error('Add stop error:', err);
        alert('Failed to add port');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 3: Port Pin Control (Mark Ship Location)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open Modal to Select Which Port to Pin Ship At
 */
async function openPortPinModal(shipId, shipName) {
    // Load route stops
    try {
        const res = await fetch(`${API_URL}/api/v3/manager/ship/${shipId}/route`, {
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success && data.stops?.length > 0) {
            showPortPinSelector(shipId, data.stops, shipName);
        } else {
            alert('⚠️ No route defined for this vessel. Add ports first.');
        }
    } catch (err) {
        alert('Error loading route');
    }
}

/**
 * Show Port Selection for Pinning
 */
function showPortPinSelector(shipId, stops, shipName) {
    const pins = stops.map((stop, idx) => `
        <button class="btn btn-outline-warning btn-sm w-100 mb-2" onclick="confirmMarkAtPort(${shipId}, ${stop.id}, '${stop.port_name}')">
            <i class="fas fa-check-circle me-2"></i>📍 Mark at <strong>${stop.port_name}</strong> (Stop ${stop.stop_order})
        </button>
    `).join('');

    const msg = `
        <div class="p-3">
            <h6 class="text-white mb-3">Select Port for MV ${shipName}:</h6>
            ${pins}
        </div>
    `;

    // Use a simple confirmation dialog or custom modal
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = msg;
    
    // Or use a toast-style notification
    showToastFleet(`🎯 Pin ${shipName} at which port?`, 'info', 0);
    
    // Actually, let's create a proper port selector modal
    showPortSelectorModal(shipId, stops, shipName);
}

/**
 * Show Port Selector Modal
 */
function showPortSelectorModal(shipId, stops, shipName) {
    const modal = new bootstrap.Modal(document.createElement('div'));
    const content = document.createElement('div');
    content.className = 'modal fade';
    content.setAttribute('tabindex', '-1');
    content.innerHTML = `
        <div class="modal-dialog modal-sm">
            <div class="modal-content bg-dark border-secondary">
                <div class="modal-header border-secondary">
                    <h6 class="modal-title text-white">
                        <i class="fas fa-map-pin text-warning me-2"></i>Pin MV ${shipName}
                    </h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="d-grid gap-2">
                        ${stops.map((stop) => `
                            <button type="button" class="btn btn-outline-warning btn-sm text-start" 
                                onclick="confirmMarkAtPort(${shipId}, ${stop.id}, '${stop.port_name}'); this.closest('.modal').parentElement.remove();">
                                <div class="d-flex justify-content-between">
                                    <strong>${stop.port_name}</strong>
                                    <span class="badge bg-warning">Stop ${stop.stop_order}</span>
                                </div>
                                ${stop.lat ? `<small class="text-muted">📍 ${parseFloat(stop.lat).toFixed(3)}, ${parseFloat(stop.lng).toFixed(3)}</small>` : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(content);
    const bsModal = new bootstrap.Modal(content);
    bsModal.show();
}

/**
 * Confirm and Mark Ship at Port
 */
async function confirmMarkAtPort(shipId, stopId, portName) {
    try {
        const res = await fetch(`${API_URL}/api/v3/manager/ship/${shipId}/mark-current-stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ stopId })
        });

        const data = await res.json();

        if (data.success) {
            showToastFleet(`✅ Ship marked at ${portName}`, 'success');
            // Broadcast to all customers on this ship's shipments
            if (window.socket) {
                window.socket.emit('ship:port_marked', {
                    shipId,
                    portName,
                    message: `MV changed course to ${portName}`
                });
            }
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error('Mark port error:', err);
        alert('Failed to mark port');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4: Port Database & Autocomplete
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch Major Ports Database
 */
async function fetchPortDatabase() {
    // Hardcoded major Indian and regional ports
    allPorts = [
        { name: 'Mumbai', code: 'INMUN1', lat: 19.0176, lng: 72.8479, country: 'India' },
        { name: 'Chennai', code: 'INMAA1', lat: 13.1939, lng: 80.2822, country: 'India' },
        { name: 'Kolkata', code: 'INCCU1', lat: 22.5726, lng: 88.3639, country: 'India' },
        { name: 'Singapore', code: 'SGSIN2', lat: 1.3521, lng: 103.8198, country: 'Singapore' },
        { name: 'Dubai', code: 'AEDXB1', lat: 25.2048, lng: 55.2708, country: 'UAE' },
        { name: 'Hong Kong', code: 'HKHKG1', lat: 22.3193, lng: 114.1694, country: 'Hong Kong' },
        { name: 'Shanghai', code: 'CNSHA1', lat: 31.4010, lng: 121.5147, country: 'China' },
        { name: 'Tokyo', code: 'JPTYO1', lat: 35.6762, lng: 139.6503, country: 'Japan' },
        { name: 'Rotterdam', code: 'NLRTM1', lat: 51.9225, lng: 4.1049, country: 'Netherlands' },
        { name: 'Bangkok', code: 'THBKK1', lat: 13.7563, lng: 100.4955, country: 'Thailand' }
    ];
}

/**
 * Filter and Show Port Suggestions
 */
function filterPortSuggestions(query) {
    const suggestions = document.getElementById('port-suggestions');
    
    if (query.length < 1) {
        suggestions.style.display = 'none';
        return;
    }

    const filtered = allPorts.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.code.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length > 0) {
        suggestions.innerHTML = filtered.map(port => `
            <div class="px-3 py-2 cursor-pointer border-bottom border-secondary" 
                style="cursor: pointer;" onclick="selectPort('${port.name}', ${port.lat}, ${port.lng})">
                <strong>${port.name}</strong> <span class="text-white-50 small">${port.code}</span>
                <div class="text-white-50 x-small">${port.country}</div>
            </div>
        `).join('');
        suggestions.style.display = 'block';
    } else {
        suggestions.style.display = 'none';
    }
}

/**
 * Select Port from Autocomplete
 */
function selectPort(portName, lat, lng) {
    document.getElementById('port-name-input').value = portName;
    document.getElementById('port-lat-input').value = lat.toFixed(4);
    document.getElementById('port-lng-input').value = lng.toFixed(4);
    document.getElementById('port-suggestions').style.display = 'none';
}

/**
 * Toast Notification for Fleet Module
 */
function showToastFleet(msg, type = 'info', duration = 2000) {
    const toast = document.getElementById('toast');
    if (!toast) return; // Fallback if toast not available

    const toastBody = toast.querySelector('.toast-body');
    toastBody.innerHTML = msg;

    const bgClass = {
        'success': 'bg-success',
        'error': 'bg-danger',
        'warning': 'bg-warning',
        'info': 'bg-info'
    }[type] || 'bg-info';

    toast.className = `toast align-items-center text-white border-0 ${bgClass}`;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();

    if (duration > 0) {
        setTimeout(() => bsToast.hide(), duration);
    }
}
