# SMART SHIPPING ENTERPRISE - COMPLETE TESTING GUIDE

## Overview
This guide provides step-by-step testing procedures for all major workflows implemented in the Smart Shipping platform. The system features three user roles: **Customer**, **Company Manager**, and **Admin**.

---

## 🚀 ENVIRONMENT SETUP

### Prerequisites
- Backend server running on `http://localhost:3000`
- Frontend accessible on `http://localhost:5500`
- PostgreSQL database connected
- Node.js dependencies installed (`npm install` in backend/)
- Optional: Postman for API testing

### Quick Start
```bash
# Terminal 1: Start the backend
cd backend
npm run dev

# Terminal 2: Open in browser
# http://localhost:5500
```

---

## 1️⃣ CUSTOMER (USER) WORKFLOW TEST

### Step 1: User Registration & Login
**Objective**: Verify customer can register and access dashboard

1. Navigate to `http://localhost:5500/auth.html`
2. Click **"Create an Account"**
3. Fill signup form:
   - Email: `customer@test.com`
   - Full Name: `Test Customer`
   - Role: **Customer**
   - Location: `Singapore`
4. Submit with OTP (check email or use test OTP)
5. Log in successfully
6. **Expected Result**: Redirected to `shipments.html` (customer dashboard)

**Verification Points**:
- ✅ User registered in database
- ✅ JWT token created
- ✅ Auto-redirect to correct dashboard based on role

---

### Step 2: Create a Booking Request (Status = "Pending Manager Approval")
**Objective**: User creates shipping booking in multi-step wizard

1. On customer dashboard (`shipments.html`), click **"Book New Shipment"** or navigate to `wizard.html`
2. Fill booking wizard:
   - **Step 1 - Route**: 
     - Origin: Singapore
     - Destination: Los Angeles
   - **Step 2 - Cargo**:
     - Type: Electronics
     - Weight: 500 kg
     - Volume: 10 CBM
   - **Step 3 - Details**:
     - Export/Import: Export
     - HS Code: 8517.62
     - Cargo Value: $50,000
   - **Step 4 - Shipper/Consignee**:
     - Fill required details
   - **Step 5 - Summary & Submit**

3. Submit booking
4. **Expected Result**: 
   - Booking created with status **"Pending Manager Approval"**
   - User cannot upload documents (button disabled)
   - User cannot pay (button disabled)
   - Shows message: "A manager must allocate a ship first"

**Verification Points**:
- ✅ Booking created in shipments table
- ✅ Status initialized as "Pending Manager Approval"
- ✅ Document upload disabled
- ✅ Payment button disabled with lock icon
- ✅ Customer dashboard shows new booking

**Test API Endpoint**:
```bash
curl -X GET http://localhost:3000/api/shipment/list \
  -H "Cookie: jwt=YOUR_TOKEN_HERE"
```

---

## 2️⃣ MANAGER (COMPANY) WORKFLOW TEST

### Step 3: Manager Login & View Booking Requests
**Objective**: Company manager sees all pending booking requests

1. Log out current user (click profile → Logout)
2. Navigate to `auth.html`
3. Login as manager:
   - Email: `manager@shipping.com`
   - Use OTP verification
4. **Expected Result**: Directed to `company-dashboard.html`

5. On manager dashboard, click **"Booking Requests"** tab
6. **Expected Result**: 
   - Shows grid of pending bookings
   - Displays booking from Step 2
   - Shows: Booking ID, Customer name, Route, Cargo type, Estimated cost

**Test API Endpoint**:
```bash
curl -X GET http://localhost:3000/api/v3/manager/booking-requests \
  -H "Cookie: jwt=YOUR_TOKEN_HERE"
```

---

### Step 4: Ship Allocation (Status → "Ship Allocated")
**Objective**: Manager assigns a ship to the booking

1. In booking grid, click **"Accept"** button on the test booking
2. **Ship Allocation Modal** opens:
   - Shows ship selection dropdown (filtered by source port if available)
   - Select a ship: e.g., "MV Harmony (Ship) - 5 slots open"
   - Select drop port: e.g., "Stop 2: Los Angeles"
   - Add optional notes: "Priority shipment"
   - Click **"Confirm Allocation"**

3. **Expected Result**:
   - Booking status changes to **"Ship Allocated – Awaiting Documents & Payment"**
   - Manager sees success toast notification
   - Booking card updates in real-time (if Socket.io connected)
   - Customer receives notification (Socket.io event: `ship:allocated`)

**Test API Endpoint**:
```bash
curl -X POST http://localhost:3000/api/v3/manager/allocate-ship \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_TOKEN_HERE" \
  -d '{
    "shipmentId": 1,
    "shipId": 1,
    "cargoDropPort": "Los Angeles",
    "notes": "Test allocation"
  }'
```

