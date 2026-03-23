const fs = require('fs');
let code = fs.readFileSync('d:\\Project-1\\shipments.js', 'utf8');

const missingChunk = `    const isAlreadyPaid = s.status === 'Cargo Ready' || s.status === 'Confirmed' || s.status === 'Cargo Loaded' || s.status === 'In Transit' || s.status === 'Delivered';

    if (isAlreadyPaid) {
        payBtn.style.display = 'none';
        receiptBtn.style.display = 'inline-block';
        receiptBtn.onclick = () => downloadReceipt(id, s.user_prefix || 'SS');
        paymentLockedNotice.style.display = 'none';
    } else if (!isPaymentAllowed) {
        payBtn.disabled = true;
        payBtn.style.opacity = '0.5';
        payBtn.style.cursor = 'not-allowed';
        paymentLockedNotice.style.display = 'block';
        receiptBtn.style.display = 'none';
    } else {
        payBtn.disabled = false;
        payBtn.style.opacity = '1';
        payBtn.style.cursor = 'pointer';
        paymentLockedNotice.style.display = 'none';
        receiptBtn.style.display = 'none';
    }
    
    payBtn.onclick = () => processBookingPayment(id);

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    const container = document.getElementById('quote-options-container');
    if (container) {
        container.innerHTML = '<div class="col-12 text-center py-4 text-white-50"><span class="spinner-border spinner-border-sm me-2"></span> Loading service options...</div>';
        
        fetch(\`\$\{API_URL\}/api/v3/shipment/\$\{id\}/quotes\`, { credentials: 'include' })
            .then(r => r.json())
            .then(async data => {
                if (data.success && data.quotes.length > 0) {
                    container.innerHTML = data.quotes.map(q => {
                        const icon = q.option_name === 'Economy' ? 'feather' : q.option_name === 'Express' ? 'bolt' : 'anchor';
                        const color = q.option_name === 'Economy' ? 'info' : q.option_name === 'Express' ? 'warning' : 'primary';
                        const isSelected = q.id === data.selectedId;
                        return \`
                        <div class="col-md-4">
                            <div class="p-3 border rounded text-center h-100 \$\{isSelected ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary bg-dark bg-opacity-25'\}" 
                                 style="transition: all 0.2s ease;">
                                <i class="fas fa-\$\{icon\} text-\$\{color\} mb-2 fs-3"></i>
                                <div class="fw-bold text-white small">\$\{q.option_name\}</div>
                                <div class="text-white-50 x-small mb-2">\$\{q.transit_time || 'Direct'\}</div>
                                <div class="text-success fw-bold mb-3">₹\$\{Number(q.price).toLocaleString()\}</div>
                                <button class="btn \$\{isSelected ? 'btn-primary' : 'btn-outline-primary'\} btn-sm w-100 rounded-pill x-small fw-bold" onclick="selectShipService('\$\{id\}', \$\{q.id\}, \$\{q.price\})">
                                    \$\{isSelected ? 'Selected' : 'Book Now'\}
                                </button>
                            </div>
                        </div>\`;
                    }).join('');
                    
                    const docBody = document.getElementById('comp-step-2-body');
                    const exRes = await fetch(\`\$\{API_URL\}/api/documents/\$\{id\}\`, { credentials: 'include' });
                    const exDocs = (await exRes.json()).documents || [];

                    if (docBody && data.docs.length > 0) {
                        docBody.innerHTML = \`<h6 class="text-primary small fw-bold text-uppercase mb-3">2. Compliance Handshake (\$\{data.docs.length\} Required)</h6>\` + 
                        data.docs.map(d => {
                            const found = exDocs.find(x => x.type === d);
                            return \`
                            <div class="mb-3 p-3 bg-dark bg-opacity-25 rounded border border-secondary border-opacity-25">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <label class="small text-white fw-bold mb-0">\$\{d\} \$\{found ? '<span class="text-success ms-2"><i class="fas fa-check-circle"></i> Verified</span>' : '*'\}</label>
                                    \$\{found ? \`<a href="\$\{API_URL\}\$\{found.file_url\}" target="_blank" class="x-small text-info"><i class="fas fa-eye me-1"></i>View</a>\` : ''\}
                                </div>
                                <input type="file" class="form-control form-control-sm bg-dark text-white border-secondary ship-doc-input" data-type="\$\{d\}">
                            </div>\`;
                        }).join('');
                    }
                } else {
                    container.innerHTML = \`<div class="col-12 text-center py-5 text-warning small">Rates are still being finalized. Please check back soon.</div>\`;
                }
            })
            .catch(err => {
                container.innerHTML = '<div class="col-12 text-center py-4 text-danger small">Failed to load logistics options.</div>';
            });
    }
}

async function selectShipService(shipmentId, quoteId, price) {
    try {
        const res = await fetch(\`\$\{API_URL\}/api/v3/shipment/\$\{shipmentId\}/select-quote\`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteId })
        });
        const d = await res.json();
        if (d.success) {
            const cost = Number(price);
            document.getElementById('comp-amt-base').innerText = '₹' + cost.toLocaleString();
            document.getElementById('comp-amt-tax').innerText = '₹' + (cost * 0.08).toLocaleString();
            document.getElementById('comp-amt-total').innerText = '₹' + (cost * 1.08).toLocaleString();
            goToStep(1); 
        } else {
            alert('Selection Failed: ' + (d.message || 'Server error'));
        }
    } catch (e) { 
        alert('Network Error during selection');
    }
}

function goToStep(n) {
    for (let i = 0; i <= 3; i++) {
        const step = document.getElementById(\`comp-step-\$\{i\}\`);
        if (step) step.style.display = i === n ? 'block' : 'none';
    }
    document.querySelectorAll('.step-dot').forEach(d => d.classList.remove('active'));
    for (let i = 0; i <= n; i++) {
        const dot = document.getElementById(\`step-dot-\$\{i\}\`);
        if (dot) dot.classList.add('active');
    }
}

async function uploadAllShipmentDocs(shipmentId) {
    const btn = document.getElementById('uploadAllBtn');
    const originalText = btn.innerHTML;

    try {
        const gateRes = await fetch(\`\$\{API_URL\}/api/v3/shipment/\$\{shipmentId\}/can-upload\`, { credentials: 'include' });
        const gateData = await gateRes.json();
        if (!gateData.success || !gateData.canUpload) {
            alert(gateData.message || 'Document upload is locked until ship allocation.');
            return;
        }
    } catch (e) {
    }

    const details = {
        hsCode: document.getElementById('comp-hs-code').value,
        consigneeName: document.getElementById('comp-consignee').value,
        description: document.getElementById('comp-desc').value,
        consigneeContact: document.getElementById('comp-contact').value,
        cargoValue: document.getElementById('comp-value').value
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Finalizing Details...';

    try {
        await fetch(\`\$\{API_URL\}/api/shipment/\$\{shipmentId\}/update-details\`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details)
        });
    } catch (e) {}

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Sealing Documents...';

    const fileInputs = document.querySelectorAll('.ship-doc-input');
    try {
        let successCount = 0;
        for (const input of fileInputs) {
            if (input.files.length > 0) {
                const docType = input.getAttribute('data-type');
                const file = input.files[0];
                
                const formData = new FormData();
                formData.append('docFile', file);
                formData.append('type', docType);
                formData.append('shipmentId', shipmentId);
                formData.append('docName', file.name);

                const res = await fetch(\`\$\{API_URL\}/api/documents/upload\`, {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });
                const d = await res.json();
                if (d.success) successCount++;
            }
        }
        
        goToStep(3); 
`;

