# Multi-Organization Registration System - Backend Implementation Guide

## Overview

This document details the backend implementation of the multi-organization registration feature. The system now supports two registration modes:

1. **Join Existing Organization**: Users can register and join an existing organization (default role: `lawyer`)
2. **Create New Organization**: Users can create a new organization during registration (default role: `admin`)

---

## Database Schema Changes

### Organizations Table (`organizations`)

**Location**: `src/db/schema/organizations.ts`

**Changes Made**:
- Added `country` field (2-letter ISO code, default: 'SA')
- Added `subscriptionTier` field (default: 'free')

**Schema**:
```typescript
{
  id: serial (primary key)
  name: varchar(255) (not null)
  country: varchar(2) (default: 'SA')
  subscriptionTier: varchar(50) (default: 'free')
  licenseNumber: varchar(100) (unique)
  contactInfo: varchar(500)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Users Table (`users`)

**Location**: `src/db/schema/users.ts`

**Existing Structure** (no changes required):
- Already has `organizationId` foreign key referencing `organizations.id`
- On delete cascade: When organization is deleted, all users in that organization are deleted
- Default role: `lawyer`

**Schema**:
```typescript
{
  id: uuid (primary key)
  organizationId: integer (foreign key, not null)
  email: varchar(255) (unique, not null)
  passwordHash: varchar(255) (not null)
  fullName: varchar(255)
  phone: varchar(50)
  location: varchar(255)
  bio: text
  specialization: varchar(255)
  avatarUrl: varchar(500)
  role: enum('admin', 'senior_lawyer', 'lawyer', 'paralegal', 'clerk') (default: 'lawyer')
  createdAt: timestamp
  updatedAt: timestamp
  lastLogin: timestamp
}
```

---

## API Endpoints

### Authentication Routes

**Base Path**: `/api/auth`

#### POST /api/auth/register

**Description**: Register a new user with dual-mode support (join or create organization)

**Authentication**: Not required

**Request Body** (Mode 1 - Join Existing Organization):
```json
{
  "registrationType": "join",
  "email": "user@example.com",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123",
  "fullName": "John Doe",
  "organizationId": 1,
  "role": "lawyer" // Optional
}
```

**Request Body** (Mode 2 - Create New Organization):
```json
{
  "registrationType": "create",
  "email": "admin@example.com",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123",
  "fullName": "Jane Smith",
  "organizationName": "New Legal Firm",
  "country": "SA",
  "subscriptionTier": "free",
  "role": "admin" // Optional
}
```

**Validation Rules**:
- `email`: Must be valid email format
- `password`: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number
- `confirmPassword`: Must match `password`
- `fullName`: Minimum 2 characters
- `organizationId`: Required for "join" mode, positive integer
- `organizationName`: Required for "create" mode, minimum 2 characters
- `country`: Optional for "create" mode, 2-letter ISO code (default: 'SA')
- `subscriptionTier`: Optional for "create" mode (default: 'free')
- `role`: Optional, one of: 'admin', 'senior_lawyer', 'lawyer', 'paralegal', 'clerk'

**Success Response** (201):
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "John Doe",
    "organizationId": 1,
    "role": "lawyer",
    "createdAt": "2026-01-31T11:00:00.000Z",
    "updatedAt": "2026-01-31T11:00:00.000Z"
  },
  "token": "jwt-token-string"
}
```

**Error Responses**:
- `409 Conflict`: User with this email already exists
- `404 Not Found`: Organization not found (join mode)
- `400 Bad Request`: Validation errors (password mismatch, invalid email, etc.)

---

#### POST /api/auth/login

**Description**: Login an existing user

**Authentication**: Not required

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response** (200):
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "John Doe",
    "organizationId": 1,
    "role": "lawyer",
    "createdAt": "2026-01-31T11:00:00.000Z",
    "updatedAt": "2026-01-31T11:00:00.000Z",
    "lastLogin": "2026-01-31T12:00:00.000Z"
  },
  "token": "jwt-token-string"
}
```

---

#### GET /api/auth/me

**Description**: Get current authenticated user

**Authentication**: Required (Bearer token)

**Headers**:
```
Authorization: Bearer <jwt-token>
```

**Success Response** (200):
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "John Doe",
    "organizationId": 1,
    "role": "lawyer",
    "createdAt": "2026-01-31T11:00:00.000Z",
    "updatedAt": "2026-01-31T11:00:00.000Z"
  }
}
```

