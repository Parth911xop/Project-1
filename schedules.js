// Schedules Frontend Logic
const API_URL = 'http://localhost:3000';

document.getElementById('schedules-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const origin = document.getElementById('origin-input').value;
    const dest = document.getElementById('destination-input').value;
    const btn = document.getElementById('search-btn');
    const resultsContainer = document.getElementById('schedule-results');
    const list = resultsContainer.querySelector('.list-group');

    if (!origin || !dest) return;

    // Loading State
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Searching...';
    btn.disabled = true;
    resultsContainer.classList.add('d-none');
    list.innerHTML = '';

    try {
        // Fetch from API
        const response = await fetch(`${API_URL}/api/schedules/search?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`);
        const data = await response.json();

        if (data.success && data.results.length > 0) {
            list.innerHTML = data.results.map(r => `
                <div class="list-group-item glass border-0 text-white p-4 mb-3 rounded-3 shadow-sm hover-lift" style="transition: all 0.2s;">
                    <div class="row align-items-center g-3">
                        <div class="col-md-3">
                             <div class="d-flex align-items-center gap-2 mb-1">
                                <i class="fas fa-ship text-primary fa-lg"></i>
                                <span class="fw-bold h5 mb-0">${r.carrier}</span>
                            </div>
                            <small class="text-white-50 d-block text-truncate mb-2" title="${r.vessel}">${r.vessel}</small>
                            <span class="badge bg-white bg-opacity-10 text-white border border-white border-opacity-25">${r.id}</span>
                        </div>
                        
                        <div class="col-md-6 border-start border-end border-secondary border-opacity-25">
                            <div class="d-flex justify-content-between align-items-center px-2">
                                <div class="text-center">
                                    <small class="text-white-50 d-block text-uppercase x-small fw-bold mb-1">Departure</small>
                                    <strong class="h4 mb-0 text-white">${r.departure}</strong>
                                </div>
                                <div class="d-flex flex-column align-items-center px-4">
                                    <small class="text-info fw-bold mb-1">${r.transitTime} Days</small>
                                    <div class="d-flex align-items-center w-100 my-1 justify-content-center">
                                         <div style="width: 8px; height: 8px; background: #0dcaf0; border-radius: 50%;"></div>
                                         <div style="width: 100px; height: 2px; background: #0dcaf0; margin: 0 10px;"></div>
                                         <i class="fas fa-arrow-right text-info"></i>
                                    </div>
                                    <small class="text-white-50 x-small mt-1">Direct Service</small>
                                </div>
                                <div class="text-center">
                                    <small class="text-white-50 d-block text-uppercase x-small fw-bold mb-1">Arrival</small>
                                    <strong class="h4 mb-0 text-white">${r.arrival}</strong>
                                </div>
                            </div>
                        </div>

                        <div class="col-md-3 text-end">
                            <button class="btn btn-primary rounded-pill px-4 shadow-lg" 
                                onclick="bookSchedule('${origin}', '${dest}')">
                                Book Now <i class="fas fa-arrow-right ms-2"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
            resultsContainer.classList.remove('d-none');
        } else {
            list.innerHTML = `<div class="text-center text-white-50 py-4"><i class="fas fa-search me-2"></i>No schedules found for this route.</div>`;
            resultsContainer.classList.remove('d-none');
        }
    } catch (err) {
        console.error(err);
        list.innerHTML = `<div class="text-center text-danger py-4">Error fetching schedules. Please try again.</div>`;
        resultsContainer.classList.remove('d-none');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

function bookSchedule(origin, dest) {
    // Redirect to Wizard with pre-filled details
    window.location.href = `wizard.html?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`;
}
