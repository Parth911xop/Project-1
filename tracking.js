// Real Tracking connected to Backend
const API_URL = `http://${window.location.hostname}:3000`;
const userId = localStorage.getItem('userId');

document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
});

async function initDashboard() {
    // Check for ID in URL
    const params = new URLSearchParams(window.location.search);
    const shipmentId = params.get('id');

    if (shipmentId) {
        // Fetch specific shipment
        await loadShipmentData(shipmentId);
    } else if (userId) {
        // Fetch latest shipment for this user
        await loadLatestShipment();
    } else {
        // Show fallback/demo
        populateUI(getMockData());
    }

    // 4. Update "Last Updated" text live
    setInterval(() => {
        const el = document.getElementById('last-updated');
        if (el) el.innerText = "Just now";
    }, 60000);
}

async function loadShipmentData(id) {
    try {
        // Fetch from high-fidelity V3 workflow tracking endpoint
        const res = await fetch(`${API_URL}/api/v3/tracking/live/${id}`, { credentials: 'include' });
        const d = await res.json();

        if (d.success) {
            populateUI(d.tracking);
        } else {
            if (window.showToast) showToast(d.message || 'Shipment not found', 'error');
            populateUI(getMockData());
        }
    } catch (err) {
        console.error("Tracking API Error:", err);
        populateUI(getMockData());
    }
}

async function loadLatestShipment() {
    try {
        const res = await fetch(`${API_URL}/api/shipment/list`, { credentials: 'include' });
        const data = await res.json();

        if (data.success && data.shipments.length > 0) {
            const latestId = data.shipments[0].id;
            await loadShipmentData(latestId);
        } else {
            populateUI(getMockData());
        }
    } catch (err) {
        populateUI(getMockData());
    }
}

function getMockData() {
    return {
        bookingRef: "DEMO-SHIPPING",
        route: { origin: "International Port", destination: "Local Hub" },
        cargo: { type: "General Goods" },
        status: "In Transit",
        eta: "Late 2026",
        progress: 45,
        shipName: "Smart Vessel 01",
        currentPort: "Singapore, SG",
        distanceLeft: "2,100 nm",
        livePosition: { lat: 10.0, lng: 80.0 }, 
        routeStops: []
    };
}

function populateUI(data) {
    // 1. Top Bar
    document.getElementById('ship-id').innerText = `ID: ${data.bookingRef || data.shipmentId}`;
    document.getElementById('ship-route').innerText = `${data.route.origin || '—'} → ${data.route.destination || '—'}`;
    document.getElementById('ship-cargo').innerText = `📦 ${data.cargo?.type || 'Cargo'}`;
    document.getElementById('ship-eta').innerText = `📅 ETA: ${data.eta}`;

    // Progress Bar
    setTimeout(() => {
        const bar = document.getElementById('progress-bar');
        if (bar) bar.style.width = `${data.progress}%`;
    }, 500);

    // 2. Metrics
    setSafeText('metric-speed', data.shipName); // Using ship name here instead of speed for better context
    setSafeText('metric-next', data.currentPort || 'Ocean');
    setSafeText('metric-dist', data.status); // Using status here as a metric

    // 3. Timeline (Built from Real Route Stops)
    const list = document.getElementById('timeline-list');
    if (list) {
        if (data.routeStops && data.routeStops.length > 0) {
            list.innerHTML = data.routeStops.map((stop, i) => {
                const isArrived = (data.currentPort === stop.port_name);
                const isPast = (stop.stop_order < (data.routeStops.find(s => s.port_name === data.currentPort)?.stop_order || 0));
                const statusClass = isPast ? 'completed' : (isArrived ? 'active' : 'pending');
                
                return `
                    <div class="timeline-item ${statusClass}">
                        <div class="timeline-dot"></div>
                        <div class="glass-panel p-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <h6 class="mb-0 fw-bold ${statusClass === 'active' ? 'text-accent' : 'text-white'}">${stop.port_name}</h6>
                                <small class="text-white-50">Stop ${stop.stop_order}</small>
                            </div>
                            <div class="d-flex justify-content-between x-small text-muted">
                                <span>${stop.estimated_arrival ? new Date(stop.estimated_arrival).toLocaleDateString() : 'TBD'}</span>
                                <span>${isArrived ? 'Vessel docked' : ''}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Default baseline timeline
            list.innerHTML = `
                <div class="timeline-item completed"><div class="timeline-dot"></div><div class="glass-panel p-3"><h6 class="mb-0 text-white">Booking Confirmed</h6></div></div>
                <div class="timeline-item active"><div class="timeline-dot"></div><div class="glass-panel p-3"><h6 class="mb-0 text-accent">In Transit</h6><small class="text-white-50">${data.currentPort || 'On Sea'}</small></div></div>
                <div class="timeline-item pending"><div class="timeline-dot"></div><div class="glass-panel p-3"><h6 class="mb-0 text-muted">Awaiting Arrival</h6></div></div>
            `;
        }
    }

    // 4. Update Map Data Overlay
    if (data.livePosition) {
        const coordBox = document.querySelector('.map-overlay-info .font-monospace');
        if (coordBox) coordBox.innerText = `${data.livePosition.lat.toFixed(2)}'N ${data.livePosition.lng.toFixed(2)}'E`;
    }
}

function setSafeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

// Map Controls (Mock)
function toggleWeather() {
    if (window.showToast) showToast('Weather layer updated', 'info');
}

function toggleFullscreen() {
    const el = document.getElementById('map-panel');
    if (!document.fullscreenElement) {
        el.requestFullscreen().catch(err => {
            alert(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}
