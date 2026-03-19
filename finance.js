const API_URL = `http://${window.location.hostname}:3000`;

document.addEventListener('DOMContentLoaded', async () => {
    // Fetch session from JWT cookie — localStorage.userId is no longer used
    try {
        const sessionRes = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        const sessionData = await sessionRes.json();
        if (!sessionData.success) { window.location.href = 'auth.html'; return; }
        updateUserProfile(sessionData.user);
    } catch (e) { window.location.href = 'auth.html'; return; }

    fetchInvoices();
});

function updateUserProfile(user) {
    const name = user?.name || 'User';
    const nameEl = document.getElementById('user-name-display');
    if (nameEl) nameEl.innerText = name;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.innerText = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

async function fetchInvoices() {
    try {
        // JWT-authenticated — backend reads userId from token, not query param
        const res = await fetch(`${API_URL}/api/finance/invoices`, { credentials: 'include' });
        const data = await res.json();

        if (data.success) {
            renderFinanceDashboard(data.invoices, data.summary);
        } else {
            renderFinanceDashboard([], { totalDue: 0, overdue: 0, openCount: 0, disputeCount: 0 });
        }
    } catch (error) {
        console.error('Error loading invoices:', error);
        renderFinanceDashboard([], { totalDue: 0, overdue: 0, openCount: 0, disputeCount: 0 });
    }
}

function renderFinanceDashboard(invoices, summary) {
    // Summary cards
    const tdEl = document.getElementById('total-due');
    if (tdEl) tdEl.innerText = formatCurrency(summary?.totalDue || 0);

    const overdueEl = document.getElementById('overdue-text');
    if (overdueEl) {
        if ((summary?.overdue || 0) > 0) {
            overdueEl.innerHTML = `<i class="fas fa-exclamation-circle me-1"></i> ${formatCurrency(summary.overdue)} Overdue`;
            overdueEl.className = 'text-danger small mt-2 mb-0';
        } else {
            overdueEl.innerHTML = `<i class="fas fa-check-circle me-1"></i> No overdue payments`;
            overdueEl.className = 'text-success small mt-2 mb-0';
        }
    }

    const ocEl = document.getElementById('open-count');
    if (ocEl) ocEl.innerText = summary?.openCount || 0;
    const dcEl = document.getElementById('dispute-count');
    if (dcEl) dcEl.innerText = summary?.disputeCount || 0;

    // Table
    const tableBody = document.querySelector('tbody');
    if (!tableBody) return;

    if (!invoices || invoices.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5">
                    <i class="fas fa-file-invoice text-white-50 mb-3" style="font-size:2rem;display:block"></i>
                    <span class="text-white-50">No invoices yet. Complete a shipment booking to generate your first invoice.</span>
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = invoices.map(inv => {
        const statusMap = {
            'Completed': `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">Paid</span>`,
            'Paid': `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">Paid</span>`,
            'Pending': `<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25">Pending</span>`,
            'Overdue': `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25">Overdue</span>`,
        };
        const statusBadge = statusMap[inv.status] || statusMap['Pending'];
        const dateClass = inv.status === 'Overdue' ? 'text-danger' : 'text-white-50';
        const dateStr = new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const dueStr = inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        return `
        <tr>
            <td class="ps-4 fw-bold text-white-50 font-monospace">${inv.invoice_number || `INV-${inv.id}`}</td>
            <td class="text-white-50">${dateStr}</td>
            <td class="text-white-50">Shipment #${inv.shipment_id || '—'}</td>
            <td class="fw-bold text-white">${formatCurrency(inv.amount)}</td>
            <td>${statusBadge}</td>
            <td class="${dateClass}">${dueStr}</td>
            <td class="text-end pe-4">
                ${inv.status !== 'Completed' && inv.status !== 'Paid'
                ? `<button class="btn btn-outline-primary btn-sm rounded-pill px-3" onclick="payInvoice(${inv.id})"><i class="fas fa-credit-card me-1"></i>Pay Now</button>`
                : `<button class="btn btn-sm btn-link text-white-50 text-decoration-none"><i class="fas fa-download me-1"></i>PDF</button>`}
            </td>
        </tr>`;
    }).join('');
}

async function payInvoice(id) {
    if (!confirm('Simulate payment for this invoice?')) return;
    try {
        const res = await fetch(`${API_URL}/api/finance/pay`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: id })
        });
        const data = await res.json();
        if (data.success) { fetchInvoices(); }
        else { alert('Payment failed: ' + (data.message || 'Unknown error')); }
    } catch (err) {
        console.error(err);
        alert('Network error. Please check the server is running.');
    }
}

function formatCurrency(amount) {
    return '$' + parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
