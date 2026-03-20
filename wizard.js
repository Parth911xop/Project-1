const API_URL = `http://${window.location.hostname}:3000`;
let currentUser = null; // populated from JWT session
let currentQuotes = [];
let selectedQuoteIdx = 0;
let tradeType = 'Export'; // 'Export' or 'Import'

// ── TRADE TYPE TOGGLE (Export / Import) ──────────────────────────
function setTradeType(type, el) {
  tradeType = type;

  // Toggle active class
  document.querySelectorAll('.trade-type-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  const isImport = type === 'Import';

  // Update Route Labels
  const originLabel = document.getElementById('originLabel');
  const destLabel = document.getElementById('destLabel');
  if (originLabel) originLabel.textContent = isImport ? 'ORIGIN (Supplier\'s Location)' : 'ORIGIN (Your Location)';
  if (destLabel) destLabel.textContent = isImport ? 'DESTINATION (Your Location)' : 'DESTINATION (Buyer\'s Location)';

  // Update Trade Documentation Label
  const tradeCodeLabel = document.getElementById('tradeCodeLabel');
  if (tradeCodeLabel) tradeCodeLabel.innerHTML = isImport
    ? 'IMPORT CODE (IEC) / GST <span class="text-danger">*</span>'
    : 'EXPORT CODE (IEC) / GST <span class="text-danger">*</span>';

  // Update Incoterms suggestions based on trade type
  const incoSel = document.getElementById('incotermsSelect');
  if (incoSel) {
    if (isImport) {
      // For importers, CIF and DDP are more common
      incoSel.innerHTML = `
        <option value="CIF">CIF (Cost, Insurance & Freight) - Seller pays shipping & insurance to your port</option>
        <option value="DDP">DDP (Delivered Duty Paid) - Seller handles all costs including customs</option>
        <option value="DAP">DAP (Delivered at Place) - Seller handles everything except import customs</option>
        <option value="FOB">FOB (Free On Board) - You pay shipping from seller's port</option>
        <option value="EXW">EXW (Ex Works) - You handle all shipping from seller's door</option>
      `;
    } else {
      incoSel.innerHTML = `
        <option value="FOB">FOB (Free On Board) - You pay until port loading, Buyer pays shipping</option>
        <option value="EXW">EXW (Ex Works) - Buyer handles all shipping from your door</option>
        <option value="CIF">CIF (Cost, Insurance & Freight) - You pay shipping & insurance to dest port</option>
        <option value="DAP">DAP (Delivered at Place) - You handle everything except import customs</option>
        <option value="DDP">DDP (Delivered Duty Paid) - You handle all costs including customs</option>
      `;
    }
  }

  // Swap default origin/dest for import
  const originInput = document.getElementById('originInput');
  const destInput = document.getElementById('destInput');
  if (originInput && destInput) {
    if (isImport) {
      originInput.value = 'Los Angeles (US LAX)';
      destInput.value = 'Mumbai (IN BOM)';
    } else {
      originInput.value = 'Singapore (SG SIN)';
      destInput.value = 'Los Angeles (US LAX)';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Verify JWT session on page load
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success || !data.user) {
      window.location.href = 'auth.html';
      return;
    }
    currentUser = data.user;
  } catch (e) {
    window.location.href = 'auth.html';
    return;
  }
  loadPortsToDatalist();
  initBookingForm();

  // Real-time Port Sync
  const socket = io(API_URL);
  socket.on('ports_updated', () => {
    console.log("Ports updated in Admin Panel. Refreshing list...");
    loadPortsToDatalist();
  });
});

