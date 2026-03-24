const API_URL = ''; // Relative path for automatic port matching
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
    
    // Get url param context
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('shipmentId');
    if (id) {
        CURRENT_SHIPMENT = id;
        const shipInput = document.getElementById('shipmentId');
        if (shipInput) shipInput.value = id;
    }

    fetchDocuments(id);
    fetchKYCStatus();
});

// ── KYC LOGIC ─────────────────────────────────────────────────────

async function fetchKYCStatus() {
    try {
        const res = await fetch(`${API_URL}/api/kyc/my-status`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return;

        const docs = data.documents;
        const statusMap = {
            'ID Proof': 'kyc-status-id',
            'PAN': 'kyc-status-pan',
            'Address Proof': 'kyc-status-address'
        };

        // Reset
        Object.values(statusMap).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = 'Not Uploaded';
                el.className = 'badge bg-secondary x-small';
            }
        });

        let allApproved = docs.length === 3;
        let hasRejected = false;
        let rejectionReason = "";

        docs.forEach(doc => {
            const elId = statusMap[doc.doc_type];
            const el = document.getElementById(elId);
            if (el) {
                el.innerText = doc.status;
                el.className = `badge x-small ${
                    doc.status === 'Approved' ? 'bg-success' : 
                    doc.status === 'Rejected' ? 'bg-danger' : 
                    'bg-warning text-dark'
                }`;
            }

            // Update filename display
            const nameMap = {
                'ID Proof': 'kyc-file-id-name',
                'PAN': 'kyc-file-pan-name',
                'Address Proof': 'kyc-file-address-name'
            };
            const nameEl = document.getElementById(nameMap[doc.doc_type]);
            if (nameEl) {
                if (doc.file_name) {
                    nameEl.innerHTML = `<i class="fas fa-file-alt me-1 text-primary"></i>${doc.file_name}`;
                    nameEl.classList.remove('text-white-50');
                    nameEl.classList.add('text-primary', 'fw-bold');
                } else if (doc.status === 'Pending' || doc.status === 'Approved') {
                    nameEl.innerHTML = `<i class="fas fa-file-check me-1 text-success"></i>Document Uploaded`;
                    nameEl.classList.remove('text-white-50');
                    nameEl.classList.add('text-success-emphasis', 'fw-medium');
                }
            }
            
            const btnMap = {
                'ID Proof': 'kyc-btn-id',
                'PAN': 'kyc-btn-pan',
                'Address Proof': 'kyc-btn-address'
            };
            const btn = document.getElementById(btnMap[doc.doc_type]);
            if (btn && (doc.status === 'Pending' || doc.status === 'Approved')) {
                btn.innerHTML = `<i class="fas fa-redo me-1"></i> Update Document`;
                btn.classList.replace('btn-outline-primary', 'btn-outline-success');
            }
            
            if (doc.status !== 'Approved') allApproved = false;
            if (doc.status === 'Rejected') {
                hasRejected = true;
                rejectionReason = doc.rejection_reason;
            }
        });

        // Overall Badge
        const overall = document.getElementById('overall-kyc-badge');
        if (overall) {
            if (allApproved) {
                overall.innerHTML = '<span class="badge bg-success rounded-pill px-3 py-2"><i class="fas fa-check-circle me-1"></i> Verified</span>';
                document.getElementById('kyc-section').style.background = 'rgba(34, 197, 94, 0.05)';
                document.getElementById('kyc-section').style.borderColor = 'rgba(34, 197, 94, 0.2)';
            } else if (hasRejected) {
                overall.innerHTML = '<span class="badge bg-danger rounded-pill px-3 py-2"><i class="fas fa-times-circle me-1"></i> Action Required</span>';
                const msg = document.getElementById('kyc-rejection-msg');
                if (msg) {
                    msg.classList.remove('d-none');
                    document.getElementById('rejection-reason-text').innerText = `Rejected: ${rejectionReason}`;
                }
            } else if (docs.length > 0) {
                overall.innerHTML = '<span class="badge bg-info text-white rounded-pill px-3 py-2"><i class="fas fa-history me-1"></i> Under Review</span>';
            }
        }
    } catch (e) { console.error("KYC fetch error", e); }
}

async function uploadKYC(type, input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('kycFile', file);
    formData.append('docType', type);

    const btn = input.nextElementSibling;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading...';

    try {
        const res = await fetch(`${API_URL}/api/kyc/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            fetchKYCStatus();
            alert(`${type} uploaded successfully!`);
        } else {
            alert(data.message || "Upload failed");
        }
    } catch (e) {
        alert("Upload error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        input.value = '';
    }
}

async function fetchDocuments(filterId = null) {
    const list = document.getElementById('documents-list');

    try {
        const res = await fetch(`${API_URL}/api/documents/user/all`, {
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success && data.documents.length > 0) {
            let docsToShow = data.documents;
            if (filterId) {
                docsToShow = docsToShow.filter(d => String(d.shipment_id) === String(filterId));
            }
            
            if (docsToShow.length > 0) {
                renderDocuments(docsToShow);
                if (filterId && list) {
                    list.insertAdjacentHTML('afterbegin', `<h6 class="text-primary mb-3"><i class="fas fa-filter me-2"></i>Showing only documents for Shipment #${filterId}</h6>`);
                }
            } else {
                list.innerHTML = `
                    <div class="text-center py-5 text-white-50">
                        <i class="fas fa-folder-open fa-3x mb-3 opacity-50"></i>
                        <p>No documents found for Shipment #${filterId || 'this user'}.</p>
                    </div>
                `;
            }
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
        if (list) list.innerHTML = '<div class="text-center text-danger py-4">Failed to load documents</div>';
    }
}