---

#### PATCH /api/auth/me

**Description**: Update current user profile

**Authentication**: Required (Bearer token)

**Request Body**:
```json
{
  "fullName": "John Updated Doe"
}
```

**Success Response** (200):
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "fullName": "John Updated Doe",
    "organizationId": 1,
    "role": "lawyer",
    "createdAt": "2026-01-31T11:00:00.000Z",
    "updatedAt": "2026-01-31T12:00:00.000Z"
  }
}
```

---

#### POST /api/auth/logout

**Description**: Logout user (client should clear token)

**Authentication**: Required

**Success Response** (200):
```json
{
  "message": "Logged out successfully"
}
```

---

### Organizations Routes

**Base Path**: `/api/organizations`

#### GET /api/organizations

**Description**: List all organizations (public endpoint for registration dropdown)

**Authentication**: Not required

**Success Response** (200):
```json
{
  "organizations": [
    {
      "id": 1,
      "name": "Legal Firm A",
      "country": "SA",
      "subscriptionTier": "free",
      "licenseNumber": "LIC-001",
      "contactInfo": "contact@legalfirma.com",
      "createdAt": "2026-01-31T11:00:00.000Z",
      "updatedAt": "2026-01-31T11:00:00.000Z"
    },
    {
      "id": 2,
      "name": "Legal Firm B",
      "country": "SA",
      "subscriptionTier": "premium",
      "licenseNumber": "LIC-002",
      "contactInfo": "contact@legalfirmb.com",
      "createdAt": "2026-01-31T11:00:00.000Z",
      "updatedAt": "2026-01-31T11:00:00.000Z"
    }
  ],
  "total": 2
}
```

---

#### GET /api/organizations/:id

**Description**: Get a single organization by ID

**Authentication**: Required

**Success Response** (200):
```json
{
  "organization": {
    "id": 1,
    "name": "Legal Firm A",
    "country": "SA",
    "subscriptionTier": "free",
    "licenseNumber": "LIC-001",
    "contactInfo": "contact@legalfirma.com",
    "createdAt": "2026-01-31T11:00:00.000Z",
    "updatedAt": "2026-01-31T11:00:00.000Z"
  }
}
```

---

#### POST /api/organizations

**Description**: Create a new organization

**Authentication**: Required

**Request Body**:
```json
{
  "name": "New Legal Firm",
  "country": "SA",
  "subscriptionTier": "free",
  "licenseNumber": "LIC-003",
  "contactInfo": "contact@newfirm.com"
}
```

**Success Response** (201):
```json
{
  "organization": {
    "id": 3,
    "name": "New Legal Firm",
    "country": "SA",
    "subscriptionTier": "free",
    "licenseNumber": "LIC-003",
    "contactInfo": "contact@newfirm.com",
    "createdAt": "2026-01-31T12:00:00.000Z",
    "updatedAt": "2026-01-31T12:00:00.000Z"
  }
}
```

---

#### PATCH /api/organizations/:id

**Description**: Update an existing organization

**Authentication**: Required

**Request Body** (all fields optional):
```json
{
  "name": "Updated Legal Firm",
  "country": "SA",
  "subscriptionTier": "premium"
}
```

**Success Response** (200):
```json
{
  "organization": {
    "id": 1,
    "name": "Updated Legal Firm",
    "country": "SA",
    "subscriptionTier": "premium",
    "licenseNumber": "LIC-001",
    "contactInfo": "contact@legalfirma.com",
    "createdAt": "2026-01-31T11:00:00.000Z",
    "updatedAt": "2026-01-31T12:00:00.000Z"
  }
}
```

---

#### DELETE /api/organizations/:id

**Description**: Delete an organization (cascades to all users in the organization)

**Authentication**: Required

**Success Response** (200):
```json
{
  "message": "Organization deleted successfully"
}
```

---

## Frontend Implementation Guide

### Registration Flow

#### Step 1: Fetch Organizations (for Join Mode)

```typescript
const fetchOrganizations = async () => {
  const response = await fetch('/api/organizations');
  const data = await response.json();
  return data.organizations;
};
```

#### Step 2: Registration Form Implementation

The registration form should have two modes:

**Mode 1 - Join Existing Organization**:
```typescript
{
  registrationType: 'join',
  email: string,
  password: string,
  confirmPassword: string,
  fullName: string,
  organizationId: number, // Selected from dropdown
  role?: string // Optional
}
```

**Mode 2 - Create New Organization**:
```typescript
{
  registrationType: 'create',
  email: string,
  password: string,
  confirmPassword: string,
  fullName: string,
  organizationName: string,
  country?: string, // Optional, default 'SA'
  subscriptionTier?: string, // Optional, default 'free'
  role?: string // Optional
}
```

#### Step 3: Submit Registration

```typescript
const registerUser = async (formData: RegisterInput) => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }

  const data = await response.json();
  
  // Store token and user
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
};
```

### Password Validation

Frontend should implement the same validation rules as backend:

- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)

### Error Handling

Common error scenarios:

| Error | Status Code | Message | Frontend Action |
|-------|--------------|---------|-----------------|
| Email already exists | 409 | User with this email already exists | Show error, suggest login |
| Organization not found | 404 | Organization not found | Refresh organizations list |
| Password mismatch | 400 | Passwords do not match | Show inline error |
| Invalid email | 400 | Invalid email | Show inline error |
| Password too weak | 400 | Password must contain at least one uppercase letter... | Show inline error |

### Login Flow

```typescript
const loginUser = async (email: string, password: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Invalid credentials');
  }

  const data = await response.json();
  
  // Store token and user
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
};
```

### Authenticated Requests

For authenticated requests, include the Bearer token:

```typescript
const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
};
```

---

## TypeScript Types

### RegisterInput Types

```typescript
type RegisterInput =
  | {
      registrationType: 'join';
      email: string;
      password: string;
      confirmPassword: string;
      fullName: string;
      organizationId: number;
      role?: 'admin' | 'senior_lawyer' | 'lawyer' | 'paralegal' | 'clerk';
    }
  | {
      registrationType: 'create';
      email: string;
      password: string;
      confirmPassword: string;
      fullName: string;
      organizationName: string;
      country?: string;
      subscriptionTier?: string;
      role?: 'admin' | 'senior_lawyer' | 'lawyer' | 'paralegal' | 'clerk';
    };