async function loadPortsToDatalist() {
  const list = document.getElementById('ports');
  if (!list) return;

  try {
    const res = await fetch(`${API_URL}/api/ports`);
    const data = await res.json();
    if (data.success && data.ports.length > 0) {
      // Clear existing hardcoded options
      list.innerHTML = '';
      data.ports.forEach(p => {
        const opt = document.createElement('option');
        // Format: Port Name (Country - State) [Code]
        const stateStr = p.state ? ` - ${p.state}` : '';
        opt.value = `${p.name} (${p.country}${stateStr}) [${p.code}]`;
        list.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn("Failed to load ports for datalist:", e);
  }
}

function initBookingForm() {
  // Mode Toggles
  const toggles = document.querySelectorAll('.mode-toggle');
  toggles.forEach(t => {
    t.addEventListener('click', () => {
      toggles.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Check for URL Params
  const urlParams = new URLSearchParams(window.location.search);
  const originP = urlParams.get('origin');
  const destP = urlParams.get('dest');

  if (originP) document.getElementById('originInput').value = originP;
  if (destP) document.getElementById('destInput').value = destP;
}

async function submitQuickRequest() {
  const btn = document.querySelector('.btn-ai-quote');
  const originalText = btn.innerHTML;

  const origin = document.getElementById('originInput').value;
  const dest = document.getElementById('destInput').value;
  const weight = document.getElementById('cargoWeight').value || 1000;
  const mode = document.querySelector('.mode-toggle.active span').innerText.includes('Inland') ? 'Road' : 'Sea';
  const type = document.getElementById('cargoType').value;
  const method = document.getElementById('shippingMethod').value;

  if (!origin || !dest) {
    alert("Please enter both origin and destination ports.");
    return;
  }

  if (!currentUser) {
    if (confirm("Login required to submit a request. Go to Login?")) window.location.href = "auth.html";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Submitting to Manager...';

  try {
    const payload = {
      type: tradeType,
      fromCountry: origin,
      toCountry: dest,
      weight,
      mode,
      productType: type,
      cargoDetails: {
        shippingMethod: method,
        isHazardous: document.getElementById('hazardToggle').checked,
        incoterms: document.getElementById('incotermsSelect').value,
        requiresInsurance: document.getElementById('insuranceToggle').checked,
        requiresPickup: document.getElementById('pickupToggle').checked,
        requiresDelivery: document.getElementById('deliveryToggle').checked
      }
    };

    // Add vehicle details if applicable
    if (type === 'Vehicle') {
      payload.cargoDetails.vehicle = {
        brand: document.getElementById('v-brand').value,
        model: document.getElementById('v-model').value,
        year: document.getElementById('v-year').value,
        vin: document.getElementById('v-vin').value
      };
    }

    const res = await fetch(`${API_URL}/api/shipment/create`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      alert(`✅ Request Submitted!\n\nYour Booking Reference: ${data.bookingReference}\n\nPlease check your notifications. Our manager will allocate a ship and pricing shortly.`);
      window.location.href = 'shipments.html';
    } else {
      alert("Submission Failed: " + data.message);
    }

  } catch (err) {
    console.error(err);
    alert("Server connection error during submission.");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function toggleVehicleFields() {
  const type = document.getElementById('cargoType').value;
  const vSec = document.getElementById('vehicleSection');
  const dSec = document.getElementById('vehicleDocSection');
  const method = document.getElementById('shippingMethod');

  if (type === 'Vehicle') {
    vSec.classList.remove('d-none');
    dSec.classList.remove('d-none');
    if (method) method.value = 'RoRo'; // Default for cars
  } else {
    vSec.classList.add('d-none');
    dSec.classList.add('d-none');
    if (method) method.value = 'FCL';
  }
}

let pendingBookingIdx = null;

async function bookShipment(idx) {
  const quote = currentQuotes[idx];

  if (!currentUser) {
    if (confirm("Login required to book. Proceed?")) window.location.href = "auth.html";
    return;
  }

  if (currentUser.role === 'company') {
    alert("Shipping Companies cannot book shipments. Please log in with a Customer or Admin account.");
    return;
  }

  // Simplified booking request as per user-manager workflow:
  // User just gives Source, Dest, Cargo Type, and Trade Type first.
  const confirmBooking = confirm(`Confirm Booking Request?\n\nRoute: ${document.getElementById('originInput').value} to ${document.getElementById('destInput').value}\nCargo: ${document.getElementById('cargoType').value}\n\nOur manager will review this and allocate a ship before you provide further details and payment.`);

  if (!confirmBooking) return;

  const cargoType = document.getElementById('cargoType').value;
  const isOffset = document.getElementById('carbonOffset')?.checked || false;
  const priceVal = (quote.cost + (isOffset ? quote.carbonOffsetCost : 0)) * 84;

  const payload = {
    type: tradeType,
    productType: cargoType,
    fromCountry: document.getElementById('originInput').value,
    toCountry: document.getElementById('destInput').value,
    companyId: quote.companyId,
    estimatedCost: priceVal,
    transitTime: quote.days,
    mode: quote.mode,
    status: 'Pending Approval',
    weight: document.getElementById('cargoWeight').value || 1000,
    carbonEmission: isOffset ? 0 : quote.co2,
    preferredShippingDate: document.querySelector('input[type="date"]')?.value || new Date().toISOString()
  };

  try {
    const res = await fetch(`${API_URL}/api/shipment/create`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      alert(`✅ Request Sent to Company Manager!\n\nPlease wait for the manager to review and allocate a ship.\n\nYou will be notified via the dashboard to fill details and pay once approved.`);
      window.location.href = 'shipments.html';
    } else {
      alert('Request failed: ' + (data.message || 'Unknown error'));
      btn.disabled = false;
    }
  } catch (e) {
    console.error(e);
    alert('Network error during booking request.');
  }
}

function showBookingSummary() {
  const fields = {
    hsCode: document.getElementById('hsCode').value,
    goodsDesc: document.getElementById('goodsDesc').value,
    consigneeName: document.getElementById('consigneeName').value,
    consigneeContact: document.getElementById('consigneeContact').value,
    originCountry: document.getElementById('originCountry').value,
    cargoValue: document.getElementById('cargoValue').value,
    kycType: document.getElementById('kycType').value,
    addrType: document.getElementById('addrType').value,
    iecNum: document.getElementById('iecNum').value
  };

  const files = {
    kyc: document.getElementById('kycFile').files[0],
    addr: document.getElementById('addrFile').files[0],
    iec: document.getElementById('iecFile').files[0],
    invoice: document.getElementById('invoiceFile').files[0],
    packing: document.getElementById('packingListFile').files[0]
  };

  const isOffset = document.getElementById('carbonOffset')?.checked || false;
  const totalCostINR = (quote.cost + (isOffset ? quote.carbonOffsetCost : 0)) * 84;

  const summaryHtml = `
    <div class="row g-3">
      <div class="col-6">
        <label class="text-white-50 x-small fw-bold text-uppercase">Shipment Type</label>
        <p class="mb-0"><span class="badge ${tradeType === 'Import' ? 'bg-success' : 'bg-primary'} px-3 py-1">${tradeType}</span></p>
      </div>
      <div class="col-6 text-end">
        <label class="text-white-50 x-small fw-bold text-uppercase">Route</label>
        <p class="text-white small mb-0">${document.getElementById('originInput').value} → ${document.getElementById('destInput').value}</p>
      </div>
      <div class="col-6">
        <label class="text-white-50 x-small fw-bold text-uppercase">Carrier & Mode</label>
        <p class="text-white small mb-0">${quote.carrier} | ${quote.mode}</p>
      </div>
      <div class="col-6">
        <label class="text-white-50 x-small fw-bold text-uppercase">Consignee</label>
        <p class="text-white small mb-0">${fields.consigneeName} (${fields.consigneeContact})</p>
      </div>
      <div class="col-6 text-end">
        <label class="text-white-50 x-small fw-bold text-uppercase">Goods & HS Code</label>
        <p class="text-white small mb-0">${fields.goodsDesc} [${fields.hsCode}]</p>
      </div>
      <div class="col-4">
        <label class="text-white-50 x-small fw-bold text-uppercase">Transit Time</label>
        <p class="text-white small mb-0">${quote.days} Days</p>
      </div>
      <div class="col-4 text-center">
        <label class="text-white-50 x-small fw-bold text-uppercase">Origin Country</label>
        <p class="text-white small mb-0">${fields.originCountry}</p>
      </div>
      <div class="col-4 text-end">
        <label class="text-white-50 x-small fw-bold text-uppercase">Cargo Value</label>
        <p class="text-white small mb-0">$${Number(fields.cargoValue).toLocaleString()}</p>
      </div>
      <div class="col-12">
        <div class="alert alert-info border-info border-opacity-25 bg-info bg-opacity-10 small mb-0">
          <i class="fas fa-info-circle me-2"></i> <strong>Initial Request:</strong> You will be able to upload documents and complete payment <strong>after</strong> a ship is allocated to your booking by our manager.
        </div>
      </div>
      <div class="col-12 mt-3 pt-3 border-top border-secondary border-opacity-25">
        <div class="d-flex justify-content-between align-items-center">
          <h5 class="text-success mb-0 fw-bold">Total Amount:</h5>
          <h4 class="text-success mb-0 fw-bold">₹${totalCostINR.toLocaleString()}</h4>
        </div>
      </div>
    </div>
  `;

  document.getElementById('booking-summary-content').innerHTML = summaryHtml;

  // Switch steps
  document.getElementById('modal-step-1').classList.add('d-none');
  document.getElementById('modal-step-2').classList.remove('d-none');
  document.getElementById('proceedToSummaryBtn').classList.add('d-none');
  document.getElementById('finalPaymentBtn').classList.remove('d-none');
}

function downloadBookingPDF() {
  const content = document.getElementById('booking-summary-content').innerHTML;
  const printWindow = window.open('', '', 'height=700,width=900');

  printWindow.document.write('<html><head><title>Booking Summary - Smart Shipping</title>');
  printWindow.document.write('<style>');
  printWindow.document.write('body { font-family: sans-serif; padding: 40px; color: #333; }');
  printWindow.document.write('.row { display: flex; flex-wrap: wrap; margin-bottom: 20px; }');
  printWindow.document.write('.col-6 { width: 50%; } .col-4 { width: 33.33%; } .col-12 { width: 100%; }');
  printWindow.document.write('label { display: block; font-size: 10px; font-weight: bold; color: #777; text-transform: uppercase; margin-bottom: 4px; }');
  printWindow.document.write('p { margin: 0 0 15px 0; font-size: 14px; }');
  printWindow.document.write('h2 { color: #0d6efd; border-bottom: 2px solid #0d6efd; padding-bottom: 10px; }');
  printWindow.document.write('h4 { color: #198754; margin: 5px 0; }');
  printWindow.document.write('.p-3 { padding: 15px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; margin-top: 20px; }');
  printWindow.document.write('ul { list-style: none; padding-left: 0; }');
  printWindow.document.write('li { font-size: 12px; margin-bottom: 5px; color: #444; }');
  printWindow.document.write('.border-top { border-top: 1px solid #ddd; padding-top: 20px; }');
  printWindow.document.write('.text-end { text-align: right; } .text-center { text-align: center; } .text-success { color: #198754; }');
  printWindow.document.write('</style></head><body>');
  printWindow.document.write('<h2>OFFICIAL SHIPMENT BOOKING SUMMARY</h2>');
  printWindow.document.write('<p style="font-size: 10px; margin-bottom: 30px;">Generated on: ' + new Date().toLocaleString() + '</p>');
  printWindow.document.write(content);
  printWindow.document.write('<div style="margin-top: 50px; padding: 20px; background: #fff8f0; border: 1px solid #ffeeba; border-radius: 8px;">');
  printWindow.document.write('<p style="font-size: 11px; margin: 0;"><b>Compliance Note:</b> All documents provided are subject to verification by the destination country\'s customs authorities. Fraudulent documents may lead to shipment seizure and legal action.</p>');
  printWindow.document.write('</div>');
  printWindow.document.write('<div style="margin-top: 40px; font-size: 10px; color: #999; text-align: center;">Verified by Smart Shipping AI Engine | Powered by Hyperledger Fabric</div>');
  printWindow.document.write('</body></html>');

  printWindow.document.close();
  printWindow.print();
}

async function submitBookingWithDocs() {
  const hsCode = document.getElementById('hsCode').value;
  const goodsDesc = document.getElementById('goodsDesc').value;
  const consigneeName = document.getElementById('consigneeName').value;
  const consigneeContact = document.getElementById('consigneeContact').value;
  const cargoValue = document.getElementById('cargoValue').value;
  const iecCode = document.getElementById('iecNum').value;

  const btn = document.getElementById('finalPaymentBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Submitting Request...';

  const idx = pendingBookingIdx;
  const quote = currentQuotes[idx];
  const isOffset = document.getElementById('carbonOffset')?.checked || false;

  const priceVal = (quote.cost + (isOffset ? quote.carbonOffsetCost : 0)) * 84;

  // Extra Services
  const services = {
    insurance: document.getElementById('insuranceToggle')?.checked || false,
    pickup: document.getElementById('pickupToggle')?.checked || false,
    delivery: document.getElementById('deliveryToggle')?.checked || false
  };

  const cargoType = document.getElementById('cargoType').value;
  const shippingMethod = document.getElementById('shippingMethod').value;
  let cargoDetails = { services, shippingMethod };

  if (cargoType === 'Vehicle') {
    cargoDetails.brand = document.getElementById('v-brand').value;
    cargoDetails.model = document.getElementById('v-model').value;
    cargoDetails.year = document.getElementById('v-year').value;
    cargoDetails.vin = document.getElementById('v-vin').value;
  }

  const payload = {
    type: tradeType,
    productType: cargoType,
    fromCountry: document.getElementById('originInput').value,
    toCountry: document.getElementById('destInput').value,
    companyId: quote.companyId,
    estimatedCost: priceVal,
    transitTime: quote.days,
    mode: quote.mode,
    status: 'Pending Manager Approval',
    weight: document.getElementById('cargoWeight').value || 1000,
    carbonEmission: isOffset ? 0 : quote.co2,
    hsCode: hsCode,
    description: goodsDesc,
    consigneeName: consigneeName,
    consigneeContact: consigneeContact,
    cargoValue: cargoValue,
    iecCode: iecCode,
    cargoDetails: cargoDetails,
    preferredShippingDate: document.querySelector('input[type="date"]')?.value || new Date().toISOString()
  };

  try {
    const res = await fetch(`${API_URL}/api/shipment/create`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      alert(`✅ Booking Request Submitted!\n\nYour shipment #${data.bookingReference || data.shipmentId} is now "Pending Manager Approval".\n\nYou will be notified once a ship is allocated.`);
      window.location.href = 'shipments.html';
    } else {
      alert('Booking failed: ' + (data.message || 'Unknown error'));
      btn.disabled = false;
      btn.innerHTML = 'Confirm Booking Request';
    }
  } catch (e) {
    console.error(e);
    alert('Network error during booking.');
    btn.disabled = false;
    btn.innerHTML = 'Confirm Booking Request';
  }
}

// ── HS CODE SEARCH ───────────────────────────────────────────
let hscodeTimer;
function handleHSCodeTyping(val) {
  clearTimeout(hscodeTimer);
  if (val.length < 2) {
    const list = document.getElementById('hscode-results');
    if (list) list.classList.add('d-none');
    return;
  }
  hscodeTimer = setTimeout(() => searchHSCode(val), 400);
}

async function searchHSCode(query) {
  try {
    const res = await fetch(`${API_URL}/api/hscode/search?q=${query}`);
    const data = await res.json();
    const list = document.getElementById('hscode-results');

    if (data.success && data.results.length > 0) {
      list.innerHTML = data.results.map(item => `
        <button type="button" class="list-group-item list-group-item-action bg-dark text-white border-secondary small py-2" 
          onclick="selectHSCode('${item.code}', '${item.name.replace(/'/g, "\\'")}')">
          <strong class="text-primary">${item.code}</strong> - ${item.name}
        </button>
      `).join('');
      list.classList.remove('d-none');
    } else {
      if (list) list.classList.add('d-none');
    }
  } catch (e) {
    console.error("HS Code search failed", e);
  }
}

function selectHSCode(code, name) {
  document.getElementById('hsCode').value = code;
  document.getElementById('goodsDesc').value = name;
  document.getElementById('hscode-results').classList.add('d-none');
}

function searchHSCodePrompt() {
  const q = prompt("Search for goods (e.g. 'Coffee', 'Rice', 'Phone'):");
  if (q) searchHSCode(q);
}
