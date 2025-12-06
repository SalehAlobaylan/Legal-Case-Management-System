## Health

```bash
curl http://localhost:3000/health
```

## Auth

### Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "fullName": "Test User",
    "organizationId": 1
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### Get current user (`/api/auth/me`)

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

## Cases (protected)

### Create case

```bash
curl -X POST http://localhost:3000/api/cases \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "caseNumber": "2025-0001",
    "title": "Example case title",
    "description": "Short description of the case",
    "caseType": "civil",
    "status": "open",
    "clientInfo": "Client Name, contact info",
    "courtJurisdiction": "Riyadh Court",
    "filingDate": "2025-12-06",
    "nextHearing": "2025-12-20T10:00:00.000Z"
  }'
```

### List cases (with optional filters)

```bash
curl "http://localhost:3000/api/cases?status=open&caseType=civil" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Get case by ID

```bash
curl http://localhost:3000/api/cases/1 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Update case

```bash
curl -X PUT http://localhost:3000/api/cases/1 \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "nextHearing": "2025-12-25T09:30:00.000Z"
  }'
```

### Delete case

```bash
curl -X DELETE http://localhost:3000/api/cases/1 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

## Regulations (protected)

### Create regulation

```bash
curl -X POST http://localhost:3000/api/regulations \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Commercial Law Regulation",
    "regulationNumber": "CL-2025-01",
    "sourceUrl": "https://example.com/regulations/cl-2025-01",
    "category": "commercial_law",
    "jurisdiction": "Saudi Arabia",
    "status": "active",
    "effectiveDate": "2025-01-01"
  }'
```

### List regulations (with optional filters)

```bash
curl "http://localhost:3000/api/regulations?category=commercial_law&status=active" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Get regulation by ID

```bash
curl http://localhost:3000/api/regulations/1 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Update regulation

```bash
curl -X PUT http://localhost:3000/api/regulations/1 \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "amended",
    "effectiveDate": "2025-06-01"
  }'
```

### Get regulation versions

```bash
curl http://localhost:3000/api/regulations/1/versions \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

## AI Links (protected)

### Generate AI links for a case

```bash
curl -X POST http://localhost:3000/api/ai-links/1/generate \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Get AI links for a case

```bash
curl http://localhost:3000/api/ai-links/1 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Verify a specific link

```bash
curl -X POST http://localhost:3000/api/ai-links/123/verify \
  -H "Authorization: Bearer <JWT_TOKEN>"
```
