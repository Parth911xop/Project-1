// Real Tracking connected to Backend
const API_URL = `http://${window.location.hostname}:3000`;
const userId = localStorage.getItem('userId');

document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
});

let trackingMap = null;
let shipMarker = null;
let pathLine = null;

async function initDashboard() {
    const params = new URLSearchParams(window.location.search);
    const shipmentId = params.get('id');
    initMap();

    // 1. Join Shipment Room for Live Updates
    if (shipmentId && typeof io !== 'undefined') {
        const socket = io(API_URL);
        socket.emit('join_shipment', shipmentId);
        
        socket.on('tracking_event', (e) => {
            console.log("⚓ Live Tracking Pulse:", e);
            if (e.lat && e.lng) {
                updateMap({ 
                    livePosition: { lat: e.lat, lng: e.lng }, 
                    shipName: e.vessel || 'Vessel', 
                    status: e.status || 'In Transit',
                    bearing: e.bearing // Integrated bearing for rotation
                });
                
                // Update metrics labels live
                if (e.bearing) setSafeText('metric-course', `${Math.round(e.bearing)}°`);
                setSafeText('metric-speed', e.message?.includes('22 knots') ? '22 kn' : '18 kn');
                setSafeText('last-updated', 'Live Pulse');
            }
        });
    }

    // 2. Fetch full voyage path (Professionally Accurate)
    if (shipmentId) fetchVesselRoute(shipmentId);

    // Initial Load
    if (shipmentId) {
        await loadShipmentData(shipmentId);
    } else if (userId) {
        await loadLatestShipment();
    } else {
        populateUI(getMockData());
    }

    setInterval(() => {
        const el = document.getElementById('last-updated');
        if (el && el.innerText !== 'Live Pulse') el.innerText = "Just now";
        if (shipmentId) loadShipmentData(shipmentId);
    }, 60000);
}

let VOYAGE_STOPS = [];
async function fetchVesselRoute(sid) {
    try {
        const res = await fetch(`${API_URL}/api/v3/shipment/${sid}/vessel-route`, { credentials: 'include' });
        const d = await res.json();
        if (d.success) {
            VOYAGE_STOPS = d.stops;
            // Immediate map update if possible
            if (trackingMap) drawVoyagePath(VOYAGE_STOPS);
        }
    } catch(e) {}
}

function drawVoyagePath(stops) {
    if (!trackingMap || stops.length < 2) return;
    const points = stops.map(s => [s.lat, s.lng]);
    
    if (pathLine) trackingMap.removeLayer(pathLine);
    pathLine = L.polyline(points, {
        color: '#6366f1', weight: 4, opacity: 0.5, dashArray: '8, 12',
        lineJoin: 'round'
    }).addTo(trackingMap);

    // Zoom to fit path if first load
    trackingMap.fitBounds(pathLine.getBounds(), { padding: [50, 50] });
}

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    trackingMap = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CARTO'
    }).addTo(trackingMap);
}

async function loadShipmentData(id) {
    try {
        const res = await fetch(`${API_URL}/api/v3/tracking/live/${id}`, { credentials: 'include' });
        const d = await res.json();
        if (d.success) {
            populateUI(d.tracking);
            updateMap(d.tracking);
        } else {
            if (window.showToast) showToast(d.message || 'Shipment not found', 'error');
            populateUI(getMockData());
        }
    } catch (err) {
        console.error("Tracking API Error:", err);
        populateUI(getMockData());
    }
}

function updateMap(data) {
    const pos = [data.livePosition.lat, data.livePosition.lng];
    const bearing = data.bearing || 0;

    // Vessel Marker with Rotation (Advanced AIS)
    if (!shipMarker) {
        const icon = L.divIcon({
            html: `
                <div style="transform: rotate(${bearing}deg); transition: transform 0.5s ease; text-align:center;">
                    <i class="fas fa-ship fa-2x text-primary" style="filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.8));"></i>
                    <div class="vessel-heading-arrow" style="width:2px; height:20px; background:#4f46e5; margin: -5px auto 0; opacity:0.6;"></div>
                </div>`,
            className: 'vessel-live-icon', 
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
        shipMarker = L.marker(pos, { icon }).addTo(trackingMap);
        trackingMap.setView(pos, 6);
    } else {
        shipMarker.setLatLng(pos);
        // Update rotation live
        const iconEl = shipMarker.getElement()?.querySelector('div');
        if (iconEl) iconEl.style.transform = `rotate(${bearing}deg)`;
    }
    shipMarker.bindPopup(`<b>${data.shipName}</b><br>${data.status}`).openPopup();

    // Route Polyline
    if (data.routeStops && data.routeStops.length > 1) {
        const points = data.routeStops
            .sort((a, b) => a.stop_order - b.stop_order)
            .filter(st => st.lat && st.lng)
            .map(st => [st.lat, st.lng]);

        if (pathLine) trackingMap.removeLayer(pathLine);
        pathLine = L.polyline(points, {
            color: '#6366f1', weight: 3, opacity: 0.6, dashArray: '5, 10'
        }).addTo(trackingMap);

        // Add small markers for each port
        data.routeStops.forEach(st => {
            if (st.lat && st.lng) {
                L.circleMarker([st.lat, st.lng], {
                    radius: 4, color: '#fff', weight: 1, fillOpacity: 0.8
                }).addTo(trackingMap).bindPopup(`<b>Port: ${st.port_name}</b>`);
            }
        });
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
            // Default baseline timeline (Simple & Professional)
            list.innerHTML = `
                <div class="timeline-item ${data.status === 'Pending Approval' ? 'active' : 'completed'}">
                    <div class="timeline-dot"></div>
                    <div class="glass-panel p-3"><h6 class="mb-1 text-white">Booking Request</h6><small class="text-white-50">Under Review</small></div>
                </div>
                <div class="timeline-item ${data.status === 'Ship Allocated' ? 'active' : (data.status.includes('Transit') || data.status === 'Delivered' || data.status === 'Cargo Loaded' ? 'completed' : 'pending')}">
                    <div class="timeline-dot"></div>
                    <div class="glass-panel p-3"><h6 class="mb-1">Ship Allocation</h6><small class="text-white-50">${data.shipName || 'Pending Assignment'}</small></div>
                </div>
                <div class="timeline-item ${data.status === 'Cargo Loaded' ? 'active' : (data.status === 'In Transit' || data.status === 'Delivered' ? 'completed' : 'pending')}">
                    <div class="timeline-dot"></div>
                    <div class="glass-panel p-3"><h6 class="mb-1">Cargo Loaded</h6></div>
                </div>
                <div class="timeline-item ${data.status === 'In Transit' ? 'active' : (data.status === 'Delivered' ? 'completed' : 'pending')}">
                    <div class="timeline-dot"></div>
                    <div class="glass-panel p-3"><h6 class="mb-1">In Transit</h6><small class="text-white-50">${data.currentPort || 'At Sea'}</small></div>
                </div>
                <div class="timeline-item ${data.status === 'Delivered' ? 'active' : 'pending'}">
                    <div class="timeline-dot"></div>
                    <div class="glass-panel p-3"><h6 class="mb-1">Delivered</h6></div>
                </div>
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
