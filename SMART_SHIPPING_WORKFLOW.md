# 🚢 Smart Shipping Web Application
## Professional Logistics Platform - Complete Workflow Guide

**Version:** 3.1 (Clean, Professional)  
**Status:** ✅ Production Ready  
**Last Updated:** March 2026

---

## 📋 Executive Summary

**Smart Shipping** is a professional-grade web application for managing international cargo logistics with **two distinct user roles** and a **strict workflow gating system** that ensures operational safety and cargo security.

### System Principles:
- ✅ **Clean & Professional:** Minimal UI, maximum clarity
- ✅ **Real Logistics Workflow:** Follows industry standards
- ✅ **Strict Gating Logic:** No document upload or payment before approval
- ✅ **Real-Time Tracking:** Live ship positions and status updates
- ✅ **Professional Design:** Glassmorphism, responsive, accessible

---

## 🎭 User Roles & Workflows

### **Role 1: CUSTOMER (User Dashboard)**

A customer is a person/company shipping cargo. They have a **simple, linear workflow**:

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: CREATE BOOKING (Wizard)                        │
│  ├─ Input: Source, Destination, Cargo Type, Weight     │
│  ├─ Status: "Pending Manager Approval" ← LOCKED STATE  │
│  └─ What's Blocked: ❌ Document Upload, ❌ Payment      │
├─────────────────────────────────────────────────────────┤
│  [WAIT FOR MANAGER...]                                  │
│  Manager checks ship capacity and allocates vessel      │
│  → Status changes to: "Ship Allocated"                  │
├─────────────────────────────────────────────────────────┤
│  STEP 2: UPLOAD DOCUMENTS ← NOW ENABLED                │
│  ├─ Invoice, Packing List, Customs Declaration         │
│  └─ Status: "Documents Pending"                         │
├─────────────────────────────────────────────────────────┤
│  STEP 3: MAKE PAYMENT ← NOW ENABLED                    │
│  ├─ Payment Gateway: Razorpay/Stripe                   │
│  ├─ Receipt: Auto-generated PDF                         │
│  └─ Status: "Cargo Ready"                               │
├─────────────────────────────────────────────────────────┤
│  STEP 4: TRACK JOURNEY                                  │
│  ├─ Real-time ship location                             │
│  ├─ Status timeline                                     │
│  ├─ Multi-stop port tracking                            │
│  └─ Delivery confirmation                               │
└─────────────────────────────────────────────────────────┘
```

**Key URLs:**
- **Booking:** `http://localhost:5500/wizard.html`
- **Dashboard:** `http://localhost:5500/shipments.html`
- **Tracking:** `http://localhost:5500/track.html?id=123`

---

### **Role 2: COMPANY MANAGER (Manager Dashboard)**

A manager works for a shipping company (carrier). They manage ships, allocate cargo, and oversee delivery.

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: VIEW BOOKING REQUESTS                          │
│  ├─ See all "Pending Manager Approval" shipments       │
│  ├─ View: Cargo type, weight, source, destination      │
│  └─ URL: http://localhost:5500/company-dashboard.html  │
├─────────────────────────────────────────────────────────┤
│  STEP 2: SELECT & ALLOCATE SHIP                         │
│  ├─ Choose vessel with appropriate capacity            │
│  ├─ Match route: origin port → destination port        │
│  ├─ Check availability                                  │
│  └─ Action: Click "Accept" → Opens ship selector       │
├─────────────────────────────────────────────────────────┤
│  STEP 3: CONFIRM ALLOCATION                            │
│  ├─ Shipment Status → "Ship Allocated"                 │
│  ├─ Customer gets notification                          │
│  ├─ Document & Payment gates UNLOCK                     │
│  └─ Action: System auto-emails customer                │
├─────────────────────────────────────────────────────────┤
│  STEP 4: REVIEW DOCUMENTS                               │
│  ├─ Wait for customer to upload docs                    │
│  ├─ Verify: Customs, Invoice, Packing List             │
│  ├─ Status: "Document Pending" → "Document Verified"   │
│  └─ Action: Click "Approve" or "Reject"                │
├─────────────────────────────────────────────────────────┤
│  STEP 5: CONFIRM SHIPMENT                               │
│  ├─ Wait for payment completion                         │
│  ├─ Status: "Cargo Ready"                               │
│  └─ Action: Click "Confirm" to proceed                  │
├─────────────────────────────────────────────────────────┤
│  STEP 6: MANAGE DELIVERY                                │
│  ├─ Update Status: Loaded → In Transit → Delivered     │
│  ├─ Real-time tracking (multi-stop ports)              │
│  ├─ Pin vessel at ports (Updates customer tracking)    │
│  └─ Mark "Delivered" when complete                      │
└─────────────────────────────────────────────────────────┘
```

**Key URLs:**
- **Manager Dashboard:** `http://localhost:5500/company-dashboard.html`
- **Fleet Management:** `http://localhost:5500/vehicles.html`
- **Admin Panel:** `http://localhost:5500/admin-dashboard.html`

