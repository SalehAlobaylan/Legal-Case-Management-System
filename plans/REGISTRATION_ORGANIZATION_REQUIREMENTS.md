# Registration Organization Logic - Backend Requirements

> **Document Type**: Backend API Requirements  
> **Created**: 2026-01-30  
> **Status**: Pending Implementation

## Problem Statement

The current registration flow has a limitation:
- Frontend collects an **organization name** (text input)
- Backend expects an **organization ID** (integer)
- All new users are currently hardcoded to `organizationId: 1`

This means users cannot create new organizations or join existing ones during registration.

---

## Required Backend Changes

### 1. New API Endpoint: List Organizations

**Purpose**: Allow frontend to display existing organizations for users who want to join.

```
GET /api/organizations
```

**Response**:
```json
{
  "organizations": [
    { "id": 1, "name": "Acme Law Firm" },
    { "id": 2, "name": "Justice Partners" }
  ]
}
```

**Notes**:
- Consider pagination if organization list grows large
- May need filtering/search capability

---

### 2. New API Endpoint: Create Organization

**Purpose**: Allow creation of a new organization during registration.

```
POST /api/organizations
```

**Request Body**:
```json
{
  "name": "New Law Firm Name"
}
```

**Response**:
```json
{
  "id": 3,
  "name": "New Law Firm Name",
  "createdAt": "2026-01-30T12:00:00Z"
}
```

---

### 3. Update Registration Endpoint

**Current Endpoint**: `POST /api/auth/register`

**Current Request Body**:
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "organizationId": 1
}
```

**New Request Body Options**:

#### Option A: Join Existing Organization
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "organizationId": 5,
  "registrationType": "join"
}
```

#### Option B: Create New Organization
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "organizationName": "My New Firm",
  "registrationType": "create"
}
```

**Backend Logic**:
1. If `registrationType === "create"`:
   - Create new organization with `organizationName`
   - Assign user to newly created organization
   - User becomes organization admin
2. If `registrationType === "join"`:
   - Validate `organizationId` exists
   - Assign user to existing organization
   - User gets default role (not admin)

---

## Frontend Implementation ✅ COMPLETED

The frontend has been updated in `src/app/(auth)/register/page.tsx`:

1. **Registration Type Toggle**: Two styled buttons to choose between:
   - "Create New" (with Building2 icon)
   - "Join Existing" (with Users icon)

2. **Conditional Form Fields**:
   - If "Create New": Shows organization name text input
   - If "Join Existing": Shows organization dropdown (currently uses mock data)

3. **Form Submission**:
   - Includes `registrationType` field ("create" or "join")
   - Sends either `organizationId` or `organizationName` based on selection

### TODO for Frontend (after backend is ready):
- Replace mock organizations with API call to `GET /api/organizations`
- Handle error responses from backend

---

## Database Considerations

### Organizations Table
Ensure the `organizations` table exists with at minimum:
```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Users Table
Ensure `organization_id` foreign key relationship:
```sql
ALTER TABLE users
ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
```

---

## Validation Rules

| Field | Validation |
|-------|------------|
| `organizationName` | Required if `registrationType === "create"`, min 2 chars, max 100 chars |
| `organizationId` | Required if `registrationType === "join"`, must exist in DB |
| `registrationType` | Required, enum: `"create"` or `"join"` |

---

## Error Responses

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Organization ID not found | 404 | `"Organization not found"` |
| Organization name already exists | 409 | `"Organization with this name already exists"` |
| Missing registration type | 400 | `"Registration type is required"` |
| Invalid registration type | 400 | `"Invalid registration type"` |

---

## Implementation Priority

1. **High**: Update registration endpoint to accept both modes
2. **High**: Create `GET /api/organizations` endpoint
3. **Medium**: Create `POST /api/organizations` endpoint (can be handled in registration)
4. **Low**: Add organization search/filter capability