const startMatchStr = `    if (!s) return;

    goToStep(0); // Start at Service Selection
    document.getElementById('comp-hs-code').value = s.hs_code || '';
    document.getElementById('comp-consignee').value = s.consignee_name || '';
    document.getElementById('comp-desc').value = s.description || '';
    document.getElementById('comp-contact').value = s.consignee_contact || '';
    document.getElementById('comp-value').value = s.cargo_value || '';

    const cost = Number(s.estimated_cost || 0);
    const tax = cost * 0.08;
    const total = cost + tax;

    const isVehicle = (s.product_type || '').toLowerCase().includes('car') || (s.product_type || '').toLowerCase().includes('vehi');
    const vehArea = document.getElementById('comp-vehicle-docs');
    if (vehArea) vehArea.style.display = isVehicle ? 'block' : 'none';

    document.getElementById('comp-amt-base').innerText = '₹' + cost.toLocaleString();
    document.getElementById('comp-amt-tax').innerText = '₹' + tax.toLocaleString();
    document.getElementById('comp-amt-total').innerText = '₹' + total.toLocaleString();

    document.getElementById('uploadAllBtn').onclick = () => uploadAllShipmentDocs(id);
    
    // ⚠️ PAYMENT GATING: Check shipment status
    const payBtn = document.getElementById('payProceedBtn');
    const receiptBtn = document.getElementById('downloadReceiptBtn');
    const paymentLockedNotice = document.getElementById('payment-locked-notice');
    
    const allowedPaymentStatuses = ['Ship Allocated', 'Documents Pending', 'Payment Pending'];
    const isPaymentAllowed = allowedPaymentStatuses.includes(s.status);\n`;

const pre = code.substring(0, code.indexOf("    if (!s) return;"));

const newProcessPayment = `async function processBookingPayment(shipmentId) {
    const btn = document.getElementById('payProceedBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Redirecting to Stripe...';

    try {
        const res = await fetch(\`\$\{API_URL\}/api/payment/create-checkout-session\`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId })
        });
        const data = await res.json();
        if (data.success && data.url) {
            window.location.href = data.url;
        } else {
            alert(data.message || 'Payment initiation failed. Ensure you have properly set up Stripe keys.');
            btn.disabled = false;
            btn.innerHTML = 'Pay Now <i class="fas fa-credit-card ms-2"></i>';
        }
    } catch (e) {
        alert('Network error connecting to payment gateway.');
        btn.disabled = false;
        btn.innerHTML = 'Pay Now <i class="fas fa-credit-card ms-2"></i>';
    }
}
`;

const afterPaymentStart = code.substring(code.indexOf("async function showReceipt(shipmentId) {"));

const endMarker = `    } catch (e) {
        alert('Compliance Check Failed: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
`;

const combined = pre + startMatchStr + missingChunk + endMarker + '\n' + newProcessPayment + '\n' + afterPaymentStart;

fs.writeFileSync('d:\\Project-1\\shipments.js', combined);
console.log('Successfully wrote to shipments.js');