---

## 🔐 CRITICAL GATING LOGIC

### **This is the Core of Professional Logistics:**

#### **GATE 1: Document Upload**
```javascript
// ✅ Allowed ONLY if shipment.status IN:
['Ship Allocated', 'Documents Pending', 'Payment Pending', 'Cargo Ready', 
 'Accepted', 'In Transit', 'Customs', 'Out for Delivery', 'Delivered']

// ❌ BLOCKED if:
shipment.status = 'Pending Manager Approval'
```

**User Experience:** 
- Before Allocation: "Upload documents" button is DISABLED + tooltip explains "Waiting for manager to allocate vessel"
- After Allocation: Button becomes ENABLED

#### **GATE 2: Payment**
```javascript
// ✅ Allowed ONLY if shipment.status IN:
['Ship Allocated', 'Documents Pending', 'Payment Pending']

// ❌ BLOCKED if:
shipment.status = 'Pending Manager Approval'
shipment.status = 'Cargo Ready' (Payment already made)
```

**User Experience:**
- Before Allocation: "Pay Now" button is DISABLED + red lock icon
- After Allocation: Button becomes ENABLED
- After Payment: Button changes to "Download Receipt"

#### **GATE 3: Ship Allocation**
```javascript
// Only managers can allocate ships
// A shipment can only be allocated to ONE ship
// Shipment must be in "Pending Manager Approval" state
// Ship must have capacity >= cargo weight
// Ship route must match source → destination
```

---

## 📊 Status Lifecycle

Every shipment progresses through these states:

```
┌─────────────────────────────┐
│ Pending Manager Approval    │ ← Customer creates booking (LOCKED)
└──────────────┬──────────────┘
               │ Manager allocates ship
               ▼
┌─────────────────────────────┐
│ Ship Allocated              │ ← Documents & Payment UNLOCKED
└──────────────┬──────────────┘
               │ Customer uploads documents
               ▼
┌─────────────────────────────┐
│ Documents Pending           │ ← Manager reviews documents
└──────────────┬──────────────┘
               │ Manager approves documents
               ▼
┌─────────────────────────────┐
│ Payment Pending             │ ← Customer makes payment
└──────────────┬──────────────┘
               │ Payment completed
               ▼
┌─────────────────────────────┐
│ Cargo Ready                 │ ← Ready for shipment
└──────────────┬──────────────┘
               │ Manager confirms & loads cargo
               ▼
┌─────────────────────────────┐
│ Accepted / In Transit       │ ← On its way
└──────────────┬──────────────┘
               │ Reaches ports, passes customs
               ▼
┌─────────────────────────────┐
│ Out for Delivery           │ ← Last mile
└──────────────┬──────────────┘
               │ Delivered
               ▼
┌─────────────────────────────┐
│ Delivered                   │ ← Complete ✓
└─────────────────────────────┘
```

