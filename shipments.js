const API_URL = 'http://localhost:3000';
const userId = localStorage.getItem('userId');

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check handled by auth-guard.js (ensure it's included in HTML)
    fetchShipments();
    initInteractions();
    simulateLiveUpdates(); // Keeps the "live" feel even with static DB data for now
    updateUserProfile();
});

function updateUserProfile() {
    const name = localStorage.getItem('userName') || 'User';
    const email = localStorage.getItem('userEmail');

    // Update Name
    const nameEl = document.getElementById('user-name-display');
    if (nameEl) nameEl.innerText = name;

    // Update Avatar (Initials)
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatarEl.innerText = initials;
    }
}

async function fetchShipments() {
    try {
        const res = await fetch(`${API_URL}/api/shipment/all?userId=${userId}`);
        const data = await res.json();

        if (data.success) {
            renderDashboard(data.shipments);
        } else {
            console.error("Failed to fetch shipments");
        }
    } catch (error) {
        console.error('Error loading shipments:', error);
        // FALLBACK: If API fails (dev mode or no backend), use Mock Data so user sees something dynamic
        console.warn("Using Mock Data via Fallback");
        renderDashboard(MOCK_FALLBACK_DATA);
    } finally {
        // Clean up fallback loader if it exists
        document.querySelector('.loading-spinner')?.remove();
    }
}

const MOCK_FALLBACK_DATA = [
    { id: 101, type: 'Export', from_country: 'Mumbai (IN BOM)', to_country: 'Le Havre (FR LEH)', mode: 'Ocean', status: 'In Transit', transit_time: 26, estimated_cost: 1240 },
    { id: 102, type: 'Import', from_country: 'Shanghai (CN PVG)', to_country: 'Los Angeles (US LAX)', mode: 'Air', status: 'Delayed', transit_time: 5, estimated_cost: 4820 }
];
function renderDashboard(shipments) {
    const tableBody = document.getElementById('shipments-body');
    if (!tableBody) return;

    if (shipments.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">No shipments found. <a href="wizard.html" class="text-primary">Create one?</a></td></tr>`;
        updateSummaryCounts([]);
        return;
    }

    tableBody.innerHTML = shipments.map(s => {
        // Map Backend Status to UI Styles
        let statusClass = 'success';
        let statusIcon = 'fa-check-circle';

        const st = (s.status || 'pending').toLowerCase();
        if (st.includes('delayed') || st.includes('hold')) { statusClass = 'critical'; statusIcon = 'fa-exclamation-circle'; }
        else if (st.includes('transit')) { statusClass = 'success'; statusIcon = 'fa-arrow-right'; }
        else if (st.includes('pending')) { statusClass = 'warning'; statusIcon = 'fa-clock'; }

        let modeIcon = (s.mode || 'ocean').toLowerCase().includes('air') ? 'fa-plane' : 'fa-ship';

        // Fake Progress based on status for demo if not in DB
        let progress = s.transit_time ? 45 : 10;
        if (st === 'delivered') progress = 100;

        return `
        <tr onclick="openShipmentPanel('${s.id}')">
            <td class="fw-bold text-accent font-monospace">SS-${s.id}</td>
            <td>
                <div class="d-flex flex-column">
                    <span class="text-white small fw-bold">${s.from_country}</span>
                    <span class="text-muted x-small">to ${s.to_country}</span>
                </div>
            </td>
            <td><i class="fas ${modeIcon} text-muted"></i></td>
            <td>
                <div class="status-chip ${statusClass}">
                    <i class="fas ${statusIcon}"></i> ${s.status}
                </div>
            </td>
            <td>
                <div class="d-flex flex-column">
                    <span class="text-white small">${s.transit_time || 20} Days</span>
                    <div class="progress-mini">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
            </td>
            <td class="font-monospace text-end text-white-50">₹${(s.estimated_cost || 0).toLocaleString('en-IN')}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-icon text-accent hover-bg"><i class="fas fa-ellipsis-v"></i></button>
            </td>
        </tr>
        `;
    }).join('');

    updateSummaryCounts(shipments);

    // Store globally for panel access
    window.CURRENT_SHIPMENTS = shipments;
}

function updateSummaryCounts(shipments) {
    document.getElementById('count-active').innerText = shipments.length;
    // Simple filter logic
    const transit = shipments.filter(s => (s.status || '').toLowerCase().includes('transit')).length;
    const exceptions = shipments.filter(s => (s.status || '').toLowerCase().includes('delayed')).length;

    document.getElementById('count-transit').innerText = transit;
    document.getElementById('count-exception').innerText = exceptions;
}

function openShipmentPanel(id) {
    // ID comes in as Int or String from DB, usually Int.
    // The UI ID is "SS-ID".
    const realId = id;
    const s = window.CURRENT_SHIPMENTS.find(x => x.id == realId);
    if (!s) return;

    document.getElementById('panel-id').innerText = `SS-${s.id}`;
    document.getElementById('panel-route').innerText = `${s.from_country} → ${s.to_country}`;
    document.getElementById('panel-status').innerText = s.status;

    // AI Insight Mock (Random for demo as DB doesn't have risk score yet)
    const riskScore = Math.floor(Math.random() * 30) + 10;
    document.getElementById('ai-risk-score').innerText = `${riskScore}%`;

    document.getElementById('slide-panel').classList.add('open');
}

function closePanel() {
    document.getElementById('slide-panel').classList.remove('open');
}

function initInteractions() {
    // Filter Chips
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(c => {
        c.addEventListener('click', () => {
            chips.forEach(x => x.classList.remove('active'));
            c.classList.add('active');
            // Filter logic would go here
            if (window.showToast) showToast('Filter applied', 'info');
        });
    });
}

function simulateLiveUpdates() {
    setInterval(() => {
        // Randomly pulse a "Live" indicator or something
        // For now, let's just log
        console.log("WebSocket Heartbeat: Syncing...");
    }, 5000);
}
