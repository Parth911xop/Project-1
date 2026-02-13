document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();

  // Logout Function - This listener might be redundant if the button is dynamically added with an onclick attribute.
  // The updateAuthUI function already sets up the UI, including the logout button.
  // If the logout button is dynamically added, this querySelector might not find it immediately,
  // or it might find an old one if the UI is re-rendered.
  // For now, placing it here as per instruction, but it's worth noting.
  const logoutBtn = document.querySelector('a[onclick="logout(event)"]');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Scroll Animations (Enterprise Polish)
  const observerOptions = {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px"
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target); // Only animate once
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});


function updateAuthUI() {
  const userId = localStorage.getItem('userId');
  const navLinks = document.querySelectorAll('.nav-link');
  // Check for the new d-flex container
  const authBtnContainer = document.querySelector('.d-flex.align-items-center.gap-3 .ms-lg-3');

  // Safety check for Navbar existence
  if (!authBtnContainer) return;

  if (userId) {
    // User is Logged In
    // Show Dashboard Button & Logout
    authBtnContainer.classList.remove('gap-2'); // Optional clean up
    authBtnContainer.innerHTML = `
        <a class="btn btn-outline-light btn-sm rounded-pill px-3 me-2" href="#" onclick="logout(event)">Log Out</a>
        <a class="btn btn-primary btn-sm rounded-pill px-4 shadow-lg" href="shipments.html">
            <i class="fas fa-columns me-2"></i>Dashboard
        </a>
    `;
  } else {
    // User is Logged Out
    // Restore Login/Signup
    authBtnContainer.classList.add('gap-2');
    authBtnContainer.innerHTML = `
        <a class="btn btn-outline-light btn-sm rounded-pill px-3" href="auth.html?mode=login">Log In</a>
        <a class="btn btn-primary btn-sm rounded-pill px-3 shadow-lg" href="auth.html?mode=signup">Sign Up</a>
    `;
  }
}

function logout(e) {
  if (e) e.preventDefault();
  localStorage.removeItem('userId');
  window.location.replace('index.html');
}

function startWizard() {
  window.location.href = "wizard.html";
}

function startQuickQuote() {
  const origin = document.getElementById('quickOrigin').value;
  const dest = document.getElementById('quickDest').value;
  // Redirect to wizard with pre-filled params
  window.location.href = `wizard.html?origin=${origin}&dest=${dest}`;
}