```

### User Type

```typescript
type User = {
  id: string;
  email: string;
  fullName: string;
  organizationId: number;
  role: 'admin' | 'senior_lawyer' | 'lawyer' | 'paralegal' | 'clerk';
  createdAt: string;
  updatedAt: string;
};
```

### Organization Type

```typescript
type Organization = {
  id: number;
  name: string;
  country: string;
  subscriptionTier: string;
  licenseNumber?: string;
  contactInfo?: string;
  createdAt: string;
  updatedAt: string;
};
```

---

## Testing

### Test Cases

#### Join Mode Registration

1. **Success Case**:
   - Call GET /api/organizations to get list
   - Select an organization
   - Submit registration with valid data
   - Verify user is created with `role: 'lawyer'`
   - Verify `organizationId` matches selected org

2. **Invalid Organization**:
   - Submit registration with non-existent `organizationId`
   - Verify 404 error

3. **Email Exists**:
   - Register with existing email
   - Verify 409 error

#### Create Mode Registration

1. **Success Case**:
   - Submit registration with valid organization data
   - Verify organization is created
   - Verify user is created with `role: 'admin'`
   - Verify `organizationId` matches new org

2. **Duplicate Org Name**:
   - Submit registration with existing organization name
   - Verify 409 error

#### Password Validation

1. Test with 7 characters (should fail)
2. Test with 8 characters but no uppercase (should fail)
3. Test with 8 characters but no lowercase (should fail)
4. Test with 8 characters but no number (should fail)
5. Test with valid password (should succeed)

---

## Migration Notes

### Database Migration

The database schema changes require a migration. Create and run:

```bash
npm run db:generate  # Generate migration
npm run db:migrate    # Run migration
```

### Breaking Changes

None. The new registration endpoints are backward compatible.

---

## Support

For questions or issues:
- Backend API Documentation: Available at `/docs` when server is running
- OpenAPI/Swagger: Available at `/docs/swagger.json`
- Contact Backend Team: [Insert contact info]

---

## Changelog

### Version 1.0.0 (2026-01-31)

**Added**:
- Dual-mode registration (join/create organization)
- Organizations CRUD API
- Enhanced password validation
- Country and subscription tier fields for organizations
- Comprehensive API documentation

**Modified**:
- `/api/auth/register` endpoint to support dual-mode registration
- Organization schema with new fields

**Fixed**:
- N/A

---

*Last Updated: 2026-01-31*
