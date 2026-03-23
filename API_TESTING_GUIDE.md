# 🔌 API Testing Guide - Complete Reference
## Use with Postman, cURL, or any REST client

**Base URL:** `http://localhost:5500`

---

## 📋 Table of Contents

1. [Authentication](#-authentication)
2. [Customer APIs](#-customer-apis)
3. [Manager APIs](#-manager-apis)
4. [Document APIs](#-document-apis)
5. [Payment APIs](#-payment-apis)
6. [Tracking APIs](#-tracking-apis)
7. [Admin APIs](#-admin-apis)

---

## 🔐 Authentication

### Register New User

**Request:**
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "customer1@test.com",
  "password": "Test123!",
  "name": "John Doe",
  "role": "customer"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "userId": 1,
  "email": "customer1@test.com",
  "role": "customer"
}
```

---

### Login User

**Request:**
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "customer1@test.com",
  "password": "Test123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "customer1@test.com",
    "role": "customer",
    "name": "John Doe"
  }
}
```

**Store the token for subsequent requests!**

---

## 👤 Customer APIs

### Create Shipment

**Request:**
```
POST /api/v3/shipment/create
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "sourcePort": "Mumbai Port",
  "destinationPort": "Kolkata Port",
  "productType": "Electronics",
  "weightKg": 500,
  "volumeCbm": 10,
  "billingAddress": "123 Business Street, Mumbai",
  "preferredDate": "2026-03-25"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Shipment created successfully",
  "shipmentId": 123,
  "status": "Pending Manager Approval",
  "estimatedCost": 50000,
  "createdAt": "2026-03-19T10:00:00Z"
}
```

---

### Get My Shipments

**Request:**
```
GET /api/shipment/list
Authorization: Bearer <your_token>
```

**Response (200):**
```json
{
  "success": true,
  "shipments": [
    {
      "id": 123,
      "sourcePort": "Mumbai Port",
      "destinationPort": "Kolkata Port",
      "status": "Ship Allocated",
      "allocatedShip": "MV Maersk Gulsun",
      "productType": "Electronics",
      "weightKg": 500,
      "estimatedCost": 50000,
      "createdAt": "2026-03-19T10:00:00Z",
      "documentsUploaded": false,
      "paymentDone": false
    }
  ],
  "totalCount": 1
}
```

---

### Get Shipment Details

**Request:**
```
GET /api/shipment/:id
Authorization: Bearer <your_token>
```

**Example:**
```
GET /api/shipment/123
Authorization: Bearer <your_token>
```

**Response (200):**
```json
{
  "success": true,
  "shipment": {
    "id": 123,
    "customerId": 1,
    "sourcePort": "Mumbai Port",
    "destinationPort": "Kolkata Port",
    "cargoDropPort": "Kolkata Port",
    "status": "Ship Allocated",
    "allocatedShipId": 5,
    "allocatedShipName": "MV Maersk Gulsun",
    "productType": "Electronics",
    "weightKg": 500,
    "volumeCbm": 10,
    "estimatedCost": 50000,
    "documentsUploaded": true,
    "documentStatus": "Approved",
    "paymentDone": true,
    "paymentId": 456,
    "createdAt": "2026-03-19T10:00:00Z",
    "allocatedAt": "2026-03-19T11:30:00Z"
  }
}
```

---

### Get Shipment Status Timeline

**Request:**
```
GET /api/shipment/:id/timeline
Authorization: Bearer <your_token>
```

**Response (200):**
```json
{
  "success": true,
  "timeline": [
    {
      "status": "Booking Confirmed",
      "timestamp": "2026-03-19T10:00:00Z",
      "completed": true,
      "message": "Your booking has been confirmed"
    },
    {
      "status": "Ship Allocated",
      "timestamp": "2026-03-19T11:30:00Z",
      "completed": true,
      "message": "Allocated to MV Maersk Gulsun"
    },
    {
      "status": "Documents Pending",
      "timestamp": "2026-03-19T14:00:00Z",
      "completed": true,
      "message": "Waiting for your documents"
    },
    {
      "status": "Payment Pending",
      "timestamp": null,
      "completed": false,
      "message": "Please complete payment"
    },
    {
      "status": "Cargo Ready",
      "timestamp": null,
      "completed": false,
      "message": "Waiting for payment confirmation"
    }
  ]
}
```

---

## 👨‍💼 Manager APIs

### Get Booking Requests (Pending Manager Approval)

**Request:**
```
GET /api/v3/manager/booking-requests
Authorization: Bearer <manager_token>
```

**Response (200):**
```json
{
  "success": true,
  "bookings": [
    {
      "shipmentId": 123,
      "customerId": 1,
      "customerName": "John Doe",
      "customerEmail": "customer1@test.com",
      "sourcePort": "Mumbai Port",
      "destinationPort": "Kolkata Port",
      "productType": "Electronics",
      "weightKg": 500,
      "volumeCbm": 10,
      "estimatedCost": 50000,
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "totalCount": 1
}
```

---

### Get Available Ships

**Request:**
```
GET /api/v3/manager/ships
Authorization: Bearer <manager_token>
Query Parameters:
  ?minCapacity=500&sourcePort=Mumbai Port&destPort=Kolkata Port
```

**Response (200):**
```json
{
  "success": true,
  "ships": [
    {
      "id": 5,
      "name": "MV Maersk Gulsun",
      "type": "Container Ship",
      "capacity": 5000,
      "currentCapacity": 4500,
      "currentPort": "Mumbai Port",
      "status": "Available",
      "route": [
        { "port": "Mumbai Port", "lat": 19.0176, "lng": 72.8479 },
        { "port": "Kolkata Port", "lat": 22.5726, "lng": 88.3639 }
      ]
    },
    {
      "id": 8,
      "name": "MV Ocean Express",
      "type": "Bulk Carrier",
      "capacity": 8000,
      "currentCapacity": 7200,
      "currentPort": "Mumbai Port",
      "status": "Available"
    }
  ],
  "totalCount": 2
}
```

---

### Allocate Ship to Shipment

**Request:**
```
POST /api/v3/manager/allocate-ship
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "shipmentId": 123,
  "shipId": 5,
  "cargoDropPort": "Kolkata Port"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Ship allocated successfully",
  "shipmentId": 123,
  "shipName": "MV Maersk Gulsun",
  "newStatus": "Ship Allocated",
  "notificationSent": true
}
```

---

### Get Manager Shipments

**Request:**
```
GET /api/v3/manager/shipments
Authorization: Bearer <manager_token>
Query Parameters:
  ?status=Ship Allocated&page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "shipments": [
    {
      "id": 123,
      "customerName": "John Doe",
      "sourcePort": "Mumbai Port",
      "destinationPort": "Kolkata Port",
      "status": "Ship Allocated",
      "allocatedShip": "MV Maersk Gulsun",
      "weightKg": 500,
      "cargoDropPort": "Kolkata Port",
      "documentsStatus": "Pending Review",
      "paymentStatus": "Pending",
      "allocatedAt": "2026-03-19T11:30:00Z"
    }
  ],
  "totalCount": 15,
  "page": 1,
  "limit": 10
}
```

---

### Update Shipment Status

**Request:**
```
PUT /api/v3/shipment/:id/status
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "status": "In Transit",
  "notes": "Ship departed Mumbai port"
}
```

**Valid Status Values:**
- `Pending Manager Approval`
- `Ship Allocated`
- `Documents Pending`
- `Payment Pending`
- `Cargo Ready`
- `Accepted`
- `In Transit`
- `Customs`
- `Out for Delivery`
- `Delivered`

**Response (200):**
```json
{
  "success": true,
  "message": "Shipment status updated",
  "shipmentId": 123,
  "newStatus": "In Transit",
  "timestamp": "2026-03-19T18:00:00Z"
}
```

---

### Pin Ship at Port (Update Location)

**Request:**
```
POST /api/v3/manager/ship/:shipId/pin-port
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "portName": "Chennai Port",
  "lat": 13.1939,
  "lng": 80.1288
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Ship pinned at Chennai Port",
  "shipId": 5,
  "currentPort": "Chennai Port",
  "currentLat": 13.1939,
  "currentLng": 80.1288,
  "customersNotified": 3
}
```

---

## 📄 Document APIs

### Upload Document

**Request:**
```
POST /api/documents/upload
Authorization: Bearer <your_token>
Content-Type: multipart/form-data

Form Data:
  shipmentId: 123
  docType: invoice (or: packing_list, customs, bill_of_lading)
  file: <binary PDF file>
```

**Response (201):**
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "documentId": 456,
  "shipmentId": 123,
  "documentType": "invoice",
  "url": "https://res.cloudinary.com/.../invoice-123.pdf",
  "uploadedAt": "2026-03-19T14:00:00Z"
}
```

---

### Get Shipment Documents

**Request:**
```
GET /api/shipment/:id/documents
Authorization: Bearer <your_token>
```

**Response (200):**
```json
{
  "success": true,
  "documents": [
    {
      "id": 456,
      "type": "invoice",
      "url": "https://res.cloudinary.com/.../invoice-123.pdf",
      "status": "Pending Review",
      "uploadedAt": "2026-03-19T14:00:00Z"
    },
    {
      "id": 457,
      "type": "packing_list",
      "url": "https://res.cloudinary.com/.../packing-123.pdf",
      "status": "Approved",
      "uploadedAt": "2026-03-19T14:15:00Z"
    }
  ]
}
```

---

### Approve Document (Manager Only)

**Request:**
```
POST /api/documents/:id/approve
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "comments": "Invoice verified and approved"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Document approved",
  "documentId": 456,
  "status": "Approved",
  "shipmentId": 123
}
```

---

### Reject Document (Manager Only)

**Request:**
```
POST /api/documents/:id/reject
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "reason": "Document is incomplete. Missing signature."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Document rejected",
  "documentId": 456,
  "reason": "Document is incomplete. Missing signature.",
  "shipmentId": 123
}
```

---

## 💳 Payment APIs

### Create Payment Order

**Request:**
```
POST /api/v3/payment/create
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "shipmentId": 123,
  "amount": 50000,
  "currency": "INR"
}
```

**Response (201):**
```json
{
  "success": true,
  "razorpayOrderId": "order_12345xyz",
  "amount": 50000,
  "currency": "INR",
  "key": "rzp_test_xxxxx",
  "shipmentId": 123
}
```

---

### Verify Payment

**Request:**
```
POST /api/v3/payment/verify
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "orderId": "order_12345xyz",
  "paymentId": "pay_87654abc",
  "signature": "9ef4dffbfd84f1318f6739a3ce19f9d85851857ae648f114332d8401e0949a50"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "paymentId": 789,
  "shipmentId": 123,
  "status": "Successful",
  "amount": 50000,
  "receipt": "https://res.cloudinary.com/.../receipt-123.pdf",
  "receiptDownloadUrl": "/api/v3/payment/789/receipt"
}
```

---

### Get Payment Receipt

**Request:**
```
GET /api/v3/payment/:paymentId/receipt
Authorization: Bearer <your_token>
```

**Response:** PDF file downloads automatically

---

### Get Payment Status

**Request:**
```
GET /api/v3/payment/:paymentId/status
Authorization: Bearer <your_token>
```

**Response (200):**
```json
{
  "success": true,
  "payment": {
    "id": 789,
    "shipmentId": 123,
    "amount": 50000,
    "currency": "INR",
    "status": "Successful",
    "razorpayPaymentId": "pay_87654abc",
    "createdAt": "2026-03-19T16:00:00Z",
    "verifiedAt": "2026-03-19T16:05:00Z"
  }
}
```

---

## 🗺️ Tracking APIs

### Get Live Tracking Data

**Request:**
```
GET /api/v3/tracking/live/:shipmentId
Authorization: Bearer <your_token>
```

**Response (200):**
```json
{
  "success": true,
  "tracking": {
    "shipmentId": 123,
    "status": "In Transit",
    "currentPort": "Mumbai Port",
    "currentLat": 19.0176,
    "currentLng": 72.8479,
    "destinationPort": "Kolkata Port",
    "destinationLat": 22.5726,
    "destinationLng": 88.3639,
    "progressPercent": 50,
    "nextStop": "Chennai Port - ETA 2026-03-20 14:00",
    "estimatedDelivery": "2026-03-21 10:00",
    "stops": [
      {
        "port": "Mumbai Port",
        "lat": 19.0176,
        "lng": 72.8479,
        "status": "Completed",
        "eta": "2026-03-19 18:00"
      },
      {
        "port": "Chennai Port",
        "lat": 13.1939,
        "lng": 80.1288,
        "status": "Current",
        "eta": "2026-03-20 14:00"
      },
      {
        "port": "Kolkata Port",
        "lat": 22.5726,
        "lng": 88.3639,
        "status": "Pending",
        "eta": "2026-03-21 10:00"
      }
    ],
    "timeline": [
      {
        "status": "Booking Confirmed",
        "timestamp": "2026-03-19T10:00:00Z",
        "completed": true
      },
      {
        "status": "Ship Allocated",
        "timestamp": "2026-03-19T11:30:00Z",
        "completed": true
      },
      {
        "status": "In Transit",
        "timestamp": "2026-03-19T18:00:00Z",
        "completed": true
      },
      {
        "status": "At Chennai Port",
        "timestamp": null,
        "completed": false
      },
      {
        "status": "Delivered",
        "timestamp": null,
        "completed": false
      }
    ],
    "lastUpdated": "2026-03-19T20:00:00Z"
  }
}
```

---

### Get Tracking History

**Request:**
```
GET /api/v3/tracking/history/:shipmentId
Authorization: Bearer <your_token>
Query Parameters:
  ?limit=50&offset=0
```

**Response (200):**
```json
{
  "success": true,
  "history": [
    {
      "id": 1,
      "timestamp": "2026-03-19T10:00:00Z",
      "status": "Booking Confirmed",
      "port": null,
      "message": "Your booking has been created"
    },
    {
      "id": 2,
      "timestamp": "2026-03-19T11:30:00Z",
      "status": "Ship Allocated",
      "port": "Mumbai Port",
      "message": "Allocated to MV Maersk Gulsun"
    },
    {
      "id": 3,
      "timestamp": "2026-03-19T18:00:00Z",
      "status": "In Transit",
      "port": "Mumbai Port",
      "lat": 19.0176,
      "lng": 72.8479,
      "message": "Ship has departed from Mumbai Port"
    }
  ],
  "totalCount": 10
}
```

---

## 🏢 Admin APIs

### Get All Shipments (Admin Only)

**Request:**
```
GET /api/admin/shipments
Authorization: Bearer <admin_token>
Query Parameters:
  ?status=In Transit&limit=20&offset=0&sortBy=createdAt&order=desc
```

**Response (200):**
```json
{
  "success": true,
  "shipments": [
    {
      "id": 123,
      "customerName": "John Doe",
      "companyName": "Shipping Co. A",
      "sourcePort": "Mumbai Port",
      "destinationPort": "Kolkata Port",
      "status": "In Transit",
      "weightKg": 500,
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "totalCount": 1250,
  "page": 1,
  "limit": 20
}
```

---

### Get Analytics Dashboard

**Request:**
```
GET /api/admin/analytics
Authorization: Bearer <admin_token>
Query Parameters:
  ?period=monthly (daily, weekly, monthly, yearly)
```

**Response (200):**
```json
{
  "success": true,
  "analytics": {
    "period": "monthly",
    "totalShipments": 450,
    "totalRevenue": 22500000,
    "averageShipmentValue": 50000,
    "totalCustomers": 85,
    "totalCargoHandle": "225000 kg",
    "deliveryRate": "98.5%",
    "averageDeliveryTime": "3.2 days",
    "topRoutes": [
      { "route": "Mumbai → Kolkata", "count": 125 },
      { "route": "Mumbai → Delhi", "count": 95 }
    ],
    "topCargos": [
      { "type": "Electronics", "count": 180 },
      { "type": "Textiles", "count": 120 }
    ],
    "dailyRevenue": [
      { "date": "2026-03-01", "revenue": 750000 },
      { "date": "2026-03-02", "revenue": 820000 }
    ]
  }
}
```

---

## 🧪 Postman Collection Template

**Import into Postman:**

```json
{
  "info": {
    "name": "Smart Shipping API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/auth/register",
            "body": {
              "mode": "raw",
              "raw": "{\"email\":\"test@example.com\",\"password\":\"Test123!\",\"role\":\"customer\"}"
            }
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\"email\":\"test@example.com\",\"password\":\"Test123!\"}"
            }
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5500"
    },
    {
      "key": "token",
      "value": ""
    }
  ]
}
```

**Setup Instructions:**
1. Save as `Smart-Shipping-API.postman_collection.json`
2. Import into Postman
3. Set `baseUrl` variable to `http://localhost:5500`
4. Run `Login` request first
5. Copy response token into `token` variable
6. Use in other requests with `Authorization: Bearer {{token}}`

---

## 🚨 Error Responses

### 400 - Bad Request
```json
{
  "success": false,
  "error": "Invalid input",
  "details": "weightKg must be greater than 0"
}
```

### 401 - Unauthorized
```json
{
  "success": false,
  "error": "Invalid token",
  "message": "Please login again"
}
```

### 403 - Forbidden
```json
{
  "success": false,
  "error": "Access Denied",
  "message": "Only managers can allocate ships"
}
```

### 404 - Not Found
```json
{
  "success": false,
  "error": "Shipment not found",
  "shipmentId": 999
}
```

### 500 - Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Something went wrong. Please try again."
}
```

---

## 💡 Tips

- **Always include Authorization header** (except for Register/Login)
- **Test with cURL:**
  ```bash
  curl -X GET http://localhost:5500/api/shipment/list \
    -H "Authorization: Bearer <your_token>"
  ```
- **Store sensitive data** in environment variables, not in code
- **Rate limit:** 100 requests/minute per IP
- **Timeout:** 30 seconds for all endpoints

---

**© 2026 Smart Shipping Enterprise. All Rights Reserved.**
