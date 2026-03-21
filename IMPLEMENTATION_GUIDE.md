# 🛠️ Smart Shipping Implementation & Architecture Guide
## For Developers - Technical Deep Dive

**Version:** 3.1  
**Technology Stack:** Node.js, Express, PostgreSQL, Socket.io, Razorpay, Leaflet.js  
**Last Updated:** March 2026

---

## 📦 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (HTML/JS/CSS)                      │
├─────────────────────────────────────────────────────────────────────┤
│  Customer Layer:          │  Manager Layer:       │  Admin Layer:   │
│  • wizard.html            │  • company-dash.html  │  • admin-dash.html
│  • shipments.html         │  • vehicles.html      │  • analytics.html
│  • track.html             │  • documents.html     │  • settings.html
│  • documents.html         │  • finance.html       │                 │
│  • profile.html           │  • schedules.html     │  Admin Utilities |
│  • notifications.html     │  • support.html       │  • logs          │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
↓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Socket.io (Real-Time) ━━━━━━━━━━━━━━━┓
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND API (Node.js + Express)                  │
├─────────────────────────────────────────────────────────────────────┤
│  v3-workflow-routes.js        Processing Engine        Other Services
│  ├─ /api/v3/shipment/*        ├─ costEngine.js         ├─ finance.js
│  ├─ /api/v3/manager/*         ├─ journey.js            ├─ documents.js
│  ├─ /api/v3/tracking/*        ├─ quote.js              ├─ customs.js
│  ├─ /api/v3/payment/*         └─ packingList.js        ├─ notifications.js
│  ├─ /api/documents/*                                   ├─ support.js
│  ├─ /api/company/*                                     └─ shipment.js
│  └─ /api/admin/*
│
│  Middleware: auth.js (JWT verification)
│  Socket Handlers: Real-time updates to clients
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA LAYER (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────────┤
│  Tables:                                                            │
│  • users (id, email, role, password_hash, created_at)             │
│  • shipments (id, customer_id, status, allocated_ship_id, ...)    │
│  • ships (id, name, capacity, current_port, route_id, ...)        │
│  • documents (id, shipment_id, type, url, status, ...)            │
│  • payments (id, shipment_id, amount, status, transaction_id)     │
│  • shipment_tracking (id, shipment_id, status, lat, lng, port)    │
│  • notifications (id, user_id, shipment_id, message, read)        │
│  • routes (id, ship_id, stops [], total_distance, eta)            │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                               │
├─────────────────────────────────────────────────────────────────────┤
│  • Cloudinary (Document CDN)                                       │
│  • Razorpay (Payment Processing)                                   │
│  • Leaflet.js + OpenStreetMap (Map Display)                       │
│  • jsPDF (Receipt Generation)                                      │
│  • PHPMailer / SMTP (Email Notifications)                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Core Workflow Logic

### **1. Shipment Creation (Customer)**

**File:** `wizard.html`, `v3-workflow-routes.js`

```javascript
// Step 1: Frontend collects data
const bookingData = {
  tradeType: 'Export',                        // Export or Import
  sourcePort: 'Mumbai Port',                  // lat: 19.0176, lng: 72.8479
  destinationPort: 'Kolkata Port',            // lat: 22.5726, lng: 88.3639
  productType: 'Electronics',
  weightKg: 500,
  volumeCbm: 10,
  billingAddress: '123 Business St, Mumbai'
};

// Step 2: Send to backend
POST /api/v3/shipment/create
Headers: { Authorization: 'Bearer <customer_token>' }
Body: bookingData

// Step 3: Backend validation
- Check user exists and is customer
- Validate ports exist in database
- Validate weight/volume > 0
- Calculate estimated cost
- Create record in DB:
  {
    id: 123,
    customer_id: 45,
    source_port: 'Mumbai Port',
    destination_port: 'Kolkata Port',
    status: 'Pending Manager Approval',  ← CRITICAL: LOCKED STATE
    allocated_ship_id: NULL,
    weight_kg: 500,
    volume_cbm: 10,
    estimated_cost: 50000,
    created_at: NOW(),
    documents_uploaded: false,
    payment_done: false
  }

// Step 4: Broadcast to managers
io.emit('shipment:new', {
  shipmentId: 123,
  customer: 'John Doe',
  cargo: 'Electronics',
  weight: 500,
  origin: 'Mumbai Port',
  destination: 'Kolkata Port'
});

// Step 5: Return to frontend
Response: {
  success: true,
  shipmentId: 123,
  status: 'Pending Manager Approval'
}
```

---

### **2. Gating Logic - Document Upload**

**File:** `documents.js`, `v3-workflow-routes.js`

```javascript
// THE CRITICAL GATE: Before documents can be uploaded, 
// shipment MUST be allocated to a ship

// Frontend: Before allocation
document button state = DISABLED ❌
tooltip = "Wait for manager to allocate vessel"
icon = 🔒 Lock

// When user tries to click (JavaScript prevents):
if (shipment.status === 'Pending Manager Approval') {
  button.disabled = true;
  button.style.opacity = '0.5';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('🔒 Locked: Manager must allocate vessel first');
  });
}

// ==========================================
// BACKEND: Validate before uploading doc
// ==========================================

POST /api/documents/upload
Body: FormData { shipmentId: 123, file: <PDF>, docType: 'invoice' }

// Step 1: Authentication
if (!token || !user) {
  return 403 Forbidden;
}

// Step 2: Fetch shipment
const shipment = await db.query(
  'SELECT * FROM shipments WHERE id = ? AND customer_id = ?',
  [shipmentId, user.id]
);

if (!shipment) {
  return 404 Not Found;
}

// Step 3: CHECK GATE ← THIS IS THE KEY LOGIC
const allowedStatuses = [
  'Ship Allocated',
  'Documents Pending',
  'Payment Pending',
  'Cargo Ready',
  'Accepted',
  'In Transit',
  'Customs',
  'Out for Delivery',
  'Delivered'
];

if (!allowedStatuses.includes(shipment.status)) {
  return 400 Bad Request {
    error: 'Cannot upload documents',
    reason: `Shipment status is "${shipment.status}". ` +
           'Wait for manager to allocate vessel.',
    currentStatus: shipment.status,
    requiredStatus: 'Ship Allocated or later'
  };
}

// Step 4: Upload document
const uploadResult = await cloudinary.upload(file);

// Step 5: Save to database
await db.query(
  'INSERT INTO documents (shipment_id, type, url, status) VALUES (?, ?, ?, ?)',
  [shipmentId, docType, uploadResult.secure_url, 'Pending Review']
);

// Step 6: Update shipment status if first doc
if (shipment.status === 'Ship Allocated') {
  await db.query(
    'UPDATE shipments SET status = ? WHERE id = ?',
    ['Documents Pending', shipmentId]
  );
}

// Step 7: Notify manager
io.emit('shipment:document-uploaded', {
  shipmentId: 123,
  documentType: 'invoice',
  uploadedAt: NOW()
});

return { success: true, documentId: 456 };
```

---

### **3. Gating Logic - Payment**

**File:** `finance.js`, `v3-workflow-routes.js`

```javascript
// ==========================================
// PAYMENT GATE: Similar to documents
// ==========================================

// Frontend: Before allocation
pay button state = DISABLED ❌
icon = 🔒 Lock icon + RED warning

// ==========================================
// BACKEND: Razorpay integration
// ==========================================

POST /api/v3/payment/create
Body: { shipmentId: 123, amount: 50000, currency: 'INR' }

// Step 1: Fetch shipment
const shipment = await db.query(
  'SELECT * FROM shipments WHERE id = ? AND customer_id = ?',
  [shipmentId, user.id]
);

// Step 2: CHECK PAYMENT GATE
const paymentAllowedStatuses = [
  'Ship Allocated',
  'Documents Pending',
  'Payment Pending'
];

if (!paymentAllowedStatuses.includes(shipment.status)) {
  return 400 {
    error: 'Cannot make payment at this stage',
    currentStatus: shipment.status
  };
}

// Step 3: Check if payment already done
if (shipment.payment_done === true && shipment.status === 'Cargo Ready') {
  return 400 {
    error: 'Payment already completed for this shipment'
  };
}

// Step 4: Create Razorpay order
const razorpayOrder = await razorpay.orders.create({
  amount: 50000 * 100,  // Convert to paise
  currency: 'INR',
  receipt: `receipt_${shipmentId}`,
  notes: { shipmentId: 123, customerId: user.id }
});

// Step 5: Save to database
const payment = await db.query(
  'INSERT INTO payments (shipment_id, amount, razorpay_order_id, status) VALUES (?, ?, ?, ?)',
  [shipmentId, 50000, razorpayOrder.id, 'Pending']
);

return {
  success: true,
  razorpayOrderId: razorpayOrder.id,
  amount: 50000,
  currency: 'INR',
  key: process.env.RAZORPAY_KEY_ID
};

// ==========================================
// FRONTEND: Razorpay modal
// ==========================================

const options = {
  key: response.key,
  order_id: response.razorpayOrderId,
  amount: response.amount,
  currency: response.currency,
  handler: function(response) {
    // Payment successful
    const paymentData = {
      orderId: response.razorpay_order_id,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature
    };
    
    // Verify and confirm
    POST /api/v3/payment/verify
    Body: paymentData
  }
};

// ==========================================
// BACKEND: Verify payment signature
// ==========================================

POST /api/v3/payment/verify
Body: { orderId, paymentId, signature }

// Step 1: Verify signature (Razorpay security)
const crypto = require('crypto');
const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET);
hmac.update(orderId + '|' + paymentId);
const generated_signature = hmac.digest('hex');

if (signature !== generated_signature) {
  return 400 { error: 'Payment verification failed' };
}

// Step 2: Update payment record
await db.query(
  'UPDATE payments SET status = ?, razorpay_payment_id = ? WHERE razorpay_order_id = ?',
  ['Successful', paymentId, orderId]
);

// Step 3: Update shipment status
await db.query(
  'UPDATE shipments SET status = ?, payment_done = true WHERE id = ?',
  ['Cargo Ready', shipmentId]
);

// Step 4: Create receipt (jsPDF)
const receiptPDF = generateReceipt({
  shipmentId: 123,
  customerId: user.id,
  amount: 50000,
  paymentId: paymentId,
  timestamp: NOW()
});

// Step 5: Broadcast success
io.emit(`shipment:${shipmentId}:payment-complete`, {
  status: 'Payment successful',
  timestamp: NOW()
});

return { success: true, receiptPDF: receiptPDF };
```

---

### **4. Manager Allocation (The Unlock Trigger)**

**File:** `v3-workflow-routes.js`, `company-dashboard.html`

```javascript
// ==========================================
// MANAGER: Allocate ship to shipment
// THIS IS THE KEY ACTION THAT UNLOCKS GATES
// ==========================================

POST /api/v3/manager/allocate-ship
Headers: { Authorization: 'Bearer <manager_token>' }
Body: {
  shipmentId: 123,
  shipId: 5,
  cargoDropPort: 'Kolkata Port'
}

// Step 1: Verify manager role
if (user.role !== 'company_manager') {
  return 403 Forbidden;
}

// Step 2: Fetch shipment (must be in pending state)
const shipment = await db.query(
  'SELECT * FROM shipments WHERE id = ? AND status = ?',
  [shipmentId, 'Pending Manager Approval']
);

if (!shipment) {
  return 404 {
    error: 'Shipment not found or already allocated'
  };
}

// Step 3: Fetch ship (verify capacity & route)
const ship = await db.query(
  'SELECT * FROM ships WHERE id = ?',
  [shipId]
);

if (!ship) {
  return 404 { error: 'Ship not found' };
}

if (ship.current_capacity < shipment.weight_kg) {
  return 400 {
    error: 'Insufficient ship capacity',
    required: shipment.weight_kg,
    available: ship.current_capacity
  };
}

// Step 4: Validate route matches
const sourceLatLng = getPortCoordinates(shipment.sourcePort);
const destLatLng = getPortCoordinates(cargoDropPort);

if (!isValidRoute(ship, sourceLatLng, destLatLng)) {
  return 400 {
    error: 'Ship route does not match cargo route'
  };
}

// Step 5: UPDATE SHIPMENT ← THIS UNLOCKS THE GATES
await db.query(
  'UPDATE shipments SET allocated_ship_id = ?, status = ?, cargo_drop_port = ? WHERE id = ?',
  [shipId, 'Ship Allocated', cargoDropPort, shipmentId]
);

// Step 6: Update ship capacity
await db.query(
  'UPDATE ships SET current_capacity = current_capacity - ? WHERE id = ?',
  [shipment.weight_kg, shipId]
);

// Step 7: Broadcast to customer (Socket.io) ← REAL-TIME UPDATE
io.emit(`shipment:${shipmentId}:allocated`, {
  shipmentId: 123,
  shipName: 'MV Maersk Gulsun',
  status: 'Ship Allocated',
  message: '🎉 Your shipment has been allocated to a vessel!'
});

// Step 8: Create notification
await db.query(
  'INSERT INTO notifications (user_id, shipment_id, message) VALUES (?, ?, ?)',
  [shipment.customer_id, shipmentId, 'Your ship has been allocated!']
);

return {
  success: true,
  message: 'Ship allocated successfully',
  shipmentId: 123,
  shipName: 'MV Maersk Gulsun',
  newStatus: 'Ship Allocated'
};

// ==========================================
// FRONTEND: Customer receives update (Socket.io)
// ==========================================

socket.on(`shipment:${shipmentId}:allocated`, (data) => {
  // Update UI
  shipmentCard.style.borderColor = '#4CAF50';  // Green
  statusBadge.textContent = 'Ship Allocated';
  statusBadge.style.backgroundColor = '#4CAF50';
  
  // Unlock buttons
  uploadDocButton.disabled = false;
  uploadDocButton.style.opacity = '1';
  payNowButton.disabled = false;
  payNowButton.style.opacity = '1';
  
  // Show notification
  showToast('🎉 Manager allocated vessel ' + data.shipName);
  
  // Play sound
  playNotificationSound();
});
```

---

### **5. Tracking System**

**File:** `tracking.js`, `track.html`, `shipment.js`

```javascript
// ==========================================
// LIVE TRACKING: Multi-stop route display
// ==========================================

GET /api/v3/tracking/live/:shipmentId

// Step 1: Fetch shipment
const shipment = await db.query(
  'SELECT * FROM shipments WHERE id = ?',
  [shipmentId]
);

// Step 2: Fetch allocated ship
const ship = await db.query(
  'SELECT * FROM ships WHERE id = ?',
  [shipment.allocated_ship_id]
);

// Step 3: Fetch route stops (multi-stop)
const route = await db.query(
  'SELECT stops FROM routes WHERE ship_id = ?',
  [ship.id]
);

// Example stops:
// [
//   { port: 'Mumbai', lat: 19.0176, lng: 72.8479, eta: '2026-03-19 18:00', status: 'Completed' },
//   { port: 'Chennai', lat: 13.1939, lng: 80.1288, eta: '2026-03-20 14:00', status: 'Current' },
//   { port: 'Kolkata', lat: 22.5726, lng: 88.3639, eta: '2026-03-21 10:00', status: 'Pending' }
// ]

// Step 4: Create tracking timeline
const timeline = [
  { status: 'Booking Confirmed', timestamp: shipment.created_at, completed: true },
  { status: 'Ship Allocated', timestamp: shipment.allocated_at, completed: true },
  { status: 'Documents Verified', timestamp: shipment.documents_verified_at, completed: true },
  { status: 'Payment Completed', timestamp: shipment.payment_completed_at, completed: true },
  { status: 'Cargo Loaded', timestamp: shipment.cargo_loaded_at, completed: true },
  { status: 'In Transit', timestamp: shipment.departure_time, completed: shipment.status === 'In Transit' },
  { status: 'At Chennai Port', timestamp: null, completed: false },
  { status: 'Customs Clearance', timestamp: null, completed: false },
  { status: 'Out for Delivery', timestamp: null, completed: false },
  { status: 'Delivered', timestamp: null, completed: false }
];

// Step 5: Calculate progress
const completedSteps = timeline.filter(t => t.completed).length;
const totalSteps = timeline.length;
const progressPercent = (completedSteps / totalSteps) * 100;  // e.g., 50%

// Step 6: Get current location
const currentStop = route.stops.find(s => s.status === 'Current') || route.stops[0];

return {
  success: true,
  tracking: {
    shipmentId: 123,
    status: shipment.status,
    currentPort: currentStop.port,
    currentLat: currentStop.lat,
    currentLng: currentStop.lng,
    destPort: shipment.destination_port,
    destLat: 22.5726,
    destLng: 88.3639,
    progressPercent: 50,
    nextStop: 'Chennai - ETA 2026-03-20 14:00',
    timeline: timeline,
    stops: route.stops,
    lastUpdated: NOW()
  }
};

// ==========================================
// FRONTEND: Render map + timeline
// ==========================================

// 1. Initialize Leaflet map
const map = L.map('tracking-map').setView([19.0176, 72.8479], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 2. Draw route polyline
const routeCoordinates = data.stops.map(s => [s.lat, s.lng]);
const polyline = L.polyline(routeCoordinates, {
  color: '#2196F3',
  weight: 2,
  opacity: 0.7,
  dashArray: '5, 5'
}).addTo(map);

// 3. Add port markers
data.stops.forEach((stop, idx) => {
  const marker = L.marker([stop.lat, stop.lng], {
    title: stop.port
  });
  
  const html = `
    <strong>${idx + 1}. ${stop.port}</strong><br>
    Status: ${stop.status}<br>
    ETA: ${stop.eta}
  `;
  
  marker.bindPopup(html).addTo(map);
});

// 4. Add ship icon at current position
const shipIcon = L.icon({
  iconUrl: 'ship-icon.png',
  iconSize: [32, 32]
});

const shipMarker = L.marker(
  [data.currentLat, data.currentLng],
  { icon: shipIcon, title: 'Current Position' }
).addTo(map);

// 5. Render timeline HTML
const timelineHTML = data.timeline.map(item => {
  const checkmark = item.completed ? '✅' : '○';
  const className = item.completed ? 'completed' : 'pending';
  
  return `
    <div class="timeline-item ${className}">
      <div class="timeline-point">${checkmark}</div>
      <div class="timeline-content">
        <h4>${item.status}</h4>
        <p>${item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Pending'}</p>
      </div>
    </div>
  `;
}).join('');

document.getElementById('timeline').innerHTML = timelineHTML;

// 6. Update progress bar
const progressBar = document.querySelector('.progress-bar');
progressBar.style.width = data.progressPercent + '%';
document.querySelector('.progress-percent').textContent = Math.round(data.progressPercent) + '%';

// 7. Auto-refresh every 60 seconds
setInterval(() => {
  fetch(`/api/v3/tracking/live/${data.shipmentId}`)
    .then(r => r.json())
    .then(updatedData => {
      // Update map position
      shipMarker.setLatLng([updatedData.tracking.currentLat, updatedData.tracking.currentLng]);
      
      // Update UI
      refreshTrackingUI(updatedData);
    });
}, 60000);
```

---

### **6. Multi-Stop Route Management**

**File:** `vehicles.html`, `journey.js`

```javascript
// ==========================================
// MANAGER: Define multi-stop route for ship
// ==========================================

POST /api/v3/manager/ship/:shipId/route
Body: {
  stops: [
    { port: 'Mumbai', lat: 19.0176, lng: 72.8479 },
    { port: 'Chennai', lat: 13.1939, lng: 80.1288 },
    { port: 'Kolkata', lat: 22.5726, lng: 88.3639 }
  ]
}

// Calculate distances between stops using Haversine formula
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Create route
const route = {
  id: generateUUID(),
  ship_id: shipId,
  stops: [
    {
      port: 'Mumbai',
      lat: 19.0176,
      lng: 72.8479,
      distance_from_prev: 0,
      eta: '2026-03-19 18:00',
      status: 'Completed'
    },
    {
      port: 'Chennai',
      lat: 13.1939,
      lng: 80.1288,
      distance_from_prev: calculateDistance(19.0176, 72.8479, 13.1939, 80.1288),
      eta: '2026-03-20 14:00',
      status: 'Current'
    },
    {
      port: 'Kolkata',
      lat: 22.5726,
      lng: 88.3639,
      distance_from_prev: calculateDistance(13.1939, 80.1288, 22.5726, 88.3639),
      eta: '2026-03-21 10:00',
      status: 'Pending'
    }
  ],
  total_distance: 1234,  // km
  total_duration: 64,    // hours
  created_at: NOW()
};

// Save to database
await db.query(
  'INSERT INTO routes (ship_id, stops, total_distance) VALUES (?, ?, ?)',
  [shipId, JSON.stringify(route.stops), route.total_distance]
);

return { success: true, route: route };

// ==========================================
// PIN SHIP AT PORT (Manager updates location)
// ==========================================

POST /api/v3/manager/ship/:shipId/pin-port
Body: { portName: 'Chennai', lat: 13.1939, lng: 80.1288 }

// Update ship current location
await db.query(
  'UPDATE ships SET current_port = ?, current_lat = ?, current_lng = ? WHERE id = ?',
  [portName, 13.1939, 80.1288, shipId]
);

// Update all shipments on this ship
const shipmentsOnShip = await db.query(
  'SELECT id FROM shipments WHERE allocated_ship_id = ?',
  [shipId]
);

// Broadcast location update to all customers with cargo on this ship
shipmentsOnShip.forEach(shipment => {
  io.emit(`shipment:${shipment.id}:location-update`, {
    currentPort: portName,
    currentLat: 13.1939,
    currentLng: 80.1288,
    timestamp: NOW()
  });
});

return { success: true, message: 'Ship pinned at ' + portName };
```

---

## 🗄️ Database Schema

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'company_manager', 'admin') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  source_port VARCHAR(255) NOT NULL,
  destination_port VARCHAR(255) NOT NULL,
  status ENUM('Pending Manager Approval', 'Ship Allocated', 'Documents Pending', 
              'Payment Pending', 'Cargo Ready', 'Accepted', 'In Transit', 
              'Customs', 'Out for Delivery', 'Delivered') DEFAULT 'Pending Manager Approval',
  allocated_ship_id INT,
  product_type VARCHAR(255),
  weight_kg DECIMAL(10, 2),
  volume_cbm DECIMAL(10, 2),
  estimated_cost DECIMAL(15, 2),
  documents_uploaded BOOLEAN DEFAULT FALSE,
  payment_done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (allocated_ship_id) REFERENCES ships(id),
  INDEX idx_status (status),
  INDEX idx_customer (customer_id)
);

CREATE TABLE ships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  total_capacity DECIMAL(10, 2),
  current_capacity DECIMAL(10, 2),
  current_port VARCHAR(255),
  current_lat DECIMAL(10, 6),
  current_lng DECIMAL(10, 6),
  status ENUM('Available', 'In Transit', 'Maintenance') DEFAULT 'Available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  type ENUM('invoice', 'packing_list', 'customs', 'bill_of_lading') NOT NULL,
  url VARCHAR(500) NOT NULL,
  status ENUM('Pending Review', 'Approved', 'Rejected') DEFAULT 'Pending Review',
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id),
  INDEX idx_shipment (shipment_id)
);

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  amount DECIMAL(15, 2),
  currency VARCHAR(3),
  status ENUM('Pending', 'Successful', 'Failed') DEFAULT 'Pending',
  razorpay_order_id VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id),
  INDEX idx_shipment (shipment_id)
);

CREATE TABLE shipment_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  status VARCHAR(100),
  port VARCHAR(255),
  lat DECIMAL(10, 6),
  lng DECIMAL(10, 6),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

CREATE TABLE routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ship_id INT NOT NULL,
  stops JSON NOT NULL,
  total_distance DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ship_id) REFERENCES ships(id)
);

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shipment_id INT,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 🔄 Socket.io Events

| Event | Direction | Triggered By | Receivers |
|-------|-----------|--------------|-----------|
| `shipment:new` | Manager ← Backend | Customer creates booking | All managers |
| `shipment:allocated` | Customer ← Backend | Manager allocates ship | Customer |
| `shipment:document-uploaded` | Manager ← Backend | Customer uploads doc | Managers |
| `shipment:document-approved` | Customer ← Backend | Manager approves doc | Customer |
| `shipment:payment-complete` | Manager ← Backend | Customer pays | Managers |
| `shipment:status-update` | Customer ← Backend | Manager updates status | Customer |
| `ship:location-update` | Customer ← Backend | Manager pins port | All customers with cargo on ship |
| `notification:new` | User ← Backend | Any event | User |

---

## 📊 Performance Optimization

1. **Database Indexing:**
   - Index on `shipments.status` (frequently filtered)
   - Index on `shipments.customer_id` (frequent queries)
   - Index on `shipments.allocated_ship_id` (JOINs)

2. **Query Optimization:**
   - Use SELECT specific columns, not SELECT *
   - Pre-calculate costs and distances (don't compute every request)
   - Cache port coordinates in memory or Redis

3. **Socket.io Optimization:**
   - Use rooms: `io.to(`shipment:${id}`).emit()` instead of broadcast
   - Throttle location updates (max 1 per 5 seconds)
   - Disconnect idle connections after 30 minutes

4. **Frontend Optimization:**
   - Lazy-load maps (don't render large Leaflet.js until visible)
   - Debounce tracking refreshes (max 1 per 60 seconds)
   - Use service workers for offline support

---

## 🚀 Deployment Checklist

- [ ] Replace test Razorpay keys with production keys
- [ ] Set production database URL (RDS, Cloud SQL, etc.)
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure CORS for frontend domain
- [ ] Set up environment variables (.env)
- [ ] Enable database backups (daily)
- [ ] Set up monitoring/alerts (Sentry, DataDog)
- [ ] Configure rate limiting (prevent abuse)
- [ ] Enable logging (all requests to CloudWatch, ELK)
- [ ] Load test (simulate 1000+ concurrent users)

---

**© 2026 Smart Shipping Enterprise. All Rights Reserved.**
