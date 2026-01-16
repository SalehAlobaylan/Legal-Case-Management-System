# Database Seed Data

This document contains all the data required to seed the database for the Silah Legal Case Management System.

---

## 1. Organizations

```json
[
  {
    "id": 1,
    "name": "Al-Rashid Law Firm",
    "name_ar": "مكتب الراشد للمحاماة",
    "email": "info@alrashid-law.sa",
    "phone": "+966 11 234 5678",
    "address": "King Fahd Road, Riyadh, Saudi Arabia",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

## 2. Users

```json
[
  {
    "id": 1,
    "email": "ahmed@alrashid-law.sa",
    "password": "hashed_password_here",
    "full_name": "Ahmed Al-Rashid",
    "role": "admin",
    "organization_id": 1,
    "phone": "+966 50 123 4567",
    "bio": "Founder and managing partner with 20 years of experience in commercial law.",
    "avatar_url": null,
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 2,
    "email": "fatima@alrashid-law.sa",
    "password": "hashed_password_here",
    "full_name": "Fatima Al-Zahrani",
    "role": "senior_lawyer",
    "organization_id": 1,
    "phone": "+966 50 234 5678",
    "bio": "Senior attorney specializing in labor disputes.",
    "avatar_url": null,
    "created_at": "2024-01-15T00:00:00Z"
  },
  {
    "id": 3,
    "email": "omar@alrashid-law.sa",
    "password": "hashed_password_here",
    "full_name": "Omar Hassan",
    "role": "lawyer",
    "organization_id": 1,
    "phone": "+966 50 345 6789",
    "bio": "Associate attorney focusing on civil and commercial matters.",
    "avatar_url": null,
    "created_at": "2024-02-01T00:00:00Z"
  },
  {
    "id": 4,
    "email": "sara@alrashid-law.sa",
    "password": "hashed_password_here",
    "full_name": "Sara Al-Otaibi",
    "role": "paralegal",
    "organization_id": 1,
    "phone": "+966 50 456 7890",
    "bio": "Experienced paralegal with expertise in case documentation.",
    "avatar_url": null,
    "created_at": "2024-02-15T00:00:00Z"
  },
  {
    "id": 5,
    "email": "khalid@alrashid-law.sa",
    "password": "hashed_password_here",
    "full_name": "Khalid Al-Mutairi",
    "role": "clerk",
    "organization_id": 1,
    "phone": "+966 50 567 8901",
    "bio": "Legal clerk handling administrative and filing tasks.",
    "avatar_url": null,
    "created_at": "2024-03-01T00:00:00Z"
  }
]
```

---

## 3. Clients

```json
[
  {
    "id": 1,
    "organization_id": 1,
    "name": "TechSolutions Ltd",
    "type": "company",
    "contact_email": "legal@techsolutions.sa",
    "contact_phone": "+966 11 987 6543",
    "address": "Olaya District, Riyadh",
    "notes": "Major technology company, ongoing retainer agreement.",
    "created_at": "2024-01-10T00:00:00Z"
  },
  {
    "id": 2,
    "organization_id": 1,
    "name": "Mohammed Al-Amoudi",
    "type": "individual",
    "contact_email": "m.alamoudi@email.com",
    "contact_phone": "+966 55 111 2222",
    "address": "Jeddah, Saudi Arabia",
    "notes": "Labor dispute client, referred by TechSolutions.",
    "created_at": "2024-03-15T00:00:00Z"
  },
  {
    "id": 3,
    "organization_id": 1,
    "name": "Al-Rahman Family Estate",
    "type": "individual",
    "contact_email": "alrahman.estate@email.com",
    "contact_phone": "+966 55 333 4444",
    "address": "Dammam, Saudi Arabia",
    "notes": "Inheritance dispute case, multiple beneficiaries.",
    "created_at": "2024-06-01T00:00:00Z"
  },
  {
    "id": 4,
    "organization_id": 1,
    "name": "Gulf Construction Co.",
    "type": "company",
    "contact_email": "legal@gulfconstruction.sa",
    "contact_phone": "+966 11 555 6666",
    "address": "King Abdullah Road, Riyadh",
    "notes": "Construction company, liability and contract matters.",
    "created_at": "2024-07-01T00:00:00Z"
  },
  {
    "id": 5,
    "organization_id": 1,
    "name": "Nasser Al-Dosari",
    "type": "individual",
    "contact_email": "n.aldosari@email.com",
    "contact_phone": "+966 55 777 8888",
    "address": "Khobar, Saudi Arabia",
    "notes": "Employment termination dispute.",
    "created_at": "2024-08-01T00:00:00Z"
  }
]
```

---

## 4. Cases

```json
[
  {
    "id": 1,
    "organization_id": 1,
    "case_number": "C-2024-001",
    "title": "Al-Amoudi vs. TechSolutions Ltd",
    "description": "Labor dispute regarding wrongful termination and unpaid compensation.",
    "case_type": "labor",
    "status": "open",
    "client_info": "Mohammed Al-Amoudi",
    "assigned_lawyer_id": 2,
    "court_jurisdiction": "Riyadh Labor Court",
    "filing_date": "2024-12-01",
    "next_hearing": "2025-01-20",
    "created_at": "2024-12-01T00:00:00Z",
    "updated_at": "2024-12-25T00:00:00Z"
  },
  {
    "id": 2,
    "organization_id": 1,
    "case_number": "C-2024-002",
    "title": "Estate of Sheikh H. Al-Rahman",
    "description": "Inheritance dispute involving real estate and financial assets.",
    "case_type": "civil",
    "status": "in_progress",
    "client_info": "Al-Rahman Family Estate",
    "assigned_lawyer_id": 1,
    "court_jurisdiction": "Dammam Civil Court",
    "filing_date": "2024-11-15",
    "next_hearing": "2025-02-10",
    "created_at": "2024-11-15T00:00:00Z",
    "updated_at": "2024-12-24T00:00:00Z"
  },
  {
    "id": 3,
    "organization_id": 1,
    "case_number": "C-2024-003",
    "title": "Construction Liability Case",
    "description": "Contract dispute and construction defects liability claim.",
    "case_type": "commercial",
    "status": "pending_hearing",
    "client_info": "Gulf Construction Co.",
    "assigned_lawyer_id": 3,
    "court_jurisdiction": "Riyadh Commercial Court",
    "filing_date": "2024-10-20",
    "next_hearing": "2025-01-15",
    "created_at": "2024-10-20T00:00:00Z",
    "updated_at": "2024-12-20T00:00:00Z"
  },
  {
    "id": 4,
    "organization_id": 1,
    "case_number": "C-2024-004",
    "title": "Al-Dosari Employment Termination",
    "description": "Dispute over employment contract termination and severance pay.",
    "case_type": "labor",
    "status": "open",
    "client_info": "Nasser Al-Dosari",
    "assigned_lawyer_id": 2,
    "court_jurisdiction": "Dammam Labor Court",
    "filing_date": "2024-12-10",
    "next_hearing": "2025-02-01",
    "created_at": "2024-12-10T00:00:00Z",
    "updated_at": "2024-12-22T00:00:00Z"
  },
  {
    "id": 5,
    "organization_id": 1,
    "case_number": "C-2023-015",
    "title": "TechSolutions IP Dispute",
    "description": "Intellectual property dispute with former partner.",
    "case_type": "commercial",
    "status": "closed",
    "client_info": "TechSolutions Ltd",
    "assigned_lawyer_id": 1,
    "court_jurisdiction": "Riyadh Commercial Court",
    "filing_date": "2023-06-01",
    "next_hearing": null,
    "created_at": "2023-06-01T00:00:00Z",
    "updated_at": "2024-09-15T00:00:00Z"
  }
]
```

---

## 5. Regulations

```json
[
  {
    "id": 1,
    "title": "Saudi Labor Law",
    "regulation_number": "M/51",
    "category": "labor",
    "jurisdiction": "Kingdom of Saudi Arabia",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 2,
    "title": "Commercial Court Law",
    "regulation_number": "M/93",
    "category": "commercial",
    "jurisdiction": "Kingdom of Saudi Arabia",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 3,
    "title": "Civil Transactions Law",
    "regulation_number": "M/191",
    "category": "civil",
    "jurisdiction": "Kingdom of Saudi Arabia",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  etik
  {
    "id": 4,
    "title": "Personal Status Law",
    "regulation_number": "M/73",
    "category": "family",
    "jurisdiction": "Kingdom of Saudi Arabia",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 5,
    "title": "Construction Contract Regulations",
    "regulation_number": "CC/2020",
    "category": "commercial",
    "jurisdiction": "Kingdom of Saudi Arabia",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 6,
    "title": "Labor Law Article 77 (Amendment)",
    "regulation_number": "M/51-A77",
    "category": "labor",
    "jurisdiction": "Kingdom of Saudi Arabia",
    "status": "amended",
    "created_at": "2024-11-01T00:00:00Z"
  }
]
```

---

## 6. Regulation Versions

```json
[
  {
    "id": 1,
    "regulation_id": 1,
    "version_number": 1,
    "effective_date": "2005-09-27",
    "content_text": "Original Saudi Labor Law establishing worker rights and employer obligations.",
    "content_hash": "abc123",
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 2,
    "regulation_id": 6,
    "version_number": 1,
    "effective_date": "2024-11-15",
    "content_text": "Amendment to Article 77 regarding compensation calculation for arbitrary dismissal. New formula for calculating end-of-service benefits.",
    "content_hash": "def456",
    "created_at": "2024-11-15T00:00:00Z"
  }
]
```

---

## 7. Case-Regulation Links

```json
[
  {
    "id": 1,
    "case_id": 1,
    "regulation_id": 1,
    "similarity_score": 0.92,
    "method": "ai",
    "verified": true,
    "created_at": "2024-12-01T00:00:00Z"
  },
  {
    "id": 2,
    "case_id": 1,
    "regulation_id": 6,
    "similarity_score": 0.88,
    "method": "ai",
    "verified": false,
    "created_at": "2024-12-15T00:00:00Z"
  },
  {
    "id": 3,
    "case_id": 2,
    "regulation_id": 3,
    "similarity_score": 0.95,
    "method": "manual",
    "verified": true,
    "created_at": "2024-11-15T00:00:00Z"
  },
  {
    "id": 4,
    "case_id": 3,
    "regulation_id": 2,
    "similarity_score": 0.85,
    "method": "ai",
    "verified": true,
    "created_at": "2024-10-20T00:00:00Z"
  },
  {
    "id": 5,
    "case_id": 3,
    "regulation_id": 5,
    "similarity_score": 0.91,
    "method": "ai",
    "verified": true,
    "created_at": "2024-10-25T00:00:00Z"
  }
]
```

---

## 8. Documents

```json
[
  {
    "id": 1,
    "case_id": 1,
    "file_name": "employment_contract.pdf",
    "file_path": "/uploads/cases/1/employment_contract.pdf",
    "file_size": 245760,
    "mime_type": "application/pdf",
    "uploaded_by": 2,
    "created_at": "2024-12-01T00:00:00Z"
  },
  {
    "id": 2,
    "case_id": 1,
    "file_name": "termination_letter.pdf",
    "file_path": "/uploads/cases/1/termination_letter.pdf",
    "file_size": 102400,
    "mime_type": "application/pdf",
    "uploaded_by": 2,
    "created_at": "2024-12-02T00:00:00Z"
  },
  {
    "id": 3,
    "case_id": 2,
    "file_name": "estate_inventory.docx",
    "file_path": "/uploads/cases/2/estate_inventory.docx",
    "file_size": 512000,
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "uploaded_by": 1,
    "created_at": "2024-11-16T00:00:00Z"
  },
  {
    "id": 4,
    "case_id": 3,
    "file_name": "construction_contract.pdf",
    "file_path": "/uploads/cases/3/construction_contract.pdf",
    "file_size": 1048576,
    "mime_type": "application/pdf",
    "uploaded_by": 3,
    "created_at": "2024-10-20T00:00:00Z"
  }
]
```

---

## 9. Alerts

```json
[
  {
    "id": 1,
    "user_id": 1,
    "type": "regulation_update",
    "title": "New Amendment to Labor Law",
    "message": "Article 77 has been revised regarding compensation calculation for arbitrary dismissal.",
    "is_read": false,
    "metadata": { "regulation_id": 6, "link_url": "/regulations/6" },
    "created_at": "2024-12-20T00:00:00Z"
  },
  {
    "id": 2,
    "user_id": 1,
    "type": "ai_suggestion",
    "title": "New Regulation Match Found",
    "message": "AI discovered a relevant regulation for case C-2024-001.",
    "is_read": false,
    "metadata": { "case_id": 1, "regulation_id": 6 },
    "created_at": "2024-12-19T00:00:00Z"
  },
  {
    "id": 3,
    "user_id": 2,
    "type": "case_update",
    "title": "Hearing Scheduled",
    "message": "Next hearing for Al-Amoudi case scheduled for Jan 20, 2025.",
    "is_read": true,
    "metadata": { "case_id": 1 },
    "created_at": "2024-12-18T00:00:00Z"
  },
  {
    "id": 4,
    "user_id": 1,
    "type": "system",
    "title": "MoJ System Maintenance",
    "message": "Scheduled for Friday 2:00 AM. Some services may be unavailable.",
    "is_read": false,
    "metadata": null,
    "created_at": "2024-12-21T00:00:00Z"
  },
  {
    "id": 5,
    "user_id": 3,
    "type": "document_upload",
    "title": "New Document Added",
    "message": "Construction contract uploaded to case C-2024-003.",
    "is_read": true,
    "metadata": { "case_id": 3, "document_id": 4 },
    "created_at": "2024-10-20T00:00:00Z"
  }
]
```

---

## 10. Regulation Subscriptions

```json
[
  {
    "id": 1,
    "organization_id": 1,
    "regulation_id": 1,
    "source_url": "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/labor",
    "last_checked_at": "2024-12-20T00:00:00Z",
    "last_content_hash": "xyz789",
    "check_interval_hours": 24,
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z"
  },
  {
    "id": 2,
    "organization_id": 1,
    "regulation_id": 2,
    "source_url": "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/commercial",
    "last_checked_at": "2024-12-20T00:00:00Z",
    "last_content_hash": "uvw456",
    "check_interval_hours": 24,
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

## Summary Statistics

| Entity | Count |
|--------|-------|
| Organizations | 1 |
| Users | 5 |
| Clients | 5 |
| Cases | 5 |
| Regulations | 6 |
| Regulation Versions | 2 |
| Case-Regulation Links | 5 |
| Documents | 4 |
| Alerts | 5 |
| Regulation Subscriptions | 2 |

---

## Enum Values Reference

### CaseType
- `criminal`, `civil`, `commercial`, `labor`, `family`, `administrative`

### CaseStatus
- `open`, `in_progress`, `pending_hearing`, `closed`, `archived`

### UserRole
- `admin`, `senior_lawyer`, `lawyer`, `paralegal`, `clerk`

### ClientType
- `individual`, `company`

### RegulationStatus
- `active`, `amended`, `repealed`, `draft`

### AlertType
- `case_update`, `ai_suggestion`, `regulation_update`, `document_upload`, `system`
