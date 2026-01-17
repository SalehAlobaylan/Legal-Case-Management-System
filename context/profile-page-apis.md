# Profile Page API Requirements

APIs needed to support the enhanced Profile page features.

---

## 1. User Profile API

### GET `/api/users/me` - Get Current User Profile
Returns the authenticated user's complete profile.

```json
{
  "user": {
    "id": 1,
    "email": "faisal@alfaisal.law",
    "fullName": "Faisal Al-Otaibi",
    "phone": "+966 50 123 4567",
    "location": "Riyadh, Saudi Arabia",
    "bio": "Experienced lawyer specializing in commercial law...",
    "specialization": "Commercial & Labor Law",
    "avatarUrl": "/avatars/1.jpg",
    "role": "lawyer",
    "organizationId": 1,
    "organizationName": "Al-Faisal Law Firm",
    "createdAt": "2024-01-15T00:00:00Z"
  }
}
```

### PUT `/api/users/me` - Update Profile
Updates the current user's editable fields.

**Request:**
```json
{
  "fullName": "Faisal Al-Otaibi",
  "phone": "+966 50 123 4567",
  "location": "Riyadh, Saudi Arabia",
  "bio": "Updated bio text...",
  "specialization": "Commercial Law"
}
```

---

## 2. User Statistics API

### GET `/api/users/me/stats` - Get User Performance Stats
Returns all statistics for the profile page.

```json
{
  "stats": {
    "cases": {
      "total": 24,
      "active": 12,
      "pending": 2,
      "closed": 10,
      "wonCount": 9,
      "lostCount": 1
    },
    "performance": {
      "winRate": 87,
      "winRateChange": 5,
      "avgCaseDurationDays": 45,
      "durationChange": -8,
      "clientSatisfactionRate": 94,
      "satisfactionChange": 3
    },
    "productivity": {
      "totalBillableHours": 1240,
      "thisMonthHours": 168,
      "hoursChange": 12,
      "regulationsReviewed": 156,
      "documentsProcessed": 342,
      "aiSuggestionsTotal": 200,
      "aiSuggestionsAccepted": 156
    },
    "achievements": [
      {
        "id": 1,
        "title": "Top Performer",
        "description": "Lawyer of the Month",
        "awardedAt": "2024-12-01T00:00:00Z",
        "icon": "award"
      }
    ]
  }
}
```

---

## 3. Activity Feed API

### GET `/api/users/me/activity` - Get Recent Activity
Returns recent user activity for the timeline.

**Query Params:** `?limit=10`

```json
{
  "activities": [
    {
      "id": 1,
      "type": "case",
      "action": "created",
      "title": "Al-Amoudi vs. TechSolutions",
      "referenceId": 123,
      "createdAt": "2024-12-17T10:30:00Z"
    },
    {
      "id": 2,
      "type": "regulation",
      "action": "reviewed",
      "title": "Labor Law Amendment",
      "referenceId": 45,
      "createdAt": "2024-12-17T07:00:00Z"
    }
  ]
}
```

**Activity Types:** `case`, `regulation`, `document`, `client`
**Action Types:** `created`, `updated`, `closed`, `reviewed`, `uploaded`

---

## 4. Avatar Upload API

### POST `/api/users/me/avatar` - Upload Avatar
Upload a new profile picture.

**Request:** `multipart/form-data` with `avatar` file field

**Response:**
```json
{
  "avatarUrl": "/avatars/1-updated.jpg"
}
```

---

## Implementation Priority

| API | Priority | Notes |
|-----|----------|-------|
| `GET /api/users/me` | High | Core profile data |
| `PUT /api/users/me` | High | Enable editing |
| `GET /api/users/me/stats` | High | Main feature - stats |
| `GET /api/users/me/activity` | Medium | Enhancement |
| `POST /api/users/me/avatar` | Low | Nice-to-have |
