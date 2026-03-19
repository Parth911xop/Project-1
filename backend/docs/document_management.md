# Comprehensive Document Management Center

## Architecture Overview
The Document Management Center acts as a centralized command hub for company managers to handle logistics documents. It was implemented to be robust, performant, and deeply integrated into the backend REST API via `documents.js`.

### 1. Document KPIs
At the top of the interface, four real-time KPIs are rendered:
- **Total Documents**: Aggregates all documents related to the company's active shipments.
- **Pending Verification**: Quick-access counter of KYC and operational documents requiring manager approval.
- **Verified Documents**: Tracks compliance rates.
- **Rejected Documents**: Flags documents requiring re-uploading from buyers/exporters.

### 2. Deep Filtering & Search
A three-tier filtering strategy is utilized to find specific documents instantly without hammering the backend with unnecessary API calls:
- **Status Filter**: Toggle between `Pending Review`, `Verified`, and `Rejected`.
- **Type Filter**: Search by `Commercial Invoice`, `Bill of Lading`, `Customs Declaration`, `KYC`, etc.
- **Smart Search Bar**: Scans simultaneously across dynamically nested data including string evaluations on `Shipment ID` and subset string checks over the `Customer Name`.

### 3. Backend Native Upload via Multer
Managers have the capability to upload critical trade & customs documents natively:
- **Multer Middleware**: The server securely intercepts the `multipart/form-data` packet containing the PDF / Image buffer using Multer.
- **Local Native Save**: To fulfill full backend data residency, the payload is flushed securely into the local `backend/uploads/` directory on disk dynamically generated with an appending timestamp `doc-{USER}-{TIMESTAMP}.ext`.
- **Express Static Routing**: `server.js` exposes public READ permissions to this exact `uploads/` volume so all permitted users can natively view documents matching their roles without complex Base64 DB bloat.

### 4. Native Iframe Previews
Integrated an inner native Web API `iframe` element built into an `Modal` component to instantly view document scans on screen prior to clicking the verification actions, accelerating workflow.

### 5. Bulk Export ZIP Simulator
Initiates an orchestrated programmatic click-loop across all dynamically rendered Table Rows, safely bypassing maximum multi-tab concurrent download blocks from Chromium / Safari. 

## REST API Mapping
- `GET /api/company/documents`: Returns a fully JOINed array containing users, documents, shipment references, and cargo types.
- `POST /api/documents/upload`: Uses Multer.diskStorage. Requires `shipmentId`, `type`, `docName`, and `docFile`.
- `PATCH /api/company/documents/:docId/verify`: Alters verification status (`Submitted` -> `Verified` | `Rejected`) based on the request schema payload.
