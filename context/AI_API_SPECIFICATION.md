# AI Microservice API Specification

This document specifies the API endpoints that the **AI microservice** must implement to support the Legal Case Management System backend.

**Base URL:** Configured via `AI_SERVICE_URL` environment variable (e.g., `http://ai-service:8000`)

---

## Overview

The backend system requires the following AI capabilities:

| Endpoint | Purpose |
|----------|---------|
| `POST /embed/` | Generate text embeddings for semantic search |
| `POST /similarity/find-related` | Find relevant regulations for a case |
| `POST /chat` | Legal assistant conversational AI |
| `POST /analyze-case` | Case strategy analysis |
| `POST /summarize-document` | Document summarization |

---

## Endpoints

### POST `/embed/`

Generate embedding vectors for text input. Used for semantic search and similarity matching.

**Request:**
```json
{
  "texts": ["Saudi Labor Law Article 77 regarding termination..."],
  "normalize": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `texts` | string[] | Yes | Array of texts to embed (typically 1 item) |
| `normalize` | boolean | No | Whether to L2-normalize the embeddings (default: true) |

**Response:** `200 OK`
```json
{
  "embeddings": [[0.123, -0.456, 0.789, ...]],
  "dimension": 768,
  "count": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `embeddings` | number[][] | Array of embedding vectors |
| `dimension` | number | Embedding dimension (e.g., 768, 1536) |
| `count` | number | Number of embeddings returned |

---

### POST `/similarity/find-related`

Find regulations most relevant to a given case text. Used for AI-powered case-regulation linking.

**Request:**
```json
{
  "case_text": "Labor dispute regarding wrongful termination...",
  "top_k": 10,
  "threshold": 0.3
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `case_text` | string | Yes | Case title + description combined |
| `top_k` | number | No | Maximum number of results (default: 10) |
| `threshold` | number | No | Minimum similarity score (default: 0.3) |

**Response:** `200 OK`
```json
{
  "related_regulations": [
    {
      "regulation_id": 6,
      "similarity_score": 0.92,
      "title": "Saudi Labor Law",
      "category": "labor"
    },
    {
      "regulation_id": 1,
      "similarity_score": 0.78,
      "title": "Commercial Court Procedures",
      "category": "commercial"
    }
  ],
  "query_length": 245,
  "candidates_count": 50
}
```

| Field | Type | Description |
|-------|------|-------------|
| `related_regulations` | array | Matched regulations sorted by score descending |
| `related_regulations[].regulation_id` | number | ID from backend `regulations` table |
| `related_regulations[].similarity_score` | number | Score between 0 and 1 |
| `related_regulations[].title` | string | Regulation title for display |
| `related_regulations[].category` | string | Regulation category |
| `query_length` | number | Length of query text (optional) |
| `candidates_count` | number | Total candidates evaluated (optional) |

---

### POST `/chat`

Legal assistant chat interface for answering questions with context from cases and regulations.

**Request:**
```json
{
  "message": "What are the precedents for wrongful termination cases?",
  "context": {
    "caseText": "Case: Labor Dispute\nType: labor\nDescription: Employee claims...",
    "regulationTexts": [
      "Saudi Labor Law (M/51): labor",
      "Employment Compensation Procedures (EC-2020): labor"
    ]
  },
  "history": [
    { "role": "user", "content": "What laws apply to this case?" },
    { "role": "assistant", "content": "Based on the case type, the Saudi Labor Law..." }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | Current user message |
| `context` | object | No | Contextual information |
| `context.caseText` | string | No | Formatted case details |
| `context.regulationTexts` | string[] | No | Related regulation summaries |
| `history` | array | No | Previous conversation messages |
| `history[].role` | string | Yes | "user" or "assistant" |
| `history[].content` | string | Yes | Message content |

**Response:** `200 OK`
```json
{
  "response": "Based on the provided case details and Saudi Labor Law Article 77, wrongful termination claims typically require...",
  "citations": [
    {
      "source": "Saudi Labor Law",
      "article": "77",
      "link": "/regulations/6"
    },
    {
      "source": "Employment Compensation Procedures",
      "article": "12",
      "link": "/regulations/8"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `response` | string | AI-generated response text |
| `citations` | array | Legal sources referenced |
| `citations[].source` | string | Source name (regulation title) |
| `citations[].article` | string | Specific article/section (optional) |
| `citations[].link` | string | Frontend link to regulation (optional) |

---

### POST `/analyze-case`

Generate comprehensive AI analysis of a legal case including strategy recommendations.

**Request:**
```json
{
  "title": "Al-Amoudi vs. TechSolutions Ltd",
  "description": "Labor dispute regarding wrongful termination and unpaid compensation...",
  "case_type": "labor",
  "status": "open",
  "court_jurisdiction": "Riyadh Labor Court"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Case title |
| `description` | string | No | Detailed case description |
| `case_type` | string | Yes | One of: labor, commercial, civil, criminal, administrative, family |
| `status` | string | Yes | One of: open, in_progress, pending, closed, won, lost |
| `court_jurisdiction` | string | No | Court handling the case |

**Response:** `200 OK`
```json
{
  "summary": "This case revolves around a wrongful termination claim by an employee against TechSolutions Ltd. The employee alleges...",
  "strengths": [
    "Strong documentation of employment contract violations",
    "Clear violation of Saudi Labor Law Article 77",
    "Multiple witness statements supporting the claim"
  ],
  "weaknesses": [
    "Lack of documentation for verbal agreements",
    "Approaching statute of limitations deadline",
    "Previous disciplinary record of the employee"
  ],
  "recommendedStrategy": "Focus on negotiation for settlement given the strong evidence supporting the claim. If settlement fails, proceed with formal litigation emphasizing the documented contract violations.",
  "successProbability": 0.75,
  "predictedTimeline": "3-6 months"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | Brief case summary |
| `strengths` | string[] | Factors favoring the case |
| `weaknesses` | string[] | Potential challenges |
| `recommendedStrategy` | string | Strategic advice |
| `successProbability` | number | Estimated success rate (0-1) |
| `predictedTimeline` | string | Expected case duration |

---

### POST `/summarize-document`

Generate AI summary of a legal document with clause analysis.

**Request:**
```json
{
  "content": "EMPLOYMENT CONTRACT\n\nThis agreement is entered into on January 1, 2024...",
  "file_name": "employment_contract.pdf"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Full document text content |
| `file_name` | string | Yes | Original file name for context |

**Response:** `200 OK`
```json
{
  "summary": "This employment contract establishes a full-time employment relationship between TechSolutions Ltd and Employee B. The contract specifies a 2-year term with provisions for termination, compensation, and non-compete obligations.",
  "keyEntities": [
    "TechSolutions Ltd (Employer)",
    "Mohammed Al-Amoudi (Employee)",
    "Human Resources Department"
  ],
  "effectiveDate": "2024-01-01",
  "clauses": [
    {
      "title": "Termination Clause",
      "riskLevel": "high",
      "description": "Allows employer termination without cause with 30-day notice. May conflict with Saudi Labor Law Article 77."
    },
    {
      "title": "Non-Compete Agreement",
      "riskLevel": "medium",
      "description": "2-year non-compete restriction covering all GCC countries. May be overly broad."
    },
    {
      "title": "Compensation Package",
      "riskLevel": "low",
      "description": "Standard salary with annual performance bonus. Clear payment terms."
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | Document overview |
| `keyEntities` | string[] | Important parties/entities mentioned |
| `effectiveDate` | string | Document effective date (ISO format, optional) |
| `clauses` | array | Key clauses with risk analysis |
| `clauses[].title` | string | Clause name/type |
| `clauses[].riskLevel` | string | "low", "medium", or "high" |
| `clauses[].description` | string | Clause summary and risk explanation |

---

## Error Responses

All endpoints should return errors in this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable description",
    "details": {}
  }
}
```

### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid request data |
| 422 | PROCESSING_ERROR | Unable to process the input |
| 500 | INTERNAL_ERROR | AI service internal error |
| 503 | MODEL_UNAVAILABLE | AI model is not ready |

---

## Implementation Notes

### For the AI Microservice Developer

1. **Embedding Model**: Use a multilingual model supporting Arabic and English (e.g., `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` or OpenAI `text-embedding-3-small`)

2. **Regulation Storage**: The AI service needs access to regulation data for similarity search. Options:
   - Query the backend PostgreSQL database directly
   - Maintain a vector database (Pinecone, Qdrant, pgvector)
   - Sync regulation embeddings on startup

3. **LLM for Chat/Analysis**: Use GPT-4, Claude, or similar for:
   - `/chat` - Conversational responses with legal context
   - `/analyze-case` - Case strategy analysis
   - `/summarize-document` - Document understanding

4. **Performance**: The backend expects responses within reasonable time:
   - Embedding: < 500ms
   - Find related: < 2s
   - Chat/Analyze/Summarize: < 30s (can be streamed later)

5. **Authentication**: Currently no auth required between backend and AI service (internal network). Add API key if deploying externally.

---

## Testing the Integration

Once the AI service is running, test from the backend:

```bash
# Test embedding
curl -X POST http://localhost:8000/embed/ \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Test legal text"], "normalize": true}'

# Test find related
curl -X POST http://localhost:8000/similarity/find-related \
  -H "Content-Type: application/json" \
  -d '{"case_text": "Labor dispute", "top_k": 5}'

# Test chat
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Saudi Labor Law?", "context": {}, "history": []}'
```
