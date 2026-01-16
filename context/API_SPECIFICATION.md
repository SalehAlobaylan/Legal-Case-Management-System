# Backend API Specification

This document defines all REST API endpoints required by the Silah Legal Case Management frontend.

**Base URL:** `http://localhost:3001` (configurable via `NEXT_PUBLIC_API_URL`)

---

## Authentication

All protected endpoints require `Authorization: Bearer <token>` header.

### POST `/api/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "email": "ahmed@alrashid-law.sa",
    "fullName": "Ahmed Al-Rashid",
    "role": "admin | senior_lawyer | lawyer | paralegal | clerk",
    "organizationId": 1
  },
  "token": "jwt_token_here"
}
```

---

### POST `/api/auth/register`
Register a new user.

**Request:**
```json
{
  "email": "string",
  "password": "string",
  "fullName": "string",
  "organizationId": 1
}
```

**Response:** `201 Created`
```json
{
  "user": { ... },
  "token": "jwt_token_here"
}
```

---

### POST `/api/auth/logout`
Logout and invalidate token.

**Response:** `200 OK`

---

### GET `/api/auth/me`
Get current authenticated user.

**Response:** `200 OK`
```json
{
  "user": { ... }
}
```

---

## Cases

### GET `/api/cases`
Get paginated list of cases.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (open, in_progress, pending_hearing, closed, archived) |
| `caseType` | string | Filter by type (criminal, civil, commercial, labor, family, administrative) |
| `search` | string | Search in title, case_number, description |
| `assignedLawyerId` | number | Filter by assigned lawyer |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10) |

**Response:** `200 OK`
```json
{
  "cases": [
    {
      "id": 1,
      "organization_id": 1,
      "case_number": "C-2024-001",
      "title": "Al-Amoudi vs. TechSolutions Ltd",
      "description": "Labor dispute...",
      "case_type": "labor",
      "status": "open",
      "client_info": "Mohammed Al-Amoudi",
      "assigned_lawyer_id": 2,
      "court_jurisdiction": "Riyadh Labor Court",
      "filing_date": "2024-12-01",
      "next_hearing": "2025-01-20",
      "created_at": "2024-12-01T00:00:00Z",
      "updated_at": "2024-12-25T00:00:00Z"
    }
  ],
  "total": 24,
  "page": 1,
  "limit": 10
}
```

---

### GET `/api/cases/:id`
Get single case by ID.

**Response:** `200 OK`
```json
{
  "case": { ... }
}
```

---

### POST `/api/cases`
Create a new case.

**Request:**
```json
{
  "caseNumber": "C-2024-006",
  "title": "New Case Title",
  "description": "Optional description",
  "caseType": "labor",
  "status": "open",
  "clientInfo": "Client name",
  "courtJurisdiction": "Riyadh Labor Court",
  "filingDate": "2024-12-25",
  "nextHearing": "2025-02-01"
}
```

**Response:** `201 Created`
```json
{
  "case": { ... }
}
```

---

### PUT `/api/cases/:id`
Update existing case.

**Request:** Partial case fields

**Response:** `200 OK`
```json
{
  "case": { ... }
}
```

---

### DELETE `/api/cases/:id`
Soft delete a case.

**Response:** `204 No Content`

---

## Regulations

### GET `/api/regulations`
Get paginated list of regulations.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (active, amended, repealed, draft) |
| `category` | string | Filter by category (labor, commercial, civil, criminal, administrative, family, digital) |
| `search` | string | Search in title, regulation_number |
| `page` | number | Page number |
| `limit` | number | Items per page |

**Response:** `200 OK`
```json
{
  "regulations": [
    {
      "id": 1,
      "title": "Saudi Labor Law",
      "regulationNumber": "M/51",
      "category": "labor",
      "jurisdiction": "Kingdom of Saudi Arabia",
      "status": "active",
      "currentVersionId": 1,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 6,
  "page": 1,
  "limit": 10
}
```

---

### GET `/api/regulations/:id`
Get single regulation by ID.

**Response:** `200 OK`
```json
{
  "regulation": { ... }
}
```

---

### GET `/api/regulations/:id/versions`
Get version history for a regulation.

**Response:** `200 OK`
```json
{
  "versions": [
    {
      "id": 1,
      "regulationId": 1,
      "versionNumber": 1,
      "effectiveDate": "2005-09-27",
      "contentText": "...",
      "contentHash": "abc123",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### POST `/api/regulations/search`
Full-text and semantic search for regulations.

**Request:**
```json
{
  "query": "labor compensation dismissal",
  "topK": 10
}
```

**Response:** `200 OK`
```json
{
  "regulations": [ ... ]
}
```

---

### POST `/api/regulations/subscribe`
Subscribe organization to regulation updates.

**Request:**
```json
{
  "regulationId": 1,
  "sourceUrl": "https://laws.boe.gov.sa/...",
  "checkIntervalHours": 24
}
```

**Response:** `201 Created`

---

## AI Links (Case-Regulation Matches)

### GET `/api/ai-links/:caseId`
Get AI-suggested regulation links for a case.

**Response:** `200 OK`
```json
{
  "links": [
    {
      "id": 1,
      "case_id": 1,
      "regulation_id": 1,
      "similarity_score": 0.92,
      "method": "ai | manual | hybrid",
      "verified": false,
      "regulation": {
        "id": 1,
        "title": "Saudi Labor Law",
        "regulation_number": "M/51"
      },
      "created_at": "2024-12-01T00:00:00Z"
    }
  ]
}
```

---

### POST `/api/ai-links/:caseId/generate`
Trigger AI to generate new regulation matches for a case.

**Response:** `200 OK`
```json
{
  "links": [ ... ]
}
```

---

### POST `/api/ai-links/:linkId/verify`
Mark an AI link as verified by lawyer.

**Response:** `200 OK`

---

### DELETE `/api/ai-links/:linkId`
Dismiss/remove an AI link.

**Response:** `204 No Content`

---

## Documents

### GET `/api/cases/:caseId/documents`
Get all documents for a case.

**Response:** `200 OK`
```json
{
  "documents": [
    {
      "id": 1,
      "caseId": 1,
      "fileName": "contract.pdf",
      "filePath": "/uploads/cases/1/contract.pdf",
      "fileSize": 245760,
      "mimeType": "application/pdf",
      "uploadedBy": 2,
      "uploadedByName": "Fatima Al-Zahrani",
      "createdAt": "2024-12-01T00:00:00Z"
    }
  ]
}
```

---

### POST `/api/cases/:caseId/documents`
Upload a document to a case.

**Request:** `multipart/form-data`
- `file`: The file to upload

**Response:** `201 Created`
```json
{
  "document": { ... }
}
```

---

### GET `/api/documents/:docId/download`
Download a document file.

**Response:** File stream with appropriate content-type

---

### DELETE `/api/documents/:docId`
Delete a document.

**Response:** `204 No Content`

---

## Clients

### GET `/api/clients`
Get paginated list of clients.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by type (individual, company) |
| `search` | string | Search in name, email, phone |
| `page` | number | Page number |
| `limit` | number | Items per page |

**Response:** `200 OK`
```json
{
  "clients": [
    {
      "id": 1,
      "organizationId": 1,
      "name": "TechSolutions Ltd",
      "type": "company",
      "contactEmail": "legal@techsolutions.sa",
      "contactPhone": "+966 11 987 6543",
      "address": "Olaya District, Riyadh",
      "notes": "Major technology company",
      "casesCount": 2,
      "createdAt": "2024-01-10T00:00:00Z",
      "updatedAt": "2024-01-10T00:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

---

### GET `/api/clients/:id`
Get single client by ID.

**Response:** `200 OK`
```json
{
  "client": { ... }
}
```

---

### GET `/api/clients/:id/cases`
Get all cases for a client.

**Response:** `200 OK`
```json
{
  "cases": [ ... ]
}
```

---

### POST `/api/clients`
Create a new client.

**Request:**
```json
{
  "name": "New Client",
  "type": "individual | company",
  "contactEmail": "client@email.com",
  "contactPhone": "+966 55 123 4567",
  "address": "Address here",
  "notes": "Optional notes"
}
```

**Response:** `201 Created`
```json
{
  "client": { ... }
}
```

---

### PUT `/api/clients/:id`
Update existing client.

**Response:** `200 OK`
```json
{
  "client": { ... }
}
```

---

### DELETE `/api/clients/:id`
Delete a client.

**Response:** `204 No Content`

---

## Alerts/Notifications

### GET `/api/alerts`
Get alerts for current user.

**Response:** `200 OK`
```json
{
  "alerts": [
    {
      "id": 1,
      "userId": 1,
      "type": "regulation_update | ai_suggestion | case_update | document_upload | system",
      "title": "New Amendment to Labor Law",
      "message": "Article 77 has been revised...",
      "isRead": false,
      "metadata": {
        "regulationId": 6,
        "caseId": null,
        "documentId": null,
        "linkUrl": "/regulations/6"
      },
      "createdAt": "2024-12-20T00:00:00Z"
    }
  ],
  "unreadCount": 3
}
```

---

### PATCH `/api/alerts/:id/read`
Mark single alert as read.

**Response:** `200 OK`

---

### PATCH `/api/alerts/read-all`
Mark all alerts as read.

**Response:** `200 OK`

---

## User Profile

### GET `/api/profile`
Get current user's profile.

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "email": "ahmed@alrashid-law.sa",
    "fullName": "Ahmed Al-Rashid",
    "role": "admin",
    "organizationId": 1,
    "phone": "+966 50 123 4567",
    "bio": "Founder and managing partner...",
    "avatarUrl": null,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

---

### PUT `/api/profile`
Update user profile.

**Request:**
```json
{
  "fullName": "Updated Name",
  "phone": "+966 50 999 8888",
  "bio": "Updated bio"
}
```

**Response:** `200 OK`
```json
{
  "user": { ... }
}
```

---

### PUT `/api/profile/password`
Change password.

**Request:**
```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

**Response:** `200 OK`

---

## Settings

### GET `/api/settings/notifications`
Get notification preferences.

**Response:** `200 OK`
```json
{
  "emailAlerts": true,
  "pushNotifications": true,
  "regulationUpdates": true,
  "caseUpdates": true,
  "aiSuggestions": true
}
```

---

### PUT `/api/settings/notifications`
Update notification preferences.

**Request:** Same as response above

**Response:** `200 OK`

---

### GET `/api/settings/organization`
Get organization settings (admin only).

**Response:** `200 OK`
```json
{
  "organization": {
    "id": 1,
    "name": "Al-Rashid Law Firm",
    "email": "info@alrashid-law.sa",
    "phone": "+966 11 234 5678",
    "address": "King Fahd Road, Riyadh"
  }
}
```

---

### PUT `/api/settings/organization`
Update organization settings (admin only).

**Response:** `200 OK`

---

## WebSocket Events

Connect to: `ws://localhost:3001/ws?token=<jwt_token>`

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `alert:new` | Alert object | New alert notification |
| `alert:update` | Alert object | Alert updated |
| `case:update` | Case object | Case was modified |
| `regulation:update` | Regulation object | Regulation was updated |
| `ai-link:new` | CaseRegulationLink object | New AI match found |

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error message",
    "details": { ... }
  }
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid request data |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource already exists |
| 500 | INTERNAL_ERROR | Server error |

---

## Summary of Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | User login |
| POST | /api/auth/register | User registration |
| POST | /api/auth/logout | User logout |
| GET | /api/auth/me | Get current user |
| GET | /api/cases | List cases |
| GET | /api/cases/:id | Get case details |
| POST | /api/cases | Create case |
| PUT | /api/cases/:id | Update case |
| DELETE | /api/cases/:id | Delete case |
| GET | /api/regulations | List regulations |
| GET | /api/regulations/:id | Get regulation details |
| GET | /api/regulations/:id/versions | Get regulation versions |
| POST | /api/regulations/search | Search regulations |
| POST | /api/regulations/subscribe | Subscribe to updates |
| GET | /api/ai-links/:caseId | Get AI links for case |
| POST | /api/ai-links/:caseId/generate | Generate AI links |
| POST | /api/ai-links/:linkId/verify | Verify AI link |
| DELETE | /api/ai-links/:linkId | Dismiss AI link |
| GET | /api/cases/:caseId/documents | List case documents |
| POST | /api/cases/:caseId/documents | Upload document |
| GET | /api/documents/:docId/download | Download document |
| DELETE | /api/documents/:docId | Delete document |
| GET | /api/clients | List clients |
| GET | /api/clients/:id | Get client details |
| GET | /api/clients/:id/cases | Get client's cases |
| POST | /api/clients | Create client |
| PUT | /api/clients/:id | Update client |
| DELETE | /api/clients/:id | Delete client |
| GET | /api/alerts | List alerts |
| PATCH | /api/alerts/:id/read | Mark alert as read |
| PATCH | /api/alerts/read-all | Mark all alerts read |
| GET | /api/profile | Get user profile |
| PUT | /api/profile | Update profile |
| PUT | /api/profile/password | Change password |
| GET | /api/settings/notifications | Get notification settings |
| PUT | /api/settings/notifications | Update notification settings |
| GET | /api/settings/organization | Get organization settings |
| PUT | /api/settings/organization | Update organization settings |
