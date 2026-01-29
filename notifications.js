// Toast Notification Library

// Ensure container exists
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
});

const Toast = {
    // Icons
    icons: {
        success: '<i class="fas fa-check-circle" style="color: #10b981;"></i>',
        error: '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>',
        info: '<i class="fas fa-info-circle" style="color: #3b82f6;"></i>'
    },

    show: function (message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return; // Should exist by DOMContentLoaded

        const toast = document.createElement('div');
        toast.className = `toast-message toast-${type}`;

        const iconHtml = this.icons[type] || this.icons.info;

        toast.innerHTML = `
            <div style="display:flex; align-items:center;">
                <div class="toast-icon">${iconHtml}</div>
                <span>${message}</span>
            </div>
            <button onclick="this.parentElement.remove()" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:1.2rem; margin-left:10px;">&times;</button>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, duration);
    },

    success: function (msg) { this.show(msg, 'success'); },
    error: function (msg) { this.show(msg, 'error'); },
    info: function (msg) { this.show(msg, 'info'); }
};

// Global shorthand if desired
window.showToast = (msg, type) => Toast.show(msg, type);