---

## 🔄 Complete System Workflow (Step-by-Step)

### **SCENARIO: Customer Books, Manager Allocates, Customer Pays**

#### **Customer Side**

**Step 1: Customer Logs In**
```
Go to: http://localhost:5500/auth.html
- Email: customer@example.com
- Password: (signup or login)
Landing: http://localhost:5500/shipments.html (Dashboard)
```

**Step 2: Create New Shipment**
```
Dashboard → Click "New Booking" button
Opens: http://localhost:5500/wizard.html (5-Step Wizard)

WIZARD STEPS:
1. Trade Type: Select "Export" or "Import"
2. Route: Enter source port (e.g., "Mumbai") and destination (e.g., "Kolkata")
3. Cargo: Select type (Electronics, Textiles, etc.), enter weight (kg), volume (m³)
4. Details: Billing address, preferred date
5. Review: Confirm details

Result: New shipment created with status = "Pending Manager Approval"
Dashboard updates showing this new shipment in orange/warning color
```

**Step 3: Try to Upload Documents (BEFORE Allocation) - BLOCKED**
```
Dashboard → Click on shipment → "Upload Documents" button
Result: ⛔ Button DISABLED with tooltip:
"Waiting for manager to allocate vessel before uploading documents"

Icon: 🔒 Lock icon shows it's blocked
```

**Step 4: Try to Make Payment (BEFORE Allocation) - BLOCKED**
```
Dashboard → Click on shipment → "Pay Now" button
Result: ⛔ Button DISABLED with tooltip:
"Payment locked: Waiting for manager approval"

Icon: 🔒 Lock icon + red warning
```

#### **Manager Side (Same Time)**

**Step 1: Manager Logs In**
```
Go to: http://localhost:5500/auth.html
- Email: manager@company.com (company role)
Landing: http://localhost:5500/company-dashboard.html
```

**Step 2: View Booking Requests**
```
Dashboard → Section: "Booking Requests"
Shows: List of all "Pending Manager Approval" shipments
Columns: ID | Origin | Destination | Cargo Type | Weight | Status

The customer's booking appears here in a table with button: "Accept"
```

**Step 3: Review Cargo & Select Ship**
```
Manager clicks: "Accept" button on the customer's booking

Modal opens: "Accept Shipment"
Shows:
- Cargo details: "Electronics, 500 kg, 10 m³"
- Source: Mumbai Port (Lat: 19.0176, Lng: 72.8479)
- Destination: Kolkata Port (Lat: 22.5726, Lng: 88.3639)

Dropdown: "Select a Ship"
- Auto-filters ships by:
  ✓ Capacity >= 500 kg
  ✓ Source port matches (Mumbai)
  ✓ Status = "Available"

Available ships appear:
  • MV Maersk Gulsun (5000 kg capacity) ← Click to select
  • MV Ocean Express (8000 kg capacity)
```

**Step 4: Manager Allocates Ship**
```
Manager selects: "MV Maersk Gulsun"
Destination port auto-populates: "Kolkata" (matches destination)

Manager clicks: "Confirm Allocation"

System:
1. Updates: shipment.allocated_ship_id = 5
2. Updates: shipment.status = "Ship Allocated"
3. Creates: Notification to customer
4. Broadcasts: Socket.io event to customer's dashboard

Result: ✅ "Ship allocated successfully!"
```

#### **Customer Side (After Allocation - REAL-TIME)**

**Step 5: Customer Sees Update (Real-Time)**
```
Customer's Dashboard refreshes automatically via Socket.io
Shipment card color changes: Orange → Green
Status updates: "Pending Manager Approval" → "Ship Allocated"

Now visible:
✅ "Upload Documents" button becomes ENABLED
✅ "Pay Now" button becomes ENABLED

Notification Toast: "🎉 Manager allocated vessel MV Maersk Gulsun!"
```

