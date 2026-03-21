const API_URL = `http://${window.location.hostname}:3000`;
const defaultShipmentId = 32;
let CURRENT_SHIPMENT = null;
let USER_ROLE = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Get user role for permission checks
    try {
        const authRes = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        const authData = await authRes.json();
        if (authData.success) USER_ROLE = authData.user?.role;
    } catch (e) { console.error('Auth check failed'); }
    
    fetchDocuments();
});

async function fetchDocuments() {
    const list = document.getElementById('documents-list');

    try {
        const res = await fetch(`${API_URL}/api/documents/user/all`, {
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success && data.documents.length > 0) {
            renderDocuments(data.documents);
        } else {
            list.innerHTML = `
                <div class="text-center py-5 text-white-50">
                    <i class="fas fa-folder-open fa-3x mb-3 opacity-50"></i>
                    <p>No documents found. Upload documents to get started.</p>
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
        <div class="d-flex align-items-center justify-content-between p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 shadow-sm">
            <div class="d-flex align-items-center">
                <div class="icon-box bg-primary bg-opacity-10 text-primary me-3 d-flex align-items-center justify-content-center rounded" style="width: 45px; height: 45px; min-width: 45px;">
                    <i class="fas ${doc.type.includes('KYC') || doc.type.includes('Address') ? 'fa-id-card' :
            doc.type.includes('Invoice') || doc.type.includes('Packing') ? 'fa-file-invoice-dollar' :
                doc.type.includes('IEC') ? 'fa-stamp text-info' :
                    doc.type === 'Booking Summary' ? 'fa-file-pdf text-danger' :
                        doc.type.includes('Insurance') ? 'fa-shield-alt text-success' : 'fa-file-contract'
        } fa-lg"></i>
                </div>
                <div>
                    <h6 class="text-white mb-0 fw-bold">${doc.type}</h6>
                    <small class="text-white-50">${doc.filename} • ${new Date(doc.uploaded_at).toLocaleDateString()}</small>
                    <div class="x-small text-info mt-1"><i class="fas fa-ship me-1"></i> ${doc.origin_address} ➔ ${doc.destination_address}</div>
                </div>
            </div>
            <div class="d-flex align-items-center gap-3">
                <span class="badge ${getStatusBadge(doc.status)} px-3 rounded-pill">${doc.status}</span>
                ${doc.status === 'Rejected' ? `
                <button class="btn btn-sm btn-danger rounded-pill fw-bold" onclick="openReuploadModal('${doc.shipment_id}', '${doc.type}')" title="Re-upload this document">
                    <i class="fas fa-redo me-1"></i> Re-Upload
                </button>
                ` : ''}
                <button class="btn btn-icon btn-sm ${doc.status === 'Rejected' ? 'btn-outline-secondary' : 'btn-outline-primary'} rounded-circle" onclick="previewDoc('${doc.url || doc.file_url}', '${doc.doc_name || doc.filename || 'Document'}')" title="Preview Document">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openReuploadModal(shipmentId, type) {
    document.getElementById('docType').value = type;
    document.getElementById('shipmentId').value = shipmentId;
    // reset file input
    document.getElementById('docFile').value = '';
    const modal = new bootstrap.Modal(document.getElementById('uploadModal'));
    modal.show();
}

function previewDoc(url, filename) {
    document.getElementById('previewTitle').innerText = filename;
    document.getElementById('previewFrame').src = url;
    const modal = new bootstrap.Modal(document.getElementById('previewModal'));
    modal.show();
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

    // ⚠️ CHECK SHIPMENT STATUS - GATE BASED ON WORKFLOW
    try {
        const shipRes = await fetch(`${API_URL}/api/shipment/${shipmentId}`, { credentials: 'include' });
        const shipData = await shipRes.json();
        
        if (shipData.success && shipData.shipment) {
            const shipment = shipData.shipment;
            
            // Only allow document upload if shipment is "Ship Allocated" or later
            const allowedStatuses = [
                'Ship Allocated',
                'Documents Pending',
                'Payment Pending',
                'Cargo Ready',
                'Confirmed',
                'Cargo Loaded',
                'In Transit',
                'Delivered'
            ];
            
            if (!allowedStatuses.includes(shipment.status)) {
                const msg = shipment.status === 'Pending Manager Approval'
                    ? '⚠️ Documents locked: A manager must allocate a ship first. Once allocated, document upload will be enabled.'
                    : `⚠️ Document upload not available for status: "${shipment.status}"`;
                    
                alert(msg);
                return;
            }
        }
    } catch (err) {
        console.warn('Could not verify shipment status, proceeding...');
    }

    const formData = new FormData();
    formData.append('docFile', fileInput.files[0]);
    formData.append('type', type);
    if (shipmentId) formData.append('shipmentId', shipmentId);
    formData.append('docName', fileInput.files[0].name);

    try {
        const res = await fetch(`${API_URL}/api/documents/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await res.json();
        if (data.success) {
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
            modal.hide();

            // Refresh list
            fetchDocuments();
            alert("Document uploaded successfully!");
        } else {
            alert(data.error || "Upload failed");
        }
    } catch (err) {
        console.error(err);
        alert("Upload failed");
    }
}