**Verification Points**:
- ✅ Shipment status updated to "Ship Allocated"
- ✅ Ship's used_slots incremented
- ✅ Customer notification created
- ✅ Booking removed from "Pending" list (refreshes automatically)

---

## 3️⃣ DOCUMENT UPLOAD & VERIFICATION WORKFLOW

### Step 5: Customer Uploads Documents (Now Enabled)
**Objective**: After allocation, customer uploads required documents

1. Log back in as customer
2. Navigate to `documents.html` (Document Center)
3. Click **"Upload Document"** button
4. Fill upload form:
   - Document Type: "KYC - Identity Proof"
   - Shipment ID: (auto-filled or select booking ID from Step 2)
   - File: Select a PDF or image file
   - Click **"Upload"**

5. **Expected Result**:
   - Document uploaded to Cloudinary
   - Document appears in list with status **"Pending"**
   - Modal closes automatically
   - Success message shown

**Upload should fail if**:
- Shipment status is still "Pending Manager Approval" (gating works)
- Should show: "⚠️ Documents locked: A manager must allocate a ship first"

**Verification Points**:
- ✅ Document uploaded to Cloudinary
- ✅ Document record created in database
- ✅ Status set to "Pending"
- ✅ Document appears in customer's document list

**Test API**:
```bash
curl -X GET http://localhost:3000/api/documents/user/all \
  -H "Cookie: jwt=YOUR_TOKEN_HERE"
```

---

### Step 6: Manager Verifies Documents
**Objective**: Manager reviews and approves uploaded documents

1. Log in as manager
2. Navigate to **"Documents"** tab
3. See list of documents with status "Pending"
4. Click **"Verify"** button on a document
5. Modal opens with verification options:
   - **Approve** or **Reject**
   - Add notes if rejecting
   - Click action button

6. **Expected Result**:
   - Document status changes to "Approved" or "Rejected"
   - Customer receives notification (Socket.io: `document:verified`)
   - If rejected, customer gets "Re-upload" button

**Test API**:
```bash
curl -X PATCH http://localhost:3000/api/company/documents/1/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_TOKEN_HERE" \
  -d '{"status": "Approved"}'
```

---

## 4️⃣ PAYMENT & RECEIPT WORKFLOW

### Step 7: Customer Completes Payment
**Objective**: Customer pays for shipment, receives receipt

1. Log back in as customer
2. On shipments dashboard, click on the booking from Step 2
3. Navigation bar shows **Step 1: Booking**, **Step 2: Documents**, **Step 3: Payment**
4. Click **Step 3: Payment** (or scroll to it)
5. **Expected Result**:
   - Payment form visible
   - Shows estimated cost breakdown:
     - Base Freight Cost: ₹XXXXX
     - Taxes & Platform Fees (8%): ₹XXXX
     - **Payable Amount**: ₹XXXXXX
   - **"Pay Now"** button is enabled (green)

6. Click **"Pay Now"** button
7. Razorpay payment popup opens (or test mode)
8. Complete payment (use test card: 4111 1111 1111 1111)
9. **Expected Result**:
   - Payment verified
   - Shipment status changes to **"Cargo Ready"**
   - Success screen shows:
     - ✓ Payment Successful
     - Transaction details
     - **Download Receipt** button appears
   - Customer receives notification (Socket.io: `payment:completed`)

**Test Payment**:
- Use Razorpay test keys (set in `.env`)
- Test card: 4111 1111 1111 1111
- CVV: Any 3 digits
- Expiry: Any future date

**Verification Points**:
- ✅ Transaction created in transactions table
- ✅ Shipment status updated to "Cargo Ready"
- ✅ Invoice auto-generated
- ✅ Payment receipt available
- ✅ Real-time notification sent (Socket.io)

---

### Step 8: Download Receipt as PDF
**Objective**: Customer downloads proof of payment

**From Success Screen**:
1. After successful payment, click **"Download Receipt"** button
2. PDF file downloads: `Receipt-SS-{shipmentId}-{timestamp}.pdf`
3. PDF contains:
   - Smart Shipping header
   - ✓ PAID status badge
   - Shipment details (Booking ID, Ship Name, Route, Cargo)
   - Payment information table
   - Transaction ID
   - Receipt date

**From Shipments Dashboard**:
1.  Go to shipments dashboard
2. Click on a shipment with status "Cargo Ready" or later
3. Go to **Step 3: Payment**
4. **"Receipt"** button visible (instead of "Pay Now")
5. Click download