**Step 6: Customer Uploads Documents**
```
Dashboard → Click shipment → "Upload Documents" button ← NOW ENABLED

Modal: "Upload Shipping Documents"
Upload fields:
- Commercial Invoice (PDF)
- Packing List (PDF)
- Customs Declaration (PDF)
- Bill of Lading (PDF)

Customer selects invoice.pdf and clicks: "Upload"

Result:
✅ File uploaded to Cloudinary (secure storage)
✅ Status updates: "Ship Allocated" → "Documents Pending"
✅ Manager is notified
```

**Step 7: Manager Reviews Documents**
```
Manager Dashboard → Section: "Documents"
Shows: New document from customer
Manager clicks: "View" to check invoice content
Manager clicks: "Approve" 

Result:
✅ Document status: "Approved"
✅ Shipment status: "Documents Pending" → ready for payment
```

**Step 8: Customer Makes Payment**
```
Dashboard → Click shipment → "Pay Now" button ← NOW ENABLED

Modal: "Payment"
Shows:
- Estimated Cost: ₹50,000 (calculated from weight, distance)
- Currency: USD/INR
- Payment Method: Razorpay test mode

Customer enters card: 4111 1111 1111 1111 (test card)
Clicks: "Pay ₹50,000"

Razorpay processes payment...

After payment:
✅ Transaction created
✅ Status: "Payment Pending" → "Cargo Ready"
✅ Receipt generated (jsPDF - A4 format)

Toast: "✅ Payment successful! Receipt downloaded."
PDF opens with professional invoice showing:
- Booking ID
- Shipment details
- Cost breakdown
- Payment confirmation
- Transaction ID
```

#### **Manager Final Steps**

**Step 9: Manager Confirms Shipment**
```
Manager Dashboard → Shipment now shows: "Cargo Ready"
Manager reviews:
✓ Cargo details verified
✓ Documents approved
✓ Payment received

Manager clicks: "Confirm & Load Cargo"

Result:
✅ Status: "Cargo Ready" → "Accepted"
✅ Cargo is physically loaded onto ship
```

**Step 10: Manager Updates Transit Status**
```
Manager navigates to: Dashboard → "Shipments" tab
Shipment status selector allows:
- Accepted → In Transit (vessel departed)
- In Transit → Customs (reached port)
- Customs → Out for Delivery (cleared customs)
- Out for Delivery → Delivered (final)

Manager clicks: "In Transit"
Updates: vessel departed, tracking timeline starts for customer
```

#### **Customer Tracking**

**Step 11: Customer Tracks Shipment (Real-Time)**
```
Customer opens: http://localhost:5500/track.html?id=123

Displays:
┌─────────────────────────────────────────────────────┐
│ LIVE TRACKING                                       │
├─────────────────────────────────────────────────────┤
│ Shipment ID: SS-123                                │
│ Route: Mumbai → Kolkata                            │
│ Next Stop: Kolkata                                 │
│ Status: In Transit                                 │
│ Progress: ████████░░ 65%                           │
├─────────────────────────────────────────────────────┤
│ JOURNEY TIMELINE:                                  │
│ ✅ Booking Confirmed (March 19, 10:00)            │
│ ✅ Ship Allocated (March 19, 11:30)               │
│ ✅ Documents Verified (March 19, 14:00)           │
│ ✅ Cargo Loaded (March 19, 16:00)                 │
│ ⚡ In Transit (March 19, 18:00) ← CURRENT         │
│ ○ Customs Clearance (Est. March 20)               │
│ ○ Out for Delivery (Est. March 21)                │
│ ○ Delivered (Est. March 22)                       │
├─────────────────────────────────────────────────────┤
│ LIVE MAP (with Leaflet.js):                       │
│ - Blue ship icon at current location               │
│ - Dashed line showing route path                   │
│ - Port markers (1, 2, 3, ...)                      │
│ - Current latitude/longitude                       │
├─────────────────────────────────────────────────────┤
│ Last Updated: Just now (60s auto-refresh)         │
└─────────────────────────────────────────────────────┘
```

