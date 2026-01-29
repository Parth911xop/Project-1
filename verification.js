document.addEventListener('DOMContentLoaded', () => {
    // Get shipment ID from URL
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || 'NEW';
    document.getElementById('ref-id').innerText = `SS-${id}`;

    initUploadZones();
});

function nextStep(current) {
    // Validate (Simplified)
    if (current < 4) {
        // Check file for steps 1-3
        const fileInput = document.getElementById(`file-${current}`);
        if (!fileInput.files.length && !window.demoMode) {
            // Demo mode bypass or require file
            if (window.showToast) showToast('Please select a file to upload.', 'warning');
            // return; // Commented out for smoother demo
        }
    }

    // Hide Current
    document.getElementById(`step-${current}`).classList.remove('active');

    // Show Next
    const next = current + 1;
    document.getElementById(`step-${next}`).classList.add('active');

    // Update Progress
    updateProgress(next);
}

function prevStep(current) {
    document.getElementById(`step-${current}`).classList.remove('active');
    const prev = current - 1;
    document.getElementById(`step-${prev}`).classList.add('active');
    updateProgress(prev);
}

function updateProgress(step) {
    // Update Indicators
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`step-${i}-ind`);
        if (i < step) {
            el.classList.add('completed');
            el.classList.remove('active');
            el.innerHTML = '<i class="fas fa-check small"></i>';
        } else if (i === step) {
            el.classList.add('active');
            el.classList.remove('completed');
            el.innerText = i;
        } else {
            el.classList.remove('active', 'completed');
            el.innerText = i;
        }
    }

    // Update Bar
    const percent = Math.min(((step - 1) / 4) * 100, 100);
    document.getElementById('main-progress').style.width = `${percent}%`;
}

function finishVerification() {
    const btn = event.target;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

    setTimeout(() => {
        if (window.showToast) showToast('Verification Complete! Shipment is now active.', 'success');

        setTimeout(() => {
            window.location.href = 'shipments.html';
        }, 1500);
    }, 1500);
}

// Drag & Drop Handling
function initUploadZones() {
    const zones = document.querySelectorAll('.upload-zone');

    zones.forEach(zone => {
        zone.addEventListener('click', () => {
            zone.querySelector('input').click();
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFiles(zone, files[0]);
            }
        });
    });
}

function handleFileSelect(step) {
    const input = document.getElementById(`file-${step}`);
    if (input.files.length > 0) {
        handleFiles(document.getElementById(`drop-zone-${step}`), input.files[0]);
    }
}

function handleFiles(zone, file) {
    // UI Feedback
    const h5 = zone.querySelector('h5');
    const p = zone.querySelector('p');
    const icon = zone.querySelector('i');

    h5.innerText = file.name;
    h5.classList.add('text-success');
    p.innerText = "Ready to upload";
    icon.className = "fas fa-check-circle fa-2x text-success mb-3";

    if (window.showToast) showToast(`File selected: ${file.name}`, 'info');
}
