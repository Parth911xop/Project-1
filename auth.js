const currentMethod = 'email'; // Forced Check
let isSignup = false;
let otpRequested = false;

// function setLoginMethod(method) ... Removed

function resetOtpUI() {
    otpRequested = false;
    document.getElementById('submitBtn').innerText = isSignup ? "Get OTP" : "Get OTP";
    document.getElementById('email-otp-container').classList.add('d-none');
    document.getElementById('emailOtpInput').value = '';
}

async function requestOTP() {
    // const method = currentMethod; 
    // Always Email
    const identifier = document.getElementById('userEmail').value;
    if (!identifier || !identifier.includes('@')) return showToast("Please enter a valid email", 'error');

    // ... Phone check removed ...

    try {
        const payload = { email: identifier, authMethod: 'email' };

        if (isSignup) {
            payload.fullName = document.getElementById('fullName').value;
            payload.useCase = document.getElementById('useCase').value;
            payload.location = document.getElementById('location').value;

            if (!payload.fullName || !payload.useCase) {
                return showToast("Please fill in all signup details including your role.", 'error');
            }
        }

        const btn = document.getElementById('submitBtn');
        const originalText = btn.innerText;
        btn.innerText = "Requesting...";
        btn.disabled = true;

        const res = await fetch(`/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        btn.innerText = originalText;
        btn.disabled = false;

        if (data.success) {

            if (isSignup) {
                showToast("Account Saved! Please Login to continue.", 'success');
                // Switch to Login Mode
                setTimeout(() => toggleSignupMode(), 300);
                return;
            }

            // DEMO: Show OTP in toast for convenience, but usually sent via email
            showToast(`OTP Sent! Code: ${data.otp}`, 'success');
            console.log("OTP:", data.otp);
            otpRequested = true;
            document.getElementById('submitBtn').innerText = "Verify & Login";

            document.getElementById('email-otp-container').classList.remove('d-none');
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast("Failed to connect to server", 'error');
    }
}

function tabNext(current, nextId) {
    if (current.value.length === 1) {
        const next = document.getElementById(nextId);
        if (next) next.focus();
    }
}

function handleSocial(provider) {
    // For demo purposes only
    const id = prompt(`Enter ${provider} Email:`);
    if (id) showToast(`Logged in via ${provider} as ${id}`, 'info');
}

function toggleSignupMode(e) {
    if (e) e.preventDefault();
    isSignup = !isSignup;

    // Reset OTP state when switching modes
    resetOtpUI();

    const title = document.getElementById('formTitle');
    const switchText = document.getElementById('switchText');

    if (isSignup) {
        title.innerText = "Create Account";
        switchText.innerHTML = 'Already have an account? <a href="#" onclick="toggleSignupMode(event)">Sign In</a>';
        document.getElementById('signup-fields').classList.remove('d-none');
        document.getElementById('submitBtn').innerText = "Save";
    } else {
        title.innerText = "Welcome Back";
        switchText.innerHTML = 'New here? <a href="#" onclick="toggleSignupMode(event)">Create an Account</a>';
        document.getElementById('signup-fields').classList.add('d-none');
        document.getElementById('submitBtn').innerText = "Get OTP";
    }
}

async function handleFinalSubmit(e) {
    e.preventDefault();

    // If OTP not requested yet, request it first
    if (!otpRequested) {
        return requestOTP();
    }

    // Verify OTP
    let identifier, otp;

    // Email Only
    identifier = document.getElementById('userEmail').value;
    otp = document.getElementById('emailOtpInput').value;

    if (!otp) return showToast("Please enter the OTP", 'error');

    try {
        const res = await fetch(`/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Receive and send HttpOnly cookie
            body: JSON.stringify({ identifier: identifier, otp: otp })
        });

        const data = await res.json();

        if (data.success) {
            showToast("Success! Redirecting...", 'success');

            // Store benign display metadata (Roles are now secured via HttpOnly JWT Cookie)
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('userName', data.user.name || data.user.email.split('@')[0]);
            localStorage.setItem('userEmail', data.user.email || '');
            if (data.companyStatus) localStorage.setItem('companyStatus', data.companyStatus);

            setTimeout(() => {
                if (data.role === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                } else if (data.role === 'company') {
                    window.location.href = 'company-dashboard.html';
                } else {
                    window.location.href = 'shipments.html';
                }
            }, 300);
        } else {
            showToast("Error: " + data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast("Server error during verification", 'error');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('submitBtn').innerText = "Get OTP";

    // Check URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    if (mode === 'signup') {
        toggleSignupMode();
    }
});