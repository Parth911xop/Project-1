const API_URL = 'http://localhost:3000';
const userId = localStorage.getItem('userId');

let currentQuotes = [];
let selectedQuoteIdx = 0; // Default to Best Value (index 0)

document.addEventListener('DOMContentLoaded', () => {
  initBookingForm();
});

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

async function getAIQuote() {
  const btn = document.querySelector('.btn-ai-quote');
  const originalText = btn.innerHTML;

  const origin = document.getElementById('originInput').value;
  const dest = document.getElementById('destInput').value;
  const weight = document.querySelector('input[type="number"]').value || 1000;
  const mode = document.querySelector('.mode-toggle.active span').innerText.includes('Air') ? 'Air' : 'Ocean';

  if (!origin || !dest) {
    showToast("Please enter origin and destination", "error");
    return;
  }

  // UI Loading
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Analyzing Global Routes...';

  try {
    const res = await fetch(`${API_URL}/api/quote/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromCountry: origin, toCountry: dest, weight, mode })
    });
    const data = await res.json();

    if (data.success) {
      currentQuotes = data.quotes;
      renderResults(data.quotes);
    } else {
      showToast("Failed to calculate quotes", "error");
    }

  } catch (err) {
    console.error(err);
    showToast("Server Connection Error", "error");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function renderResults(quotes) {
  const panel = document.getElementById('live-results-panel');
  const container = document.getElementById('results-container');

  panel.classList.remove('d-none');
  panel.classList.add('animate-fade-in');

  // Build the 3 cards
  container.innerHTML = quotes.map((q, idx) => {
    const isEco = q.id === 'opt_eco';
    const isFast = q.id === 'opt_fast';

    let badgeClass = 'bg-primary';
    let icon = 'fa-robot';
    let borderClass = 'border-primary';
    let glow = isEco ? '' : (idx === 0 ? 'style="box-shadow: 0 0 15px rgba(59,130,246,0.2);"' : '');

    if (isEco) {
      badgeClass = 'bg-success';
      icon = 'fa-leaf';
      borderClass = 'border-success';
    } else if (isFast) {
      badgeClass = 'bg-warning text-dark';
      icon = 'fa-bolt';
      borderClass = 'border-warning';
    }

    return `
        <div class="result-card p-3 mb-3 ${borderClass} position-relative" ${glow}>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge ${badgeClass}"><i class="fas ${icon} me-1"></i>${q.badge.toUpperCase()}</span>
                <span class="text-white-50 x-small"><i class="fas fa-smog me-1"></i>${q.co2} kg CO2</span>
            </div>
            
            <div class="d-flex justify-content-between align-items-end">
                <div>
                    <h4 class="text-white fw-bold m-0" id="price-${idx}">₹${(q.cost * 84).toLocaleString()}</h4>
                    <small class="text-white-50">${q.carrier} • ${q.days} days</small>
                </div>
                <button class="btn ${isEco ? 'btn-success' : 'btn-outline-light'} btn-sm rounded-pill px-4" 
                    onclick="bookShipment(${idx})">
                    Book <i class="fas fa-arrow-right ms-1"></i>
                </button>
            </div>

            ${isEco ? `
            <div class="mt-2 text-success x-small fw-bold">
                <i class="fas fa-check-circle me-1"></i> Lowest Carbon Footprint
            </div>
            ` : ''}
        </div>
        `;
  }).join('');

  // Add Carbon Offset Toggle
  container.innerHTML += `
    <div class="mt-3 bg-dark bg-opacity-50 p-3 rounded-3 border border-success border-opacity-25">
        <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="carbonOffset" onchange="toggleCarbonOffset(this.checked)">
            <label class="form-check-label text-white small" for="carbonOffset">
                <i class="fas fa-tree text-success me-1"></i> 
                <strong>Make Shipment Carbon Neutral</strong> (+<span id="offset-cost">₹0</span>)
            </label>
        </div>
    </div>
    `;

  // Initialize Offset Price (based on first/best option)
  updateOffsetPrice(0);
}

function updateOffsetPrice(idx) {
  const offset = currentQuotes[idx].carbonOffsetCost * 84; // Convert to INR
  document.getElementById('offset-cost').innerText = '₹' + Math.ceil(offset);
}

function toggleCarbonOffset(checked) {
  if (!currentQuotes.length) return;

  // Update all displayed prices
  currentQuotes.forEach((q, idx) => {
    const base = q.cost * 84;
    const offset = q.carbonOffsetCost * 84;
    const total = checked ? base + offset : base;

    const el = document.getElementById(`price-${idx}`);
    if (el) el.innerText = '₹' + total.toLocaleString();
  });
}

async function bookShipment(idx) {
  const quote = currentQuotes[idx];
  const isOffset = document.getElementById('carbonOffset')?.checked || false;

  if (!userId) {
    if (confirm("Login required to book. Proceed?")) window.location.href = "auth.html";
    return;
  }

  if (confirm(`Confirm booking with ${quote.carrier} for ₹${document.getElementById(`price-${idx}`).innerText}?`)) {
    // Create Payload
    const payload = {
      userId,
      type: 'Export',
      fromCountry: document.getElementById('originInput').value,
      toCountry: document.getElementById('destInput').value,
      estimatedCost: quote.cost + (isOffset ? quote.carbonOffsetCost : 0),
      transitTime: quote.days,
      mode: quote.mode,
      status: 'Booked',
      weight: 1000 // simplified
    };

    try {
      // Re-use existing create endpoint
      const res = await fetch(`${API_URL}/api/shipment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = `verification.html?id=${data.shipmentId || 999}`;
      }
    } catch (e) {
      console.error(e);
      alert("Booking failed");
    }
  }
}
