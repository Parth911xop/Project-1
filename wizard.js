const API_URL = 'http://localhost:3000';
const userId = localStorage.getItem('userId');

document.addEventListener('DOMContentLoaded', () => {
  // Auth Check handled by auth-guard.js
  initBookingForm();
});

let quoteData = {};

function initBookingForm() {
  // Mode Toggles
  const toggles = document.querySelectorAll('.mode-toggle');
  toggles.forEach(t => {
    t.addEventListener('click', () => {
      toggles.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Check for URL Params (from Homepage)
  const urlParams = new URLSearchParams(window.location.search);
  const originP = urlParams.get('origin');
  const destP = urlParams.get('dest');

  if (originP) document.getElementById('originInput').value = originP;
  if (destP) document.getElementById('destInput').value = destP;

  // Auto-quote if params exist
  if (originP && destP) {
    setTimeout(() => getAIQuote(), 500);
  }

  // AI Pref Toggles
  const prefs = document.querySelectorAll('.ai-pref-item');
  prefs.forEach(p => {
    p.addEventListener('click', () => {
      prefs.forEach(x => x.classList.remove('active'));
      p.classList.add('active');
    });
  });

  // Swap Route
  document.querySelector('.route-swap-btn')?.addEventListener('click', () => {
    const origin = document.getElementById('originInput');
    const dest = document.getElementById('destInput');
    const temp = origin.value;
    origin.value = dest.value;
    dest.value = temp;
  });
}

function getAIQuote() {
  const btn = document.querySelector('.btn-ai-quote');
  const originalText = btn.innerHTML;

  // Collect Form Data
  const origin = document.getElementById('originInput').value;
  const dest = document.getElementById('destInput').value;
  const mode = document.querySelector('.mode-toggle.active span').innerText;

  // 1. Loading State
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Analyzing 5,247 routes...';

  // Simulate API delay (In production this would optimize routes on server)
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.disabled = false;

    // 2. Show Results (Reveal Right Panel)
    const panel = document.getElementById('live-results-panel');
    panel.classList.remove('d-none');
    panel.classList.add('animate-fade-in');

    // Scroll to results on mobile
    if (window.innerWidth < 992) {
      panel.scrollIntoView({ behavior: 'smooth' });
    }

    // 3. Animate Numbers & Set Quote Data
    // Dynamic Pricing Algo (Simulated)
    // Base cost in USD * 83 for INR conversion + random variance
    const baseCostUSD = (origin.length + dest.length) * 50 + 500;
    const baseCostINR = baseCostUSD * 83;
    const dynamicCost = Math.floor(baseCostINR + Math.random() * 15000);
    const dynamicTime = Math.floor((origin.length + dest.length) / 2) + 10;

    quoteData = {
      userId: userId,
      type: 'Export', // Default
      fromCountry: origin,
      toCountry: dest,
      productType: 'Electronics', // Simplified
      weight: 5000, // Simplified
      recommendedPort: dest.includes('US') ? 'Long Beach' : 'Rotterdam',
      estimatedCost: dynamicCost,
      transitTime: dynamicTime,
      status: 'Booked',
      mode: mode,
      volume: 24, // cbm
      cargoValue: 45000
    };


    animateValue("price-fastest", 0, quoteData.estimatedCost + 20000, 1000);
    animateValue("price-best", 0, quoteData.estimatedCost, 1000);

    if (window.showToast) showToast('AI Analysis Complete! 3 optimal routes found.', 'success');

  }, 2000);
}

// Function to call REAL Backend
async function bookShipment(quoteType) {
  if (!userId) {
    showToast('Please login to book.', 'error');
    return;
  }

  // Adjust cost based on selection
  const finalData = { ...quoteData };
  if (quoteType === 'fastest') {
    finalData.estimatedCost += 20000;
    finalData.transitTime -= 5;
  }

  const btn = event.target; // The button clicked
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Booking...';
  btn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/api/shipment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalData)
    });

    const result = await response.json();

    if (result.success) {
      showToast('Booking Confirmed! Proceeding to Verification...', 'success');
      setTimeout(() => {
        // Redirect to Verification instead of Dash
        window.location.href = `verification.html?id=${result.id || 105}`;
      }, 1000);
    } else {
      showToast(result.message || 'Booking Failed', 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
    }

  } catch (err) {
    console.error(err);
    showToast('Server Connection Error', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

// Validation helper (simple)
function validateAndQuote() {
  const origin = document.getElementById('originInput').value;
  const dest = document.getElementById('destInput').value;

  if (!origin || !dest) {
    if (window.showToast) showToast('Please select origin and destination', 'error');
    return;
  }

  getAIQuote();
}
