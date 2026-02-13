const API_URL = 'http://localhost:3000';
const userId = localStorage.getItem('userId');

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check handled by auth-guard.js
    updateUserProfile();
    fetchInvoices();
});

function updateUserProfile() {
    const name = localStorage.getItem('userName') || 'User';
    document.getElementById('user-name-display').innerText = name;
    document.getElementById('user-avatar').innerText = name.substring(0, 2).toUpperCase();
}

async function fetchInvoices() {
    try {
        const res = await fetch(`${API_URL}/api/finance/all?userId=${userId}`);
        const data = await res.json();

        if (data.success) {
            renderFinanceDashboard(data.invoices, data.summary);
        } else {
            console.error("Failed to fetch invoices");
            // Fallback for demo if no backend connectivity
            renderFinanceDashboard([], { totalDue: 0, overdue: 0, openCount: 0, disputeCount: 0 });
        }
    } catch (error) {
        console.error('Error loading invoices:', error);
        // showToast('Could not load finance data', 'error');
    }
}

function renderFinanceDashboard(invoices, summary) {
    // 1. Update Summary Cards
    document.getElementById('total-due').innerText = formatCurrency(summary.totalDue);

    // overdue warning logic
    const overdueEl = document.getElementById('overdue-text');
    if (summary.overdue > 0) {
        overdueEl.innerHTML = `<i class="fas fa-exclamation-circle me-1"></i> ${formatCurrency(summary.overdue)} Overdue`;
        overdueEl.className = "text-danger small mt-2 mb-0";
    } else {
        overdueEl.innerHTML = `<i class="fas fa-check-circle me-1"></i> No overdue payments`;
        overdueEl.className = "text-success small mt-2 mb-0";
    }

    document.getElementById('open-count').innerText = summary.openCount;
    document.getElementById('dispute-count').innerText = summary.disputeCount;

    // 2. Render Table
    const tableBody = document.querySelector('tbody');
    if (!tableBody) return;

    if (invoices.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-white-50 py-5">No invoices found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = invoices.map(inv => {
        let statusBadge = '';
        let dateClass = 'text-white-50';

        switch (inv.status) {
            case 'Paid':
                statusBadge = '<span class="badge bg-success bg-opacity-10 text-success border border-success">Paid</span>';
                break;
            case 'Overdue':
                statusBadge = '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger">Overdue</span>';
                dateClass = 'text-danger';
                break;
            default:
                statusBadge = '<span class="badge bg-warning bg-opacity-10 text-warning border border-warning">Pending</span>';
        }

        const dateStr = new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const dueStr = inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

        return `
        <tr>
            <td class="ps-4 fw-bold text-white-50">${inv.invoice_number}</td>
            <td class="text-white-50">${dateStr}</td>
            <td class="text-white-50">Ref #${inv.shipment_id || '-'}</td>
            <td class="fw-bold text-white">${formatCurrency(inv.amount)}</td>
            <td>${statusBadge}</td>
            <td class="${dateClass}">${dueStr}</td>
            <td class="text-end pe-4">
                ${inv.status !== 'Paid'
                ? `<button class="btn btn-outline-light btn-sm rounded-pill" onclick="payInvoice(${inv.id})">Pay Now</button>`
                : `<button class="btn btn-sm btn-link text-white-50 text-decoration-none"><i class="fas fa-download"></i> PDF</button>`}
            </td>
        </tr>
        `;
    }).join('');
}

async function payInvoice(id) {
    if (!confirm("Simulate payment for this invoice?")) return;

    try {
        const res = await fetch(`${API_URL}/api/finance/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: id })
        });
        const data = await res.json();
        if (data.success) {
            // Reload to show update
            fetchInvoices();
        } else {
            alert("Payment failed");
        }
    } catch (err) {
        console.error(err);
    }
}

function formatCurrency(amount) {
    return '₹' + parseFloat(amount).toLocaleString('en-IN');
}
