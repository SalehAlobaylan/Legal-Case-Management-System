# Profile Page API Requirements

This document outlines the API endpoints required to make the user profile page (`src/app/(dashboard)/profile/page.tsx`) fully functional.

## 1. User Profile Data
**Endpoint:** `GET /api/profile`
**Description:** Retrieve the current authenticated user's profile information.

**Response Body:**
```json
{
  "user": {
    "id": 1,
    "fullName": "Ahmed Al-Rashid",
    "role": "Senior Lawyer",
    "email": "ahmed@alrashid-law.sa",
    "phone": "+966 50 123 4567",
    "location": "Riyadh, Saudi Arabia",
    "bio": "Specialized in commercial law and corporate litigation with 15+ years of experience.",
    "avatarUrl": "https://example.com/uploads/avatars/user-1.jpg",
    "joinDate": "2024-01-15T00:00:00Z"
  }
}
```
**Notes:** 
- `location` field needs to be added to the backend model/response if not already present.
- `joinDate` corresponds to the user's `createdAt` or specific `joinedAt` timestamp.

---

## 2. Profile Update
**Endpoint:** `PUT /api/profile`
**Description:** Update the authenticated user's profile details.

**Request Body:**
```json
{
  "fullName": "Ahmed Al-Rashid",
  "phone": "+966 50 999 8888",
  "location": "Jeddah, Saudi Arabia",
  "bio": "Updated bio text..."
}
```

**Response Body:**
```json
{
  "user": {
    "id": 1,
    "fullName": "Ahmed Al-Rashid",
    // ... updated fields
  }
}
```

---

## 3. Avatar Upload
**Endpoint:** `POST /api/profile/avatar`
**Description:** Upload and update the user's profile picture.

**Request:** `multipart/form-data`
- `file`: The image file (jpg, png).

**Response Body:**
```json
{
  "avatarUrl": "https://example.com/uploads/avatars/new-image.jpg"
}
```

---

## 4. User Statistics (KPIs)
**Endpoint:** `GET /api/profile/stats`
**Description:** particular statistics for the user's profile cards.

**Response Body:**
```json
{
  "stats": {
    "activeCases": 12,        // Number of open/in-progress cases assigned to user
    "totalClients": 28,       // Total unique clients managed by user
    "winRate": 94,            // Calculated success percentage
    "avgCaseDuration": 45     // Average days to close a case
  }
}
```
**Notes:**
- If calculating `winRate` and `avgCaseDuration` is complex, the backend can return `null` or `0` initially.

---

## 5. Recent Activities
**Endpoint:** `GET /api/profile/activities`
**Description:** specific recent actions taken by the user (e.g., "Updated case X", "Uploaded document Y").

**Query Parameters:**
- `limit`: (Optional) Number of items to return, default 5.

**Response Body:**
```json
{
  "activities": [
    {
      "id": 101,
      "type": "case_update", // or "document_upload", "comment", etc.
      "description": "Updated the status of Case C-2024-001",
      "date": "2024-01-20T14:30:00Z"
    },
    {
      "id": 102,
      "type": "login",
      "description": "Logged in from new device",
      "date": "2024-01-19T09:00:00Z"
    }
  ]
}
```

---

## 6. Upcoming Hearings
**Endpoint:** `GET /api/profile/hearings`
(Or `GET /api/cases/hearings?user=me&upcoming=true`)
**Description:** Next scheduled hearings for cases assigned to this user.

**Response Body:**
```json
{
  "hearings": [
    {
      "id": 205,
      "caseId": 12,
      "caseName": "Al-Amoudi vs. TechSolutions",
      "caseNumber": "C-2024-001",
      "date": "2024-02-15",
      "time": "10:00 AM",
      "location": "Riyadh Labor Court, Hall 3"
    }
  ]
}
```