**Step 12: Customer Receives Delivery**
```
Manager updates status: "Out for Delivery" → "Delivered"
Customer receives:
✅ Real-time notification: "Your shipment delivered!"
✅ Tracking shows: ✅ Delivered (March 22, 10:30)
✅ Can now review/rate shipment
```

---

## 🔌 API Reference (For Developers)

### **Authentication**
```
POST /api/auth/login
Body: { email: "user@example.com", password: "123" }
Response: { success: true, token: "jwt..." }
```

### **Customer APIs**

#### Create Shipment
```
POST /api/v3/shipment/create
Auth: ✓ Customer token
Body: {
  source_port: "Mumbai",
  destination_port: "Kolkata",
  product_type: "Electronics",
  weight_kg: 500,
  volume_cbm: 10
}
Response: { 
  success: true,
  shipmentId: 123,
  status: "Pending Manager Approval"
}
```

#### Get Shipments
```
GET /api/shipment/list
Auth: ✓ Customer token
Response: {
  success: true,
  shipments: [
    {
      id: 123,
      status: "Ship Allocated",
      allocated_ship: "MV Maersk Gulsun",
      created_at: "2026-03-19T10:00:00Z"
    }
  ]
}
```

#### Upload Document
```
POST /api/documents/upload
Auth: ✓ Customer token
Body: FormData { shipmentId, file, docType }
Response: { success: true, documentId: 456 }
```

#### Make Payment
```
POST /api/v3/payment/create
Auth: ✓ Customer token
Body: {
  shipmentId: 123,
  amount: 50000,
  currency: "INR"
}
Response: { success: true, paymentId: 789 }
```

#### Get Tracking
```
GET /api/v3/tracking/live/:shipmentId
Auth: ✓ Customer token
Response: {
  success: true,
  tracking: {
    currentPort: "Mumbai",
    livePosition: { lat: 19.0176, lng: 72.8479 },
    routeStops: [...],
    status: "In Transit",
    timeline: [...]
  }
}
```

### **Manager APIs**

#### Get Booking Requests
```
GET /api/v3/manager/booking-requests
Auth: ✓ Manager token
Response: {
  success: true,
  bookings: [
    {
      shipmentId: 123,
      customer: "John Doe",
      cargo: "Electronics, 500 kg",
      origin: "Mumbai",
      destination: "Kolkata"
    }
  ]
}
```

#### Get Available Ships
```
GET /api/v3/manager/ships
Query: ?minCapacity=500&sourcePort=Mumbai&destPort=Kolkata
Response: {
  success: true,
  ships: [
    {
      id: 5,
      name: "MV Maersk Gulsun",
      capacity: 5000,
      status: "Available"
    }
  ]
}
```

#### Allocate Ship
```
POST /api/v3/manager/allocate-ship
Auth: ✓ Manager token
Body: {
  shipmentId: 123,
  shipId: 5,
  cargoDropPort: "Kolkata"
}
Response: { success: true, message: "Ship allocated" }
```

#### Approve Documents
```
POST /api/documents/:id/approve
Auth: ✓ Manager token
Response: { success: true, message: "Document approved" }
```

#### Update Status
```
PUT /api/v3/shipment/:id/status
Auth: ✓ Manager token
Body: { status: "In Transit" }
Response: { success: true }
```

---

## 🧪 Complete Testing Checklist

### **PHASE 1: CUSTOMER SETUP**
- [ ] Navigate to auth.html
- [ ] Create customer account (email: customer1@test.com)
- [ ] Login → confirms shipments.html loads
- [ ] Verify dashboard shows empty state

### **PHASE 2: CREATE BOOKING**
- [ ] Click "New Booking" → wizard.html opens
- [ ] Select "Export" → Next
- [ ] Enter Source: "Mumbai", Destination: "Kolkata" → Next
- [ ] Select cargo: "Electronics", Weight: "500kg", Volume: "10m³" → Next
- [ ] Enter billing details, select date → Next
- [ ] Review and submit → Booking created
- [ ] Dashboard shows new shipment with status: "Pending Manager Approval" (Orange)