**Test API**:
```bash
curl -X GET http://localhost:3000/api/v3/payment/receipt/1 \
  -H "Cookie: jwt=YOUR_TOKEN_HERE"
```

**Verification Points**:
- ✅ PDF generated successfully
- ✅ Contains all required information
- ✅ File downloads to user's device
- ✅ HTML fallback works if jsPDF unavailable

---

## 5️⃣ LIVE SHIPMENT TRACKING WORKFLOW

### Step 9: Customer Tracks Shipment
**Objective**: Customer sees real-time shipment location and progress

1. Customer dashboard, click on shipment in **"Cargo Ready"** status
2. Slide-in panel shows shipment details
3. Click **"Track Shipment"** or navigate to `track.html` with shipment ID
4. **Expected Result**:
   - Leaflet map displays shipment route
   - Shows current port location
   - Timeline shows journey progress:
     - ✓ Booking Request
     - ✓ Ship Allocated
     - ✓ Cargo at Port
     - In Transit (current)
     - Delivered (pending)
   - ETA displayed
   - Live position updates every 60 seconds

**Test Tracking API**:
```bash
curl -X GET http://localhost:3000/api/v3/tracking/live/1 \
  -H "Cookie: jwt=YOUR_TOKEN_HERE"
```

**Response includes**:
- Current GPS coordinates
- Current port
- Next port (ETA)
- Journey timeline
- shipment status

**Verification Points**:
- ✅ Map renders with Leaflet
- ✅ Ship position marker shows
- ✅ Timeline updates as status changes
- ✅ ETA displayed accurately

---

### Step 10: Admin Monitors All Ships
**Objective**: Admin sees global fleet tracking

1. Log in as admin
2. Navigate to **"Tracking"** or **"Route Mapping"**
3. **Expected Result**:
   - Global map shows all active ships
   - Markers for each vessel
   - Click marker to see shipment details
   - Real-time updates via Socket.io

**Test API**:
```bash
curl -X GET http://localhost:3000/api/v3/tracking/all-ships \
  -H "Cookie: jwt=YOUR_TOKEN_HERE"
```

---

## 6️⃣ REAL-TIME UPDATES (Socket.io) TEST

### Step 11: Test Socket.io Real-time Events
**Objective**: Verify messages push to clients instantly

**Test Scenario 1: Manager Allocation**
1. Open two browser windows:
   - Window A: Customer logged in, on shipments dashboard
   - Window B: Manager logged in, viewing booking requests
2. In Window B, allocate a pending booking
3. **Expected Result (Window A)**:
   - Toast notification appears: "⚓ Vessel MV Harmony allocated to your booking..."
   - Shipment status updates immediately to "Ship Allocated"
   - Payment button becomes enabled (not grayed out)

**Test Scenario 2: Payment Completion**
1. Window A: Customer completes payment
2. **Expected Result (Window B - Manager)**:
   - notification update: shipment status changes to "Cargo Ready"
   - If manager has this shipment open, panels refresh

**Test Scenario 3: Document Verification**
1. Window A: Customer on documents page
2. Window B: Manager verifies a document
3. **Expected Result (Window A)**:
   - Toast notification: "✓ Document 'KYC - Identity Proof' has been Approved"
   - Document list refreshes showing "Approved" status

**Real-time Events to Monitor**:
- `shipment:status_update` - Shipment status changed
- `payment:completed` - Payment received
- `document:verified` - Document approved/rejected
- `ship:allocated` - Vessel allocated to booking
- `notification` - General notifications
- `tracking:update` - Ship location updated

**Check Socket Connection**:
```javascript
// In browser console
console.log(window.shippingSocket.isConnected);  // Should be true
console.log(window.shippingSocket.socket);        // Should show socket.io connection
```

---

## 7️⃣ PAYMENT GATING TEST

### Step 12: Verify Payment is Gated
**Objective**: Confirm payment only available after ship allocation

1. Create a new booking (status = "Pending Manager Approval")
2. Navigate to `shipments.html`, open this booking
3. Go to **Step 3: Payment**
4. **Expected Result**:
   - **"Pay Now"** button is **DISABLED** (grayed out, 50% opacity)
   - Warning banner displays:
     - 🔒 "Payment Locked"
     - "A manager must allocate a ship first. Once your booking is approved and a vessel is assigned, payment will be enabled."

5. Manager allocates ship (Step 4)
6. Customer refreshes page
7. **Expected Result**:
   - **"Pay Now"** button is **ENABLED** (bright green)
   - Warning banner disappears
   - Customer can now proceed with payment

---

## 8️⃣ DOCUMENT GATING TEST

