const API_URL = 'http://localhost:3000';
const userId = localStorage.getItem('userId');

if (!userId) {
    alert("Please login to view your profile.");
    window.location.href = 'auth.html';
}

// Load Profile Data
async function loadProfile() {
    try {
        const res = await fetch(`${API_URL}/api/user/${userId}`);
        const data = await res.json();

        if (data.success) {
            const user = data.user;
            document.getElementById('fullName').value = user.full_name || '';
            document.getElementById('companyName').value = user.company_name || '';
            document.getElementById('email').value = user.email || user.phone || ''; // Identifier
            document.getElementById('phone').value = user.phone || ''; // Explicit phone field if different
            document.getElementById('location').value = user.location || '';
            document.getElementById('useCase').value = user.use_case || ''; // 'Business' or 'Personal'
        } else {
            console.error("Failed to load user data");
        }
    } catch (err) {
        console.error("Error connecting to server:", err);
    }
}

// Toggle Edit Mode
function enableEdit() {
    const fieldset = document.getElementById('formFieldset');
    const editBtn = document.getElementById('editBtn');
    const actions = document.getElementById('actionButtons');

    fieldset.disabled = false;
    editBtn.classList.add('d-none');
    actions.classList.remove('d-none');
}

function cancelEdit() {
    const fieldset = document.getElementById('formFieldset');
    const editBtn = document.getElementById('editBtn');
    const actions = document.getElementById('actionButtons');

    fieldset.disabled = true;
    editBtn.classList.remove('d-none');
    actions.classList.add('d-none');
    
    // Reload original data
    loadProfile();
}

// Save Changes
async function saveProfile(e) {
    e.preventDefault();

    const payload = {
        userId: userId,
        fullName: document.getElementById('fullName').value,
        companyName: document.getElementById('companyName').value,
        location: document.getElementById('location').value,
        useCase: document.getElementById('useCase').value,
        phone: document.getElementById('phone').value
    };

    try {
        const res = await fetch(`${API_URL}/api/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            // Show Success Toast
            const toastEl = document.getElementById('liveToast');
            const toast = new bootstrap.Toast(toastEl);
            toast.show();

            // Re-lock form
            const fieldset = document.getElementById('formFieldset');
            const editBtn = document.getElementById('editBtn');
            const actions = document.getElementById('actionButtons');

            fieldset.disabled = true;
            editBtn.classList.remove('d-none');
            actions.classList.add('d-none');
        } else {
            alert("Update Failed: " + data.message);
        }

    } catch (err) {
        console.error(err);
        alert("Server Error");
    }
}

// Init
window.onload = loadProfile;
