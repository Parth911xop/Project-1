# Project: Smart Shipping Enterprise (V3)

A professional-grade, end-to-end logistics platform designed for global cargo management, vessel routing, and real-time shipment tracking.

## 🚀 Key Modules & Roles

### 1. Customer Portal (User Dashboard)
*   **Intelligent Booking Wizard**: Multi-step flow for defining cargo (source, destination, type, volume).
*   **Gated Document/Payment Workflow**: Documents and payment are only unlocked after a Manager allocates a vessel.
*   **High-Fidelity Tracking**: Real-time journey timeline from "Booking Confirmed" to "Delivered," showing all intermediate port stops.
*   **Receipt System**: Instant PDF-ready receipt generation upon successful payment.

### 2. Company Manager Dashboard
*   **Ship Allocation**: Review booking requests and assign them to available vessels based on proximity and capacity.
*   **Voyage Path Management**: Define complex, multi-stop routes (e.g., USA → Dubai → Chennai → Kolkata).
*   **Cargo Management**: Set specific unloading/drop ports per shipment.
*   **AIS Simulation**: A "Mark Vessel at Stop" tool that moves the ship along its route, instantly updating tracking for all associated customers.

### 3. System Admin Dashboard
*   **Global Fleet View**: A live interactive map (Leaflet.js) showing the real-time position of all active vessels in the fleet.
*   **User & Company Governance**: Manage account statuses (Approved, Verified, Blocked) and role permissions.
*   **Port & Route Management**: Define global shipping lanes and manage port terminal congestion/costs.
*   **Platform Analytics**: Multi-dimensional charts (Chart.js) showing revenue, volume, and role distributions.

---

## 🏗️ Technology Stack

*   **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Modern Glassmorphism Design).
*   **Mapping**: Leaflet.js (Custom Dark-themed Tiles).
*   **Analytics**: Chart.js.
*   **Real-time**: Socket.IO (Dynamic updates & broadcast signals).
*   **Backend**: Node.js, Express.
*   **Database**: PostgreSQL (Relational schema for voyages, shipments, and users).
*   **File Storage**: Cloudinary (Secure document uploads).
*   **Payments**: Razorpay/Stripe Integration (Simulated in Dev).

---

## 🔄 Recent Major Changes (Changelog)

### v3.0 Core Workflow (Project Highlights)
*   **Dynamic Multi-user Real-time Sync**: Re-engineered all dashboards to support simultaneous user sessions. Changes made by a manager (like allocating a ship) now trigger **instant screen refreshes** for the customer without a page reload.
*   **Advanced Voyage Routing**: Shifted from simple Source-to-Dest tracking to a multi-stop stopover model.
*   **Vessel Movement Engine**: Added a background server process (AIS Simulation) that automatically moves ships "In Transit" towards their next port stop every few minutes.
*   **Global Tracking Bridge**: Unified the tracking API (`api/v3/tracking/live/:id`) to provide high-fidelity coordinate and timeline data for all roles.
*   **Operational Pinning**: Added the ability for managers to manually "pin" a vessel at a stop, forcing global location updates for all shipments on that vessel.
*   **Doc/Payment Lock**: Implemented strict validation where users cannot upload sensitive shipping documents or pay until their booking is officially accepted and vessel-allocated.
*   **Admin Fleet Map**: Added a unified ship tracking view on the Admin panel.
