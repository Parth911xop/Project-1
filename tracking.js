// Real Tracking connected to Backend
const API_URL = 'http://localhost:3000';
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
        // Fetch from new dedicated tracking endpoint
        const res = await fetch(`${API_URL}/api/tracking/search?id=${id}`);
        const data = await res.json();

        if (data.success) {
            populateUI(data.tracking);
        } else {
            if (window.showToast) showToast('Shipment not found', 'error');
            // If ID was invalid, maybe show demo data or stay empty? 
            // Let's show demo data as fallback for smooth UX in prototype
            console.warn("Tracking ID not found, showing demo data");
            populateUI(getMockData());
        }
    } catch (err) {
        console.error("Tracking API Error:", err);
        populateUI(getMockData());
    }
}

async function loadLatestShipment() {
    // If no ID provided, try to find one from user's history to auto-load
    try {
        const res = await fetch(`${API_URL}/api/shipment/all?userId=${userId}`);
        const data = await res.json();

        if (data.success && data.shipments.length > 0) {
            // Pick the most recent one
            const latestId = data.shipments[0].id;
            await loadShipmentData(latestId);
        } else {
            populateUI(getMockData()); // Fallback if no shipments
        }
    } catch (err) {
        console.error(err);
        populateUI(getMockData());
    }
}

// Deprecated: transformToTraceData (Backend now handles this format)

function getMockData() {
    return {
        id: "DEMO-SHIPPING",
        route: { origin: "Global Trade Center", dest: "Local Fulfillment" },
        cargo: "General Cargo",
        status: "In Transit",
        eta: "Late 2026",
        progress: 45,
        speed: "18 knots",
        nextPort: "Singapore, SG",
        distanceLeft: "2,100 nm",
        coordinates: { lat: 10.0, lng: 80.0 }, // Mock location
        timeline: [
            { status: "completed", title: "Booking Confirmed", date: "Jan 01", loc: "System" },
            { status: "active", title: "In Transit", date: "Now", loc: "High Seas" },
            { status: "pending", title: "Arrival", date: "Pending", loc: "Destination" }
        ]
    };
}

function populateUI(data) {
    // 1. Populate Top Bar
    document.getElementById('ship-id').innerText = `ID: ${data.id}`;
    document.getElementById('ship-route').innerText = `${data.route.origin} → ${data.route.dest}`;
    document.getElementById('ship-cargo').innerText = `📦 ${data.cargo}`;
    document.getElementById('ship-eta').innerText = `📅 ETA: ${data.eta}`;

    // Animate Progress Bar
    setTimeout(() => {
        const bar = document.getElementById('progress-bar');
        if (bar) bar.style.width = `${data.progress}%`;
    }, 500);

    // 2. Populate Metrics
    setSafeText('metric-speed', data.speed);
    setSafeText('metric-next', data.nextPort);
    setSafeText('metric-dist', data.distanceLeft);

    // 3. Render Timeline
    const list = document.getElementById('timeline-list');
    if (list && data.timeline) {
        list.innerHTML = data.timeline.map(item => `
            <div class="timeline-item ${item.status}">
                <div class="timeline-dot"></div>
                <div class="glass-panel p-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <h6 class="mb-0 fw-bold ${item.status === 'active' ? 'text-accent' : 'text-white'}">${item.title}</h6>
                        <small class="${item.status === 'active' ? 'text-accent' : 'text-muted'}">${item.status === 'completed' ? '<i class="fas fa-check-circle"></i>' : ''}</small>
                    </div>
                    <div class="d-flex justify-content-between small text-muted">
                        <span>${item.date}</span>
                        <span>${item.loc}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 4. Update Map (Mock)
    if (data.coordinates) {
        // In a real app with Leaflet/Google Maps, we would panTo(data.coordinates)
        // Here we just update the text
        const coordBox = document.querySelector('.map-overlay-info .font-monospace');
        if (coordBox) coordBox.innerText = `${data.coordinates.lat.toFixed(2)}'N ${data.coordinates.lng.toFixed(2)}'E`;
    }
}

// Helper to safely set text if element exists
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
