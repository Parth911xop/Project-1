# 🚀 Quick Start Guide - Smart Shipping

**Get up and running in 5 minutes!**

---

## Prerequisites

- Node.js 16+ and npm
- PostgreSQL or MySQL  
- Git

---

## Step 1: Clone & Install

```bash
# Navigate to project directory
cd c:\Users\VICTUS\Desktop\Project-1

# Install backend dependencies
cd backend
npm install

# Back to root
cd ..
```

---

## Step 2: Database Setup

```bash
# In backend folder, run migrations
cd backend

# If using PostgreSQL:
psql -U postgres -d smartshipping < db-schema.sql

# If using MySQL:
mysql -u root -p smartshipping < db-schema.sql

# Seed test data
node seed-db.js
```

---

## Step 3: Environment Configuration

Create `.env` in `/backend`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/smartshipping
# or for MySQL:
DATABASE_URL=mysql://root:password@localhost:3306/smartshipping

# Server
PORT=5500
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-here

# Razorpay (Test Mode)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=rzp_test_xxxxx

# Cloudinary (File uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## Step 4: Start Backend

```bash
cd backend
npm start
```

Expected output:
```
✓ Connected to database
✓ Server running on http://localhost:5500
✓ Socket.io ready
```

---

## Step 5: Open Frontend

Open in browser:
- **Main:** http://localhost:5500
- **Auth:** http://localhost:5500/auth.html
- **Wizard:** http://localhost:5500/wizard.html
- **Shipments:** http://localhost:5500/shipments.html

---

## 🧪 Quick Test Flow (5 minutes)

### **Customer Flow**

1. **Register:**
   - Go to http://localhost:5500/auth.html
   - Click "Sign Up"
   - Email: `customer1@test.com`
   - Password: `Test123!`
   - Role: "Customer"

2. **Create Booking:**
   - Dashboard → "New Booking"
   - Trade Type: Export
   - Source: Mumbai, Destination: Kolkata
   - Cargo: Electronics, 500kg, 10m³
   - Submit

3. **See Locked State:**
   - Dashboard shows shipment in orange
   - Status: "Pending Manager Approval"
   - Buttons disabled: 🔒 "Upload Documents", 🔒 "Pay Now"

### **Manager Flow** (New tab/window)

4. **Login as Manager:**
   - http://localhost:5500/auth.html
   - Email: `manager1@company.com`
   - Password: `Test123!`
   - Role: "Company Manager"

5. **Allocate Ship:**
   - Dashboard → "Booking Requests"
   - See customer's booking
   - Click "Accept"
   - Select ship: "MV Ocean Express"
   - Click "Confirm"

### **Back to Customer**

6. **See Unlocked State:**
   - Dashboard auto-refreshes (Socket.io)
   - Shipment now green
   - Status: "Ship Allocated"
   - Buttons enabled: ✅ "Upload Documents", ✅ "Pay Now"

7. **Upload Document:**
   - Click "Upload Documents"
   - Drag-drop any PDF (or create temp-doc.pdf)
   - Status changes: "Documents Pending"

8. **Make Payment:**
   - Click "Pay Now"
   - Razorpay modal opens
   - Enter test card: `4111 1111 1111 1111`
   - Expiry: `12/25`
   - CVV: `123`
   - Click Pay
   - Success! Receipt downloads

9. **Check Tracking:**
   - Shipment status: "Cargo Ready"
   - Go to http://localhost:5500/track.html?id=1
   - See live map with ship location
   - Timeline shows all steps completed

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :5500
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5500
kill -9 <PID>
```

### Database Connection Failed
```bash
# Check if database is running
# PostgreSQL:
psql -U postgres -l

# MySQL:
mysql -u root -p -e "SELECT 1"

# Check DATABASE_URL in .env matches your setup
```

### Socket.io Not Working
- Check backend console for errors
- Verify port 5500 is accessible
- Try refreshing browser

### Razorpay Error
- Verify test keys are in .env
- Check payment amount > 0
- Make sure test card format is correct

---

## 📁 File Structure Overview

```
Project-1/
├── auth.html                 ← Login/Signup
├── wizard.html              ← Booking form
├── shipments.html           ← Customer dashboard
├── track.html               ← Real-time tracking
├── company-dashboard.html   ← Manager interface
├── vehicles.html            ← Fleet management
├── admin-dashboard.html     ← Admin panel
│
└── backend/
    ├── server.js            ← Express app + Socket.io
    ├── v3-workflow-routes.js ← Core business logic
    ├── finance.js           ← Payment handling
    ├── documents.js         ← Document uploads
    ├── shipment.js          ← Shipment logic
    ├── db-schema.sql        ← Database structure
    ├── seed-db.js           ← Test data
    │
    └── routes/
        ├── company.js       ← Manager endpoints
        └── payment.js       ← Payment endpoints
```

---

## 🎯 What Should Work After Starting

✅ **Customer:**
- [x] Register and login
- [x] Create booking (locked initially)
- [x] See real-time updates when manager allocates ship
- [x] Upload documents
- [x] Make payment (Razorpay test)
- [x] Track shipment in real-time
- [x] Get notifications

✅ **Manager:**
- [x] View booking requests
- [x] Select and allocate ships
- [x] Review uploaded documents
- [x] Confirm shipments
- [x] Update shipment status
- [x] See all managed shipments
- [x] Get notifications

✅ **System:**
- [x] Real-time updates (Socket.io)
- [x] Database persistence
- [x] Document uploads to Cloudinary
- [x] Payment processing via Razorpay
- [x] Live tracking map
- [x] Multi-stop route support

---

## 🔒 Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Customer | `customer1@test.com` | `Test123!` |
| Manager | `manager1@company.com` | `Test123!` |
| Admin | `admin@smartshipping.io` | `Admin123!` |

---

## 💳 Test Payment Info

| Field | Value |
|-------|-------|
| Card Number | `4111 1111 1111 1111` |
| Expiry | `12/25` |
| CVV | Any 3 digits |
| Name | Any name |

---

## 📞 Next Steps

1. **Explore the code:** Read [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)
2. **Understand workflows:** Read [SMART_SHIPPING_WORKFLOW.md](SMART_SHIPPING_WORKFLOW.md)
3. **Customize & Deploy:** Update .env for production, deploy to cloud

---

## 🎬 Demo Video (If Recording)

1. Start with auth.html login screen
2. Show booking wizard (5 steps)
3. Show locked state (manager not approved)
4. Open manager tab and allocate
5. Show real-time unlock on customer side
6. Upload document
7. Make payment with Razorpay
8. Show tracking page with live map
9. Show manager marking port stops
10. Show final delivery confirmation

---

**You're all set! 🚀 Smart Shipping is ready to go.**
