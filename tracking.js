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
        // In a real app we would have a specific endpoint, reused /all for now or Assume ID
        // Simplified: Fetching All and finding ID (Not efficient for prod but works for prototype)
        // Ideally: const res = await fetch(`${API_URL}/api/shipment/${id}`);
        // But our backend currently only has /all?userId=... or /create
        // let's stick to /all and filter for now as per previous server.js view
        const res = await fetch(`${API_URL}/api/shipment/all?userId=${userId}`);
        const data = await res.json();

        if (data.success && data.shipments.length > 0) {
            const shipment = data.shipments.find(s => s.id == id) || data.shipments[0];
            populateUI(transformToTraceData(shipment));
        } else {
            showToast('Shipment not found', 'error');
            populateUI(getMockData());
        }
    } catch (err) {
        console.error(err);
        populateUI(getMockData());
    }
}

async function loadLatestShipment() {
    try {
        const res = await fetch(`${API_URL}/api/shipment/all?userId=${userId}`);
        const data = await res.json();

        if (data.success && data.shipments.length > 0) {
            // Pick the most recent one (ID is serial, so highest ID or first in DESC list)
            populateUI(transformToTraceData(data.shipments[0]));
        } else {
            populateUI(getMockData()); // Fallback if no shipments
        }
    } catch (err) {
        console.error(err);
        populateUI(getMockData());
    }
}

function transformToTraceData(s) {
    return {
        id: s.id,
        route: { origin: s.from_country, dest: s.to_country },
        cargo: s.product_type || 'General Cargo',
        status: s.status,
        eta: `+${s.transit_time} Days`,
        progress: s.status === 'Delivered' ? 100 : (s.status === 'In Transit' ? 65 : 10),
        speed: s.mode === 'Air' ? '500 mph' : '18 knots',
        nextPort: 'En Route',
        distanceLeft: 'Calculating...',
        timeline: [
            { status: "completed", title: "Booking Confirmed", date: new Date(s.created_at).toLocaleDateString(), loc: "System" },
            { status: s.status === 'Pending' ? 'active' : 'completed', title: "Departure", date: "Pending", loc: s.from_country },
            { status: s.status === 'In Transit' ? 'active' : 'pending', title: "In Transit", date: "Live", loc: "On Route" },
            { status: s.status === 'Delivered' ? 'completed' : 'pending', title: "Arrival", date: `Est. ${s.transit_time} Days`, loc: s.to_country }
        ]
    };
}

function getMockData() {
    return {
        id: "DEMO-SHIPPING",
        route: { origin: "Mumbai, IN", dest: "Le Havre, FR" },
        cargo: "Electronics",
        status: "In Transit",
        eta: "Feb 12, 2026",
        progress: 65,
        speed: "18 knots",
        nextPort: "Jeddah, SA",
        distanceLeft: "3,420 km",
        timeline: [
            { status: "completed", title: "Departed Origin", date: "Jan 28", loc: "Mumbai, IN" },
            { status: "active", title: "En Route", date: "Live", loc: "Indian Ocean" },
            { status: "pending", title: "Arrival", date: "Est. Feb 12", loc: "Le Havre, FR" }
        ]
    };
}

function populateUI(data) {
    // 1. Populate Top Bar
    document.getElementById('ship-id').innerText = data.id; // Corrected ID usage
    document.getElementById('ship-route').innerText = `${data.route.origin} → ${data.route.dest}`;
    document.getElementById('ship-cargo').innerText = `📦 ${data.cargo}`;
    document.getElementById('ship-eta').innerText = `📅 ETA: ${data.eta}`;

    // Animate Progress Bar
    setTimeout(() => {
        document.getElementById('progress-bar').style.width = `${data.progress}%`;
    }, 500);

    // 2. Populate Metrics
    document.getElementById('metric-speed').innerText = data.speed;
    document.getElementById('metric-next').innerText = data.nextPort;
    document.getElementById('metric-dist').innerText = data.distanceLeft;

    // 3. Render Timeline
    const list = document.getElementById('timeline-list');
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