### Step 13: Verify Document Upload is Gated
**Objective**: Confirm documents can only be uploaded after ship allocation

1. Create a new booking (status = "Pending Manager Approval")
2. Navigate to `documents.html`
3. Try to upload a document for this booking
4. **Expected Result**:
   - Upload proceeds, but backend rejects with message:
     - "⚠️ Documents locked: A manager must allocate a ship first. Once allocated, document upload will be enabled."

5. Manager allocates ship
6. Try document upload again
7. **Expected Result**:
   - Upload succeeds
   - Document appears in list

---

## 9️⃣ ADMIN DASHBOARD TEST

### Step 14: Admin Management Functions
**Objective**: Verify admin can manage users, companies, shipments

1. Log in as admin
2. **Users Tab**:
   - See all registered users with roles
   - Block/Unblock user option
   - Delete user option
   - User count KPI

3. **Companies Tab**:
   - See all company registrations
   - Status: "Pending", "Approved", "Suspended"
   - Approve/Reject company with verification
   - Company details

4. **Shipments Tab**:
   - See all shipments across platform
   - Filter by status
   - Update shipment status
   - Cancel shipments
   - Search by booking ID

5. **Documents Tab**:
   - View all uploaded documents
   - Status: "Pending", "Approved", "Rejected"
   - Verify documents
   - Search by shipment

6. **Analytics**:
   - Monthly shipment trends (chart)
   - Revenue by month
   - Status distribution (pie chart)
   - Role distribution

7. **Ports Management**:
   - Add new ports
   - View port list
   - Delete ports
   - Set port constraints

---

## 🔟 EDGE CASES & ERROR TESTING

### Test 10: Invalid Payment Attempt
1. Customer tries to pay with insufficient status
2. **Expected**: Backend returns 400 error:
   ```json
   {
     "success": false,
     "message": "Payment locked: A manager must allocate a ship before payment."
   }
   ```

### Test 11: Duplicate Ship Allocation
1. Manager tries to allocate same booking twice
2. **Expected**: Second allocation fails (shipment not in "Pending Manager Approval" status)

### Test 12: Unauthorized Document Upload
1. Unlogged user tries to access `/api/documents/upload`
2. **Expected**: 401 Unauthorized response

### Test 13: Invalid Shipment ID
1. Access tracking with non-existent shipment ID
2. **Expected**: 404 Not Found response

### Test 14: Database Connection Loss
1. Stop database
2. Try to load shipments
3. **Expected**: User sees "Server error" message, not blank page

---

## 📊 MANUAL API TESTING (Postman/curl)

### Authentication
```bash
# Get JWT token 
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@test.com"}'

# Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@test.com", "otp": "123456"}'
```

### Shipment Workflow
```bash
# Create booking
curl -X POST http://localhost:3000/api/shipment/create \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=TOKEN" \
  -d '{"from_country": "Singapore", "to_country": "USA", ...}'

# Allocate ship
curl -X POST http://localhost:3000/api/v3/manager/allocate-ship \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=TOKEN" \
  -d '{"shipmentId": 1, "shipId": 1, "cargoDropPort": "Los Angeles"}'

# Get tracking
curl -X GET http://localhost:3000/api/v3/tracking/live/1 \
  -H "Cookie: jwt=TOKEN"
```

---

##  TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Payment button doesn't appear | Check shipment status, should be "Ship Allocated" or later |
| Document upload shows error | Verify shipment status is "Ship Allocated" |
| Socket.io notifications not showing | Check backend connection, ensure `socket-client.js` loaded |
| Receipt PDF not downloading | Verify jsPDF library loaded in HTML |
| Shipment not showing in dashboard | Check user role and authentication |
| Real-time updates not working | Open browser console, check `window.shippingSocket.isConnected` |

---

## ✅ CHECKLIST FOR GO-LIVE

- [ ] All workflows tested end-to-end
- [ ] Payment gating working correctly
- [ ] Document gating working correctly
- [ ] Real-time updates working (Ship allocation, Payment, Documents)
- [ ] PDF receipts generating correctly
- [ ] Admin dashboard fully functional
- [ ] Error handling and messages user-friendly
- [ ] No console errors in browser
- [ ] Socket.io connection stable
- [ ] Database backups configured
- [ ] Environment variables set for production
- [ ] Razorpay/Stripe credentials configured
- [ ] Email notifications configured
- [ ] SSL certificate installed
- [ ] Rate limiting enabled
- [ ] Security headers configured

---

## 📞 SUPPORT

For issues or questions:
- Check `/backend/server.js` console for backend errors
- Check browser console (F12) for frontend errors
- Review API response status codes
- Check Socket.io connection status
- Verify environment variables in `.env`