### **PHASE 3: VERIFY GATING (Before Allocation)**
- [ ] Try clicking "Upload Documents" button
  - Expected: ⛔ Button DISABLED with lock icon + tooltip explaining wait
- [ ] Try clicking "Pay Now" button
  - Expected: ⛔ Button DISABLED with lock icon + payment blocked message

### **PHASE 4: MANAGER ALLOCATION**
- [ ] Open new tab/window for manager account (manager@company.com)
- [ ] Login → company-dashboard.html
- [ ] Go to "Booking Requests" section
- [ ] Verify customer's booking appears in list
- [ ] Click "Accept" button
- [ ] Modal: "Accept Shipment" appears showing cargo details
- [ ] Dropdown: "Select a Ship" shows filtered ships
  - Expected: Only ships with capacity >= 500kg, in Mumbai port
- [ ] Select "MV Maersk Gulsun"
- [ ] Destination auto-fills: "Kolkata"
- [ ] Click "Confirm Allocation"
- [ ] Success toast: "✅ Ship allocated!"

### **PHASE 5: VERIFY GATING UNLOCKED (After Allocation)**
- [ ] Return to customer's browser/tab
- [ ] Dashboard auto-updates (Socket.io):
  - [ ] Shipment card turns green
  - [ ] Status: "Pending Manager Approval" → "Ship Allocated"
  - [ ] Toast notification: "🎉 Manager allocated vessel..."
- [ ] Click "Upload Documents" button
  - Expected: ✅ Button NOW ENABLED, modal opens
- [ ] Click "Pay Now" button
  - Expected: ✅ Button NOW ENABLED, payment modal opens

### **PHASE 6: DOCUMENT UPLOAD**
- [ ] In document upload modal, drag-drop a PDF (or create a simple text file saved as .pdf)
- [ ] Click "Upload Documents"
- [ ] Success: "✅ Document uploaded"
- [ ] Shipment status: "Ship Allocated" → "Documents Pending"
- [ ] Manager dashboard refreshes, shows document for review

### **PHASE 7: PAYMENT**
- [ ] Click "Pay Now" button
- [ ] Payment modal opens showing: Amount, Currency, Payment Method
- [ ] Enter test card: 4111 1111 1111 1111
- [ ] Click "Pay"
- [ ] Razorpay modal appears, confirm payment
- [ ] Success: "✅ Payment complete"
- [ ] Receipt PDF downloads automatically (check browser downloads)
- [ ] Shipment status: "Documents Pending" → "Cargo Ready"

### **PHASE 8: TRACKING**
- [ ] Navigate to: http://localhost:5500/track.html?id=<shipmentId>
- [ ] Verify displays:
  - [ ] Shipment ID, Route (Mumbai → Kolkata)
  - [ ] Progress bar (should show 50-70%)
  - [ ] Timeline with statuses: ✅ Booking ✅ Ship Allocated ✅ Documents ✅ Payment ⚡ Ready
  - [ ] Map with:
    - [ ] Route lines connecting ports
    - [ ] Ship icon at Mumbai
    - [ ] Port markers (1, 2, 3)
  - [ ] "Next Destination: Kolkata"

### **PHASE 9: MULTI-STOP ROUTING (Advanced)**
- [ ] Go to manager Fleet dashboard (vehicles.html)
- [ ] Click "Route" button next to "MV Maersk Gulsun"
- [ ] Route modal shows current route (if any)
- [ ] Add stops:
  - [ ] Stop 1: Mumbai (existing)
  - [ ] Stop 2: Chennai
  - [ ] Stop 3: Kolkata
- [ ] Save route
- [ ] Go to tracking page
- [ ] Verify timeline now shows: Mumbai ✅ → Chennai ⚡ → Kolkata ○

