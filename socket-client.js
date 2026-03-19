// socket-client.js — Real-time event bridge for Smart Shipping
const SOCKET_URL = `http://${window.location.hostname}:3000`;

class ShippingSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
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
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log("🔌 Disconnected from Real-time Engine");
        });

        this.socket.on('error', (err) => {
            console.error("❌ Socket Error:", err);
        });

        // Global Event: Status Update
        this.socket.on('shipment:status_update', (data) => {
            console.log("📦 Shipment Status Updated:", data);
            // Re-fetch shipments if on the dashboard
            if (typeof window.fetchShipments === 'function') {
                window.fetchShipments();
            }
            
            // Show toast or notification
            this.showToast(`Shipment ${data.user_prefix || 'SS'}-${data.shipmentId} is now ${data.status}`);
        });

        // Global Event: New Notification
        this.socket.on('notification', (data) => {
            console.log("🔔 New Notification:", data);
            if (typeof window.fetchNotifications === 'function') {
                window.fetchNotifications();
            }
        });
    }

    joinShipment(shipmentId) {
        if (!this.socket) return;
        this.socket.emit('join_shipment', { shipmentId });
    }

    onTracking(callback) {
        if (!this.socket) return;
        this.socket.on('tracking_event', callback);
    }

    showToast(message) {
        // Simple toast implementation if not using a library
        const toast = document.createElement('div');
        toast.className = 'glass position-fixed bottom-0 end-0 m-4 p-3 rounded-3 shadow-lg border-primary';
        toast.style.zIndex = '9999';
        toast.style.minWidth = '300px';
        toast.style.borderLeft = '4px solid var(--bs-primary)';
        toast.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="bg-primary bg-opacity-10 p-2 rounded-circle">
                    <i class="fas fa-ship text-primary"></i>
                </div>
                <div>
                    <div class="fw-bold text-white small">Live Update</div>
                    <div class="text-white-50 x-small">${message}</div>
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
}

// Global instance
window.shippingSocket = new ShippingSocket();