function renderDocuments(docs) {
    const list = document.getElementById('documents-list');
    if (!list) return;

    // Grouping by Shipment
    const grouped = docs.reduce((acc, doc) => {
        if (!acc[doc.shipment_id]) acc[doc.shipment_id] = [];
        acc[doc.shipment_id].push(doc);
        return acc;
    }, {});

    list.innerHTML = Object.entries(grouped).map(([shipmentId, shipmentDocs]) => `
        <div class="shipment-doc-group mb-5">
            <div class="d-flex align-items-center mb-3">
                <div class="bg-primary bg-opacity-10 text-primary px-3 py-1 rounded-pill fw-bold border border-primary border-opacity-25">
                    <i class="fas fa-ship me-2"></i> Shipment #${shipmentId}
                </div>
                <div class="ms-3 h-px bg-secondary opacity-25 flex-grow-1"></div>
            </div>
            
            <div class="d-flex flex-column gap-3">
                ${shipmentDocs.map(doc => {
                    const isSystem = doc.file_url === '#';
                    return `
                    <div class="d-flex align-items-center justify-content-between p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-10 hover-glow transition-all">
                        <div class="d-flex align-items-center">
                            <div class="icon-box ${isSystem ? 'bg-success bg-opacity-10 text-success' : 'bg-primary bg-opacity-10 text-primary'} me-3 d-flex align-items-center justify-content-center rounded" style="width: 50px; height: 50px; min-width: 50px;">
                                <i class="fas ${
                                    doc.type === 'Invoice' || doc.type.includes('Invoicing') ? 'fa-file-invoice-dollar' :
                                    doc.type === 'Shipping Label' ? 'fa-tag' :
                                    doc.type === 'Customs declaration form' || doc.type.includes('Customs') ? 'fa-passport text-warning' :
                                    doc.type === 'Packing list' ? 'fa-boxes' :
                                    doc.type === 'ID proof' ? 'fa-id-card' :
                                    'fa-file-alt'
                                } fa-lg"></i>
                            </div>
                            <div>
                                <div class="d-flex align-items-center gap-2">
                                    <h6 class="text-white mb-0 fw-bold">${doc.type}</h6>
                                    ${isSystem ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 x-small px-2">System Generated</span>' : ''}
                                </div>
                                <small class="text-white-50">${doc.doc_name || doc.filename} • ${new Date(doc.uploaded_at).toLocaleDateString()}</small>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <span class="badge ${getStatusBadge(doc.status)} px-3 rounded-pill">${doc.status}</span>
                            ${isSystem ? `
                                <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="downloadSystemDoc('${doc.type}', ${doc.shipment_id})">
                                    <i class="fas fa-download me-1"></i> Download
                                </button>
                            ` : `
                                ${doc.status === 'Rejected' ? `
                                    <button class="btn btn-sm btn-danger rounded-pill px-3" onclick="openUploadModal(${doc.shipment_id}, '${doc.type}')">
                                        <i class="fas fa-redo me-1"></i> Re-upload
                                    </button>
                                ` : ''}
                                <button class="btn btn-icon btn-sm btn-outline-primary rounded-circle" onclick="previewDoc('${doc.url || doc.file_url}', '${doc.doc_name || doc.filename || 'Document'}')" title="View Document">
                                    <i class="fas fa-eye"></i>
                                </button>
                            `}
                        </div>
                    </div>
                `}).join('')}
            </div>
            
            <div class="mt-3">
                <button class="btn btn-sm btn-outline-secondary rounded-pill border-dashed w-100 py-2" onclick="openUploadModal(${shipmentId})">
                    <i class="fas fa-plus me-2"></i> Upload New Document for #${shipmentId}
                </button>
            </div>
        </div>
    `).join('');
}

async function downloadSystemDoc(type, shipmentId) {
    if (type === 'Invoice') {
        window.location.href = `${API_URL}/api/v3/payment/receipt/${shipmentId}`;
    } else {
        alert('Downloading ' + type + ' (PDF generation in progress...)');
    }
}

function openUploadModal(shipmentId, type = '') {
    const dt = document.getElementById('docType');
    const sid = document.getElementById('shipmentId');
    const df = document.getElementById('docFile');
    if (dt) dt.value = type || (dt.options[0]?.value);
    if (sid) sid.value = shipmentId;
    if (df) df.value = '';
    const modalEl = document.getElementById('uploadModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function previewDoc(url, filename) {
    const title = document.getElementById('previewTitle');
    const frame = document.getElementById('previewFrame');
    if (title) title.innerText = filename;
    if (frame) frame.src = url;
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

    // ⚠️ CHECK SHIPMENT STATUS
    try {
        const shipRes = await fetch(`${API_URL}/api/shipment/${shipmentId}`, { credentials: 'include' });
        const shipData = await shipRes.json();
        
        if (shipData.success && shipData.shipment) {
            const shipment = shipData.shipment;
            const allowedStatuses = ['Ship Allocated', 'Documents Pending', 'Payment Pending', 'Cargo Ready', 'Confirmed', 'Cargo Loaded', 'In Transit', 'Delivered'];
            if (!allowedStatuses.includes(shipment.status)) {
                alert(`⚠️ Upload locked for status: "${shipment.status}"`);
                return;
            }
        }
    } catch (err) { }

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
            const modal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
            if (modal) modal.hide();
            fetchDocuments(CURRENT_SHIPMENT);
            alert("Document uploaded successfully!");
        } else {
            alert(data.error || "Upload failed");
        }
    } catch (err) {
        alert("Upload failed");
    }
}