### **PHASE 10: MANAGER FINAL WORKFLOW**
- [ ] Manager views shipment in dashboard
- [ ] Updates status: "Cargo Ready" → "In Transit"
- [ ] Customer tracking updates (real-time):
  - [ ] Status changes to "In Transit"
  - [ ] Toast notification
- [ ] Manager marks ship at port (if using multi-stop):
  - [ ] Click "Pin" button
  - [ ] Select "Chennai"
  - [ ] Ship positions updates on customer map
- [ ] Eventually update to "Delivered"
- [ ] Customer tracking shows: ✅ Delivered

### **PHASE 11: EDGE CASES**
- [ ] Try accessing tracking for shipment that doesn't exist
  - Expected: Error message, falls back to demo data
- [ ] Try paying twice on same shipment
  - Expected: Error "Payment already completed"
- [ ] Try uploading doc before paying
  - Expected: Allowed (documents don't require payment first)
- [ ] Try allocating same shipment to 2 different ships
  - Expected: Error "Shipment already allocated"

### **PHASE 12: NOTIFICATIONS**
- [ ] Open both dashboards side-by-side
- [ ] Manager allocates new shipment
  - Expected: Customer sees toast instantly (Socket.io)
- [ ] Manager approves document
  - Expected: Customer dashboard updates
- [ ] Manager marks port
  - Expected: Customer tracking page updates

### **PHASE 13: ERROR HANDLING**
- [ ] Close backend server
- [ ] Try loading tracking page
  - Expected: Shows demo data instead of error
- [ ] Restart backend
- [ ] Refresh tracking
  - Expected: Live data returns
- [ ] Try payment with invalid card
  - Expected: Error from Razorpay, user can retry

---

## 📁 Key Files

| File | Purpose | Users |
|------|---------|-------|
| `auth.html` | Login/Registration | Everyone |
| `wizard.html` | Booking wizard | Customer |
| `shipments.html` | Customer dashboard | Customer |
| `company-dashboard.html` | Manager requests | Manager |
| `track.html` | Real-time tracking | Customer |
| `vehicles.html` | Fleet management | Manager |
| `admin-dashboard.html` | Global monitoring | Admin |
| `v3-workflow-routes.js` | Core business logic | Backend |
| `documents.js` | Document handling | Backend |
| `finance.js` | Payment processing | Backend |
| `tracking.js` | Tracking UI logic | Frontend |
| `fleet-routes-ui.js` | Multi-stop routing | Manager |

---

## 🚀 Performance Notes

- **Database:** PostgreSQL with indexed queries on shipments, vehicles, users
- **Real-Time:** Socket.io channels by shipment ID (e.g., `shipment:123`)
- **File Upload:** Cloudinary CDN for document storage
- **Payment:** Test mode Razorpay (use test card 4111 1111 1111 1111)
- **Map:** Leaflet.js with OpenStreetMap tiles (fast, lightweight)
- **UI:** Responsive glassmorphism design, <2s load time

---

## ✅ Production Checklist

Before going live:

- [ ] Replace test Razorpay keys with production keys
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure production database (not localhost)
- [ ] Set up email notifications (SMTP)
- [ ] Enable SMS notifications (Twilio)
- [ ] Review and update CORS settings
- [ ] Set up monitoring/alerts
- [ ] Backup database regularly
- [ ] Load test with 1000+ concurrent users
- [ ] Security audit (OWASP Top 10)
- [ ] User acceptance testing (UAT)

---

## 📞 Support

**For Testing Issues:**
1. Check backend is running: `npm start` in `/backend`
2. Verify database connection (DATABASE_URL in .env)
3. Check console for JavaScript errors
4. Try clearing browser cache

**For Production Issues:**
- Email: support@smartshipping.io
- Docs: documentation/TROUBLESHOOTING.md

---

**© 2026 Smart Shipping Enterprise. All Rights Reserved.**
