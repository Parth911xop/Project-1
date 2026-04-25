// socket-client.js — Real-time event bridge for Smart Shipping
const SOCKET_URL = window.SOCKET_BASE_URL || '';

class ShippingSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.eventHandlers = {
            'shipment:status_update': [],
            'notification': [],
            'payment:completed': [],
            'document:verified': [],
            'ship:allocated': [],
            'tracking:update': []
        };
        this.init();
    }

    init() {
        // Only init if io is available (socket.io script must be loaded in HTML)
        if (typeof io === 'undefined') {
            console.warn("⚠️ Socket.io client script not found. Real-time features disabled.");
            return;
        }

        this.socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log("🔌 Connected to Shipping Real-time Engine");
            this.socket.emit('client:online', { timestamp: new Date() });
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log("🔌 Disconnected from Real-time Engine");
        });

        this.socket.on('error', (err) => {
            console.error("❌ Socket Error:", err);
        });

        // ═══════════════════════════════════════════════════════
        // EVENT HANDLERS
        // ═══════════════════════════════════════════════════════

        // Shipment Status Update
        this.socket.on('shipment:status_update', (data) => {
            console.log("📦 Shipment Status Updated:", data);
            
            // Trigger registered handlers
            this.emit('shipment:status_update', data);
            
            // Auto-refresh shipments
            if (typeof window.fetchShipments === 'function') {
                setTimeout(() => window.fetchShipments(), 300);
            }
            
            // Show notification toast
            this.showToast(`Shipment ${data.user_prefix || 'SS'}-${data.shipmentId} status: <strong>${data.status}</strong>`, 'info', 5000);
        });

        // New Notification (General)
        this.socket.on('notification', (data) => {
            console.log("🔔 New Notification:", data);
            this.emit('notification', data);
            
            if (typeof window.fetchNotifications === 'function') {
                window.fetchNotifications();
            }
        });

        // Payment Completed
        this.socket.on('payment:completed', (data) => {
            console.log("💰 Payment Completed:", data);
            this.emit('payment:completed', data);
            
            this.showToast(`✓ Payment of ₹${data.amount} received for Shipment ${data.user_prefix || 'SS'}-${data.shipmentId}`, 'success', 5000);
            
            // Refresh shipments to show "Cargo Ready" status
            if (typeof window.fetchShipments === 'function') {
                setTimeout(() => window.fetchShipments(), 500);
            }
        });

        // Document Verified/Rejected
        this.socket.on('document:verified', (data) => {
            console.log("📄 Document Verified:", data);
            this.emit('document:verified', data);
            
            const icon = data.status === 'Approved' ? '✓' : '✗';
            const type = data.status === 'Approved' ? 'success' : 'warning';
            this.showToast(`${icon} Document "${data.doc_name || 'Document'}" has been ${data.status.toLowerCase()}`, type, 5000);
            
            if (typeof window.fetchDocuments === 'function') {
                setTimeout(() => window.fetchDocuments(), 500);
            }
        });

        // Ship Allocated to Booking
        this.socket.on('ship:allocated', (data) => {
            console.log("⚓ Ship Allocated:", data);
            this.emit('ship:allocated', data);
            
            this.showToast(`⚓ Vessel "${data.shipName} allocated to your booking. Documents & Payment now enabled!`, 'success', 6000);
            
            if (typeof window.fetchShipments === 'function') {
                setTimeout(() => window.fetchShipments(), 500);
            }
        });

        // Live Tracking Update
        this.socket.on('tracking:update', (data) => {
            console.log("🗺️ Tracking Update:", data);
            this.emit('tracking:update', data);
            
            // Update tracking page if open
            if (typeof window.updateTrackingMap === 'function') {
                window.updateTrackingMap(data);
            }
        });

        // Manager Booking Request (for company managers)
        this.socket.on('booking:request', (data) => {
            console.log("📥 New Booking Request:", data);
            this.emit('booking:request', data);
            
            if (typeof window.loadBookings === 'function') {
                setTimeout(() => window.loadBookings(), 300);
            }
        });
    }

    /**
     * Register a custom event handler
     */
    on(eventName, callback) {
        if (!this.eventHandlers[eventName]) {
            this.eventHandlers[eventName] = [];
        }
        this.eventHandlers[eventName].push(callback);
    }

    /**
     * Emit event to registered handlers
     */
    emit(eventName, data) {
        if (this.eventHandlers[eventName]) {
            this.eventHandlers[eventName].forEach(handler => {
                try {
                    handler(data);
                } catch (err) {
                    console.error(`Error in handler for ${eventName}:`, err);
                }
            });
        }
    }

    /**
     * Join a shipment for real-time tracking
     */
    joinShipment(shipmentId) {
        if (!this.socket) return;
        this.socket.emit('join_shipment', { shipmentId });
        console.log(`📍 Joined shipment tracking: ${shipmentId}`);
    }

    /**
     * Leave shipment tracking
     */
    leaveShipment(shipmentId) {
        if (!this.socket) return;
        this.socket.emit('leave_shipment', { shipmentId });
    }

    /**
     * Listen for tracking events
     */
    onTracking(callback) {
        this.on('tracking:update', callback);
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 5000) {
        const typeStyles = {
            'success': { icon: 'fa-check-circle', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
            'warning': { icon: 'fa-exclamation-circle', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
            'error': { icon: 'fa-times-circle', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
            'info': { icon: 'fa-info-circle', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' }
        };
        
        const style = typeStyles[type] || typeStyles['info'];
        
        const toast = document.createElement('div');
        toast.className = 'position-fixed bottom-0 end-0 m-4 p-4 rounded-3 shadow-lg border';
        toast.style.zIndex = '9999';
        toast.style.minWidth = '320px';
        toast.style.backgroundColor = style.bg;
        toast.style.borderColor = style.color;
        toast.style.borderWidth = '1px';
        toast.style.borderLeft = `4px solid ${style.color}`;
        toast.style.animation = 'slideInRight 0.3s ease-out';
        
        toast.innerHTML = `
            <div class="d-flex align-items-start gap-3">
                <div style="color: ${style.color}; font-size: 1.2rem;">
                    <i class="fas ${style.icon}"></i>
                </div>
                <div style="flex: 1;">
                    <div class="fw-bold text-white" style="font-size: 0.95rem;">${message}</div>
                </div>
                <button class="btn-close" onclick="this.parentElement.parentElement.remove()" style="opacity: 0.7;"></button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}

// Add CSS animation for slide-in/out
if (!document.querySelector('#socket-animations')) {
    const style = document.createElement('style');
    style.id = 'socket-animations';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Global instance
window.shippingSocket = new ShippingSocket();
