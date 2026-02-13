const API_URL = 'http://localhost:3000';
// In a real app, we'd fetch docs for a specific shipment or all user shipments.
// For demo, we default to Shipment 32 or fetch all if supported.
const defaultShipmentId = 32;

document.addEventListener('DOMContentLoaded', () => {
    fetchDocuments();
});

async function fetchDocuments() {
    const list = document.getElementById('documents-list');

    try {
        const res = await fetch(`${API_URL}/api/documents/${defaultShipmentId}`);
        const data = await res.json();

        if (data.success && data.documents.length > 0) {
            renderDocuments(data.documents);
        } else {
            list.innerHTML = `
                <div class="text-center py-5 text-white-50">
                    <i class="fas fa-folder-open fa-3x mb-3 opacity-50"></i>
                    <p>No documents found for this shipment.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="text-center text-danger py-4">Failed to load documents</div>';
    }
}

function renderDocuments(docs) {
    const list = document.getElementById('documents-list');
    list.innerHTML = docs.map(doc => `
        <div class="d-flex align-items-center justify-content-between p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
            <div class="d-flex align-items-center">
                <div class="icon-box bg-primary bg-opacity-10 text-primary me-3" style="width: 40px; height: 40px;">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div>
                    <h6 class="text-white mb-0 fw-bold">${doc.type}</h6>
                    <small class="text-white-50">${doc.filename} • ${new Date(doc.uploaded_at).toLocaleDateString()}</small>
                </div>
            </div>
            <div class="d-flex align-items-center gap-3">
                <span class="badge ${getStatusBadge(doc.status)}">${doc.status}</span>
                <button class="btn btn-icon btn-sm btn-outline-light rounded-circle">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusBadge(status) {
    switch (status) {
        case 'Verified': return 'bg-success';
        case 'Rejected': return 'bg-danger';
        default: return 'bg-warning text-dark';
    }
}

async function uploadDocument() {
    const type = document.getElementById('docType').value;
    const shipmentId = document.getElementById('shipmentId').value || defaultShipmentId;
    const fileInput = document.getElementById('docFile');

    if (!fileInput.files.length) {
        alert("Please select a file");
        return;
    }

    const filename = fileInput.files[0].name;

    try {
        const res = await fetch(`${API_URL}/api/documents/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId, type, filename })
        });

        const data = await res.json();
        if (data.success) {
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
            modal.hide();

            // Refresh list
            fetchDocuments();
            alert("Document uploaded successfully!");
        }
    } catch (err) {
        console.error(err);
        alert("Upload failed");
    }
}
