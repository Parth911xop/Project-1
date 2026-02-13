const API_URL = 'http://localhost:3000';
const userId = localStorage.getItem('userId');

document.addEventListener('DOMContentLoaded', () => {
    if (!userId) return; // Auth guard should handle this
    fetchDeclarations();
});

async function fetchDeclarations() {
    const container = document.getElementById('declarations-container');

    try {
        const res = await fetch(`${API_URL}/api/customs?userId=${userId}`);
        const data = await res.json();

        if (data.success && data.declarations.length > 0) {
            renderDeclarations(data.declarations);
            updateStats(data.declarations);
        } else {
            container.innerHTML = `
                <div class="text-center py-5 text-white-50">
                    <i class="fas fa-clipboard-check fa-3x mb-3 opacity-50"></i>
                    <p>No active customs declarations.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="text-center text-danger py-4">Failed to load data</div>';
    }
}

function renderDeclarations(list) {
    const container = document.getElementById('declarations-container');
    container.innerHTML = list.map(d => `
        <div class="card-enterprise p-3 mb-3 d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-3">
                <div class="icon-box bg-dark bg-opacity-50 text-warning" style="width: 50px; height: 50px;">
                    <i class="fas fa-file-contract"></i>
                </div>
                <div>
                    <h5 class="mb-1 text-white fw-bold">${d.declaration_number}</h5>
                    <div class="text-white-50 small">
                        <span>${d.type}</span> • <span>${d.port || 'Port Unknown'}</span>
                    </div>
                </div>
            </div>
            <div class="text-end">
                <span class="badge ${getStatusBadge(d.status)} mb-2">${d.status}</span>
                <div class="text-white-50 x-small">${new Date(d.created_at).toLocaleDateString()}</div>
            </div>
        </div>
    `).join('');
}

function updateStats(list) {
    const active = list.filter(d => d.status !== 'Cleared').length;
    const pending = list.filter(d => d.status === 'Draft' || d.status === 'Submitted').length;

    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-pending').innerText = pending;
}

function getStatusBadge(status) {
    switch (status) {
        case 'Cleared': return 'bg-success';
        case 'Held': return 'bg-danger';
        case 'Submitted': return 'bg-info text-dark';
        default: return 'bg-secondary';
    }
}

// Simple Quick Create Mock
async function createQuickDeclaration() {
    if (confirm("Generate new Import declaration for Mumbai Port?")) {
        try {
            const res = await fetch(`${API_URL}/api/customs/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, type: 'Import', port: 'Mumbai Port' })
            });
            const data = await res.json();
            if (data.success) {
                fetchDeclarations(); // Refresh
                alert("Declaration Created: " + data.declaration.declaration_number);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to create declaration");
        }
    }
}
