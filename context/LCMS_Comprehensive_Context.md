<!-- ========================================
File: LCMS_Comprehensive_Context.md
======================================== -->

# LCMS — Comprehensive Project Context (Full System)
**Legal Case Management System - Complete AI Agent Context Pack**  
*Generated: 2026-01-03 | For: Graduation Project LCMS | Team: 3 students*

## EXECUTIVE SUMMARY

LCMS is an **Arabic-first, AI-powered legal case management system** designed for Saudi legal practitioners. The system manages cases and regulations while using semantic AI to automatically suggest relevant regulations for each case. A critical supporting feature is the **Regulation Change Monitor** that tracks regulation updates and notifies users in real-time.

### Team Structure (3 Students)
1. **Backend/Full-stack Engineer** (You): Fastify + TypeScript + PostgreSQL + WebSocket orchestration
2. **Flutter Developer**: Mobile client with JWT auth and Socket.IO realtime
3. **Data Science/AI**: FastAPI microservice for embeddings + semantic similarity

---

## 1. SYSTEM ARCHITECTURE (COMPLETE PICTURE)

### 1.1 Microservices Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                             │
│  ┌──────────────────┐           ┌──────────────────┐        │
│  │   Web Client     │           │  Mobile Client   │        │
│  │   Next.js 14     │           │    Flutter 3.x   │        │
│  │   + shadcn/ui    │           │   + Provider     │        │
│  └──────────────────┘           └──────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                │ HTTP/WS
                    ┌───────────▼───────────┐
                    │   BACKEND API         │
                    │   (Fastify + TS)      │
                    │   - Auth (JWT)        │
                    │   - Case CRUD         │
                    │   - AI Orchestrator   │
                    │   - WebSocket Server  │
                    └───────────┬───────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌─────────────┐  ┌──────────┐  ┌──────────────┐
        │  PostgreSQL │  │   AI     │  │   MinIO/S3   │
        │  + pgvector │  │ Service  │  │  (Optional)  │
        │  + tsvector │  │ FastAPI  │  │  Documents   │
        └─────────────┘  └──────────┘  └──────────────┘
```

### 1.2 Technology Stack (Official)

#### Frontend (Web)
- **Framework**: Next.js 14 App Router (NOT Vite/SPA)
- **UI Library**: shadcn/ui + Radix UI primitives + Tailwind CSS
- **State Management**: 
  - Server state: TanStack Query (caching, invalidation, retries)
  - Client state: Zustand (auth, UI preferences)
- **Auth**: JWT (aligned with Fastify backend)
- **Realtime**: Socket.IO client
- **Language**: TypeScript

#### Frontend (Mobile)
- **Framework**: Flutter 3.x with Dart
- **State**: Provider
- **Network**: dio + retrofit
- **Realtime**: socket_io_client
- **Storage**: shared_preferences + flutter_secure_storage

#### Backend API (Orchestrator)
- **Framework**: Fastify + TypeScript (NOT NestJS - explicit choice)
- **Database ORM**: Drizzle ORM
- **Validation**: Zod schemas
- **Auth**: JWT (jsonwebtoken + bcrypt)
- **Realtime**: Socket.IO server
- **API Docs**: Fastify Swagger (OpenAPI 3.0)

#### AI Microservice
- **Framework**: FastAPI (Python 3.11+)
- **ML Library**: sentence-transformers + transformers (Hugging Face)
- **Primary Model**: BAAI/bge-m3 (multilingual, Arabic support, 8192 tokens)
- **Similarity**: Cosine similarity
- **Optional Reranker**: BAAI/bge-reranker-v2-m3
- **Deployment**: Docker + Uvicorn

#### Database & Storage
- **Primary DB**: PostgreSQL 15+
- **Vector Extension**: pgvector (for embeddings)
- **Full-text Search**: tsvector + tsquery + GIN indexes
- **Object Storage**: MinIO (S3-compatible) for PDFs/attachments
- **Caching**: Redis (optional, for scale)

---

## 2. CORE WORKFLOWS (END-TO-END SCENARIOS)

### 2.1 Case Creation → AI Linking (Critical Path)

**Step-by-step flow:**

1. **User Action**: Lawyer creates new case via Web/Flutter
   - Fills form: case number, title, description, type, client info, jurisdiction

2. **Backend Processing** (Fastify):
   ```
   POST /api/cases
   ├─ Validate input (Zod schema)
   ├─ Check multi-tenant scope (organization_id)
   ├─ Insert case into PostgreSQL
   └─ Trigger AI linking workflow
   ```

3. **AI Service Call** (Backend → FastAPI):
   ```
   POST /ai/find_related
   Body: {
     "text": "case.title + case.description",
     "top_k": 10,
     "threshold": 0.6
   }
   ```

4. **AI Processing** (FastAPI microservice):
   ```
   ├─ Load BGE-M3 model (cached in memory)
   ├─ Generate embedding for case text (768-dim vector)
   ├─ Perform cosine similarity vs all regulation embeddings
   ├─ Optional: Rerank top 20 → top 10 with reranker
   └─ Return: [{ regulation_id, score, method: "ai" }]
   ```

5. **Backend Post-processing**:
   ```
   ├─ Insert links into case_regulation_links table
   ├─ Emit WebSocket event: "case_links_refreshed"
   └─ Return response to client
   ```

6. **Client Update** (Realtime):
   ```
   ├─ WebSocket listener receives event
   ├─ TanStack Query invalidates: ["ai-links", caseId]
   ├─ Show toast: "AI suggestions ready"
   └─ UI auto-refreshes AI Suggestions tab
   ```

### 2.2 Regulation Monitoring & Change Detection (Smart Pipeline)

**Problem**: Track when Saudi Ministry of Justice updates a regulation.

**Solution**: Automated Regulation Synchronizer (NOT web scraping)

#### Phase 1: Discovery (Tavily API)

**User Action**: "Subscribe to Labor Law updates"

**System Response**:
```
1. User clicks "Monitor Regulation" in UI
2. System prompts: "Enter regulation name (e.g., Labor Law)"
3. Backend calls Tavily Search API:
   - Query: "Saudi Labor Law official document laws.moj.gov.sa latest version"
   - Tavily returns: exact URL + title
4. System saves to DB:
   - regulation_subscriptions table
   - Fields: org_id, source_url, last_checked, last_hash
```

#### Phase 2: Change Detection (3 Strategies)

**Strategy A: Metadata Check (Preferred)**
```
Every 24 hours (cron job):
├─ Send HEAD request to source_url
├─ Check HTTP headers:
│  ├─ Last-Modified: Thu, 15 Dec 2025 10:30:00 GMT
│  └─ ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
├─ Compare with last_checked timestamp
└─ If newer → Trigger ingestion workflow
```

**Strategy B: Checksum Hashing (Most Reliable)**
```
Every 24 hours:
├─ Fetch full content (HTTP GET)
├─ Extract text from HTML/PDF
├─ Calculate SHA-256 hash
├─ Compare with stored last_hash
└─ If different:
   ├─ Create new regulation_version record
   ├─ Regenerate embeddings (call AI service)
   ├─ Emit WebSocket: "regulation_updated"
   └─ Send notification to subscribed users
```

**Strategy C: AI-Driven Update Detection (Advanced)**
```
Weekly:
├─ Tavily Search: "amendments to Saudi Labor Law 2025/2026"
├─ If news found:
│  ├─ Extract mentioned regulation URLs
│  └─ Trigger Strategy B for those URLs
└─ Fallback to periodic Strategy B anyway
```

### 2.3 User Workflow: View AI Suggestions & Verify

**Scenario**: Lawyer reviews AI-suggested regulations for a case

**UI Flow** (Next.js):
```
1. Navigate to: /cases/[id]
2. Click "AI Suggestions" tab
3. View list of suggested regulations:
   ┌─────────────────────────────────────────┐
   │ 📋 Suggested Regulations (8 found)      │
   ├─────────────────────────────────────────┤
   │ ✅ Labor Law Article 77 - Termination   │
   │    Score: 0.87 | Method: AI | Verified  │
   │    [View] [Dismiss]                     │
   ├─────────────────────────────────────────┤
   │ 🔍 Labor Law Article 80 - Compensation  │
   │    Score: 0.79 | Method: AI             │
   │    [✓ Verify] [✗ Dismiss]               │
   └─────────────────────────────────────────┘
4. Actions:
   - Verify: PATCH /ai-links/{linkId}/verify → verified=true
   - Dismiss: DELETE /ai-links/{linkId} → removes from list
```

---

## 3. DATA MODEL (CANONICAL SCHEMA)

### 3.1 Core Entities (PostgreSQL Tables)

#### organizations
```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(2) DEFAULT 'SA',
  subscription_tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- admin, senior_lawyer, lawyer, paralegal, clerk
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
```

#### cases
```sql
CREATE TABLE cases (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) NOT NULL,
  case_number VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  case_type VARCHAR(50) NOT NULL, -- criminal, civil, commercial, labor, family, administrative
  status VARCHAR(50) NOT NULL, -- open, in_progress, pending_hearing, closed, archived
  client_info TEXT,
  assigned_lawyer_id INTEGER REFERENCES users(id),
  court_jurisdiction VARCHAR(255),
  filing_date DATE,
  next_hearing TIMESTAMPTZ,
  full_text_tsv TSVECTOR, -- For full-text search
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, case_number)
);
CREATE INDEX idx_cases_org ON cases(organization_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_tsv ON cases USING GIN(full_text_tsv);
```

#### regulations
```sql
CREATE TABLE regulations (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  regulation_number VARCHAR(100),
  category VARCHAR(100),
  jurisdiction VARCHAR(100) DEFAULT 'Saudi Arabia',
  status VARCHAR(50) NOT NULL, -- active, amended, repealed, draft
  current_version_id INTEGER,
  full_text_tsv TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_regulations_status ON regulations(status);
CREATE INDEX idx_regulations_tsv ON regulations USING GIN(full_text_tsv);
```

#### regulation_versions (Version History)
```sql
CREATE TABLE regulation_versions (
  id SERIAL PRIMARY KEY,
  regulation_id INTEGER REFERENCES regulations(id) NOT NULL,
  version_number INTEGER NOT NULL,
  effective_date DATE,
  source_url TEXT,
  content_text TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for change detection
  embedding VECTOR(768), -- pgvector: BGE-M3 embeddings
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(regulation_id, version_number)
);
CREATE INDEX idx_reg_versions_reg_id ON regulation_versions(regulation_id);
CREATE INDEX idx_reg_versions_embedding ON regulation_versions 
  USING hnsw(embedding vector_cosine_ops); -- Fast vector search
```

#### case_regulation_links (AI Glue Table)
```sql
CREATE TABLE case_regulation_links (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id) NOT NULL,
  regulation_id INTEGER REFERENCES regulations(id) NOT NULL,
  similarity_score DECIMAL(5,4), -- 0.0000 to 1.0000
  method VARCHAR(50) NOT NULL, -- 'ai', 'manual', 'hybrid'
  verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(case_id, regulation_id)
);
CREATE INDEX idx_links_case ON case_regulation_links(case_id);
CREATE INDEX idx_links_reg ON case_regulation_links(regulation_id);
```

#### regulation_subscriptions (Monitoring)
```sql
CREATE TABLE regulation_subscriptions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) NOT NULL,
  regulation_id INTEGER REFERENCES regulations(id),
  source_url TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  last_content_hash VARCHAR(64),
  check_interval_hours INTEGER DEFAULT 24,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subs_org ON regulation_subscriptions(organization_id);
CREATE INDEX idx_subs_active ON regulation_subscriptions(is_active) WHERE is_active = TRUE;
```

#### documents (Case Attachments)
```sql
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL, -- MinIO/S3 path
  file_size BIGINT,
  mime_type VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_docs_case ON documents(case_id);
```

### 3.2 Vector Storage Decision (RFC-001)

**Decision**: Use pgvector extension in PostgreSQL

**Rationale**:
- ✅ ACID compliance (transactions + foreign keys)
- ✅ Hybrid search (vector + SQL filters in same query)
- ✅ Simpler ops (one database instead of two)
- ✅ Sufficient for graduation-scale datasets (<100K regulations)
- ❌ NOT needed: Dedicated vector DB (Qdrant/Pinecone) = overkill

**Implementation**:
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Store embeddings
ALTER TABLE regulation_versions 
  ADD COLUMN embedding VECTOR(768);

-- Create HNSW index for fast similarity search
CREATE INDEX idx_reg_versions_embedding 
  ON regulation_versions 
  USING hnsw(embedding vector_cosine_ops);

-- Similarity query example
SELECT r.id, r.title, rv.similarity_score
FROM regulations r
JOIN LATERAL (
  SELECT regulation_id, 
         1 - (embedding <=> $1::vector) AS similarity_score
  FROM regulation_versions
  WHERE regulation_id = r.id
  ORDER BY embedding <=> $1::vector
  LIMIT 1
) rv ON rv.regulation_id = r.id
WHERE rv.similarity_score > 0.6
ORDER BY rv.similarity_score DESC
LIMIT 10;
```

---

## 4. BACKEND API (FASTIFY + TYPESCRIPT)

### 4.1 Why Fastify (Not NestJS)

**Explicit Choice**: Team prefers Fastify over NestJS

**Reasons**:
- ⚡ **Performance**: 2-3x faster than Express/NestJS
- 🎯 **Simplicity**: Less "magic", no heavy decorators
- 📘 **TypeScript-first**: Excellent generic typing
- 🔌 **Plugin System**: Clean modular architecture without DI complexity
- 📊 **JSON Schema**: Built-in validation + auto OpenAPI docs

### 4.2 Project Structure

```
backend/
├── src/
│   ├── app.ts                    # Fastify app factory
│   ├── server.ts                 # Server startup
│   ├── config/
│   │   └── env.ts                # Environment config
│   ├── plugins/
│   │   ├── auth.ts               # JWT authentication plugin
│   │   ├── database.ts           # Drizzle ORM connection
│   │   ├── swagger.ts            # OpenAPI docs
│   │   └── websocket.ts          # Socket.IO server
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── index.ts          # Route registration
│   │   │   ├── handlers.ts       # Login, register, logout
│   │   │   └── schemas.ts        # Zod schemas
│   │   ├── cases/
│   │   │   ├── index.ts
│   │   │   ├── handlers.ts       # CRUD operations
│   │   │   └── schemas.ts
│   │   ├── regulations/
│   │   ├── ai-links/
│   │   └── documents/
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── case.service.ts
│   │   ├── ai-client.service.ts  # HTTP client for AI microservice
│   │   └── monitoring.service.ts # Regulation change detection
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   └── migrations/
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   └── utils/
│       ├── logger.ts
│       └── errors.ts
├── package.json
├── tsconfig.json
└── Dockerfile
```

### 4.3 Key API Endpoints

#### Authentication
```
POST   /api/auth/register    # Create new user account
POST   /api/auth/login       # Get JWT token
POST   /api/auth/logout      # Invalidate session
GET    /api/auth/me          # Get current user info
```

#### Cases
```
GET    /api/cases            # List cases (filtered by org)
POST   /api/cases            # Create case (triggers AI)
GET    /api/cases/:id        # Get case details
PUT    /api/cases/:id        # Update case
DELETE /api/cases/:id        # Soft delete case
GET    /api/cases/:id/documents  # List case documents
POST   /api/cases/:id/documents  # Upload document
```

#### AI Links
```
GET    /api/ai-links/:caseId           # Get AI suggestions
POST   /api/ai-links/:caseId/generate  # Manually trigger AI
PATCH  /api/ai-links/:linkId/verify    # Mark as verified
DELETE /api/ai-links/:linkId           # Dismiss suggestion
```

#### Regulations
```
GET    /api/regulations                # List regulations
GET    /api/regulations/:id            # Get regulation details
GET    /api/regulations/:id/versions   # Version history
POST   /api/regulations/search         # Full-text + semantic search
POST   /api/regulations/subscribe      # Monitor for changes
```

### 4.4 Multi-Tenancy Enforcement

**Strategy**: Row-level filtering by organization_id

```typescript
// Example: Case service with tenant isolation
export class CaseService {
  async getCaseById(caseId: number, userId: number) {
    // Get user's org
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    // Enforce tenant boundary
    const case = await db.query.cases.findFirst({
      where: and(
        eq(cases.id, caseId),
        eq(cases.organizationId, user.organizationId) // ← KEY
      )
    });

    if (!case) throw new NotFoundError('Case not found');
    return case;
  }
}
```

### 4.5 WebSocket Events (Realtime)

**Server Implementation**:
```typescript
// Backend: plugins/websocket.ts
import { Server as SocketIOServer } from 'socket.io';

export async function websocketPlugin(fastify: FastifyInstance) {
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: process.env.WEB_URL }
  });

  // Authenticate socket connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    const decoded = await fastify.jwt.verify(token);
    socket.data.user = decoded;
    next();
  });

  // Join user to their org room
  io.on('connection', (socket) => {
    const orgId = socket.data.user.organizationId;
    socket.join(`org:${orgId}`);
  });

  // Decorate fastify with io instance
  fastify.decorate('io', io);
}

// Usage in services
export class CaseService {
  async createCase(input, userId) {
    const newCase = await db.insert(cases).values({...});

    // Trigger AI linking
    await aiClient.generateLinks(newCase.id);

    // Emit realtime event
    fastify.io.to(`org:${newCase.organizationId}`)
      .emit('case_links_refreshed', { caseId: newCase.id });

    return newCase;
  }
}
```

**Client-side Events** (Web/Flutter listen for):
- `case_created` - New case added
- `case_updated` - Case details changed
- `case_links_refreshed` - AI suggestions ready
- `regulation_updated` - Regulation changed (monitoring)
- `document_uploaded` - New document added

---

## 5. AI MICROSERVICE (FASTAPI)

### 5.1 Responsibilities

- Generate embeddings for Arabic/English legal text
- Compute semantic similarity (cosine similarity)
- Optional: Rerank top results for precision
- Stateless design (no DB, pure computation)

### 5.2 Model Choice

**Primary Model**: `BAAI/bge-m3`

**Why BGE-M3**:
- ✅ Multilingual (100+ languages including Arabic)
- ✅ Long context (8192 tokens vs 512 typical)
- ✅ State-of-the-art embeddings for semantic search
- ✅ Optimized for retrieval tasks
- ✅ 768-dimensional embeddings (good balance)

**Alternative for Arabic-Heavy**:
- `intfloat/multilingual-e5-large` (also good)
- ❌ NOT `Qwen` models (designed for chat/generation, not embeddings)

### 5.3 API Endpoints

```
POST   /embed              # Generate embeddings
POST   /find_related       # Find similar regulations
POST   /rerank             # Optional: Cross-encoder reranking
GET    /health             # Health check
```

### 5.4 Example Implementation

```python
# ai-service/app/main.py
from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
import numpy as np
from functools import lru_cache

app = FastAPI(title="LCMS AI Service")

@lru_cache(maxsize=1)
def get_model():
    return SentenceTransformer('BAAI/bge-m3')

@app.post("/embed")
async def generate_embeddings(texts: list[str]):
    model = get_model()
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,  # For cosine similarity
        batch_size=32
    )
    return {"embeddings": embeddings.tolist()}

@app.post("/find_related")
async def find_related_regulations(
    text: str,
    regulation_embeddings: list[dict],  # {id, embedding}
    top_k: int = 10,
    threshold: float = 0.6
):
    model = get_model()
    query_embedding = model.encode([text], normalize_embeddings=True)[0]

    results = []
    for reg in regulation_embeddings:
        similarity = np.dot(query_embedding, reg['embedding'])
        if similarity >= threshold:
            results.append({
                'regulation_id': reg['id'],
                'score': float(similarity),
                'method': 'ai'
            })

    # Sort by score descending
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:top_k]
```

### 5.5 Deployment (Docker)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download model at build time (caching)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 6. WEB FRONTEND (NEXT.JS 14) - DETAILED

### 6.1 Complete File Structure

```
web-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout
│   │   ├── page.tsx                    # Landing page (PUBLIC)
│   │   ├── (auth)/                     # Auth route group
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   └── (dashboard)/                # Protected route group
│   │       ├── layout.tsx              # Sidebar + header layout
│   │       ├── dashboard/
│   │       │   └── page.tsx
│   │       ├── cases/
│   │       │   ├── page.tsx            # List
│   │       │   ├── new/
│   │       │   │   └── page.tsx
│   │       │   └── [id]/
│   │       │       └── page.tsx        # Details (tabs)
│   │       ├── regulations/
│   │       │   ├── page.tsx
│   │       │   └── [id]/
│   │       │       └── page.tsx
│   │       ├── profile/
│   │       │   └── page.tsx
│   │       └── settings/
│   │           └── page.tsx
│   ├── components/
│   │   ├── ui/                         # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ... (50+ components)
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx
│   │   │   │   └── register-form.tsx
│   │   │   ├── cases/
│   │   │   │   ├── case-card.tsx
│   │   │   │   ├── case-form.tsx
│   │   │   │   ├── ai-suggestions.tsx
│   │   │   │   └── document-manager.tsx
│   │   │   └── dashboard/
│   │   │       ├── stats-card.tsx
│   │   │       └── recent-cases.tsx
│   │   └── layout/
│   │       ├── header.tsx
│   │       ├── sidebar.tsx
│   │       ├── theme-toggle.tsx
│   │       └── footer.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts               # Axios instance
│   │   │   ├── endpoints.ts            # URL constants
│   │   │   ├── cases.ts                # Cases API methods
│   │   │   ├── regulations.ts
│   │   │   └── ai-links.ts
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-cases.ts            # TanStack Query hooks
│   │   │   ├── use-ai-links.ts
│   │   │   └── use-websocket.ts
│   │   ├── store/
│   │   │   ├── auth-store.ts           # Zustand
│   │   │   ├── ui-store.ts
│   │   │   └── websocket-store.ts
│   │   ├── types/
│   │   │   ├── auth.ts
│   │   │   ├── case.ts
│   │   │   ├── regulation.ts
│   │   │   └── document.ts
│   │   └── utils/
│   │       ├── cn.ts                   # Class name helper
│   │       ├── format.ts               # Date/number formatting
│   │       ├── validators.ts
│   │       └── rtl.ts                  # RTL utilities
│   ├── providers/
│   │   └── query-provider.tsx          # TanStack Query setup
│   └── middleware.ts                    # Auth protection
├── public/
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 6.2 Critical Missing Features (Backlog)

**Pages to Implement (P0)**:
- ❌ `src/app/(auth)/register/page.tsx`
- ❌ `src/app/(dashboard)/regulations/page.tsx`
- ❌ `src/app/(dashboard)/profile/page.tsx`
- ❌ `src/app/(dashboard)/settings/page.tsx`
- ❌ `src/app/page.tsx` (Landing page)
- ❌ Documents tab in `src/app/(dashboard)/cases/[id]/page.tsx`

**Components to Implement (P0)**:
- ❌ `src/components/features/auth/login-form.tsx`
- ❌ `src/components/features/auth/register-form.tsx`
- ❌ `src/components/features/cases/document-manager.tsx`
- ❌ AI dismiss action in `src/components/features/cases/ai-suggestions.tsx`

**UI Primitives Missing (P0)**:
```bash
npx shadcn@latest add dialog table toast dropdown-menu \
  avatar separator switch checkbox alert-dialog progress skeleton
```

**State/Types/Utils (P0)**:
- ❌ `src/lib/api/endpoints.ts`
- ❌ `src/lib/api/cases.ts`, `regulations.ts`, `ai-links.ts`
- ❌ `src/lib/store/ui-store.ts`
- ❌ `src/lib/store/websocket-store.ts`
- ❌ `src/lib/types/auth.ts`, `regulation.ts`, `document.ts`
- ❌ `src/lib/utils/format.ts`, `validators.ts`, `rtl.ts`

### 6.3 Arabic/RTL Requirements (Critical)

**Rules**:
1. **Arabic is default**: All pages load with `lang="ar"` and `dir="rtl"`
2. **No hardcoded text**: Use translation keys only
3. **Direction-aware layouts**: Use CSS logical properties
   ```css
   /* ❌ Wrong */
   margin-left: 1rem;

   /* ✅ Correct */
   margin-inline-start: 1rem;
   ```
4. **Icon mirroring**: Chevrons/arrows flip in RTL
5. **Table reading order**: Right-to-left in Arabic
6. **Locale switcher**: Update `document.lang` + `document.dir` + persist in Zustand

**Example RTL Utility**:
```typescript
// src/lib/utils/rtl.ts
export function isRTL(locale: string): boolean {
  return locale === 'ar';
}

export function getDirection(locale: string): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

export function rtl(locale: string, ltrClass: string, rtlClass: string): string {
  return isRTL(locale) ? rtlClass : ltrClass;
}
```

### 6.4 Realtime UX Patterns

**WebSocket Integration**:
```typescript
// src/lib/hooks/use-websocket.ts
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';

export function useWebSocket() {
  const token = useAuthStore(state => state.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_API_URL, {
      auth: { token }
    });

    socket.on('case_links_refreshed', (data) => {
      // Invalidate AI links query
      queryClient.invalidateQueries(['ai-links', data.caseId]);

      // Show toast notification
      toast({
        title: 'AI Suggestions Updated',
        description: 'New regulation links are available'
      });
    });

    socket.on('regulation_updated', (data) => {
      queryClient.invalidateQueries(['regulations']);
      toast({
        title: 'Regulation Updated',
        description: `${data.title} has been updated`
      });
    });

    return () => socket.disconnect();
  }, [token, queryClient]);
}
```

---

## 7. REGULATION MONITORING (DETAILED STRATEGY)

### 7.1 Professional Terminology (Report-Ready)

**DO NOT SAY**: "web scraping", "scraping the website", "using a bot"

**SAY INSTEAD**:
- "Automated source synchronization"
- "Periodic integrity checks"
- "Version control using cryptographic hashing"
- "AI-driven regulatory intelligence"
- "Intelligent resource discovery via Tavily API"

### 7.2 Implementation Architecture

#### Component 1: Discovery Service (Tavily Integration)

**Purpose**: Help users find official regulation URLs without manual search

**Implementation**:
```typescript
// Backend: services/regulation-discovery.service.ts
import axios from 'axios';

export class RegulationDiscoveryService {
  private tavilyApiKey = process.env.TAVILY_API_KEY;

  async discoverRegulation(query: string) {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: this.tavilyApiKey,
      query: `${query} site:laws.moj.gov.sa official document`,
      search_depth: 'advanced',
      max_results: 5
    });

    return response.data.results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      score: r.score
    }));
  }
}
```

**User Flow**:
```
1. User: "I want to monitor Labor Law"
2. System calls: discoverRegulation("Saudi Labor Law")
3. Tavily returns: [
     { title: "Labor Law - Laws Portal", url: "https://...", ... },
     ...
   ]
4. User selects correct result
5. System creates subscription with that URL
```

#### Component 2: Change Detection Service (Cron Job)

**Strategy A: HTTP Metadata Check**:
```typescript
// Backend: services/regulation-monitor.service.ts
import axios from 'axios';
import crypto from 'crypto';

export class RegulationMonitorService {
  async checkForUpdates(subscription: RegulationSubscription) {
    try {
      // HEAD request (doesn't download full content)
      const response = await axios.head(subscription.sourceUrl, {
        timeout: 10000
      });

      const lastModified = response.headers['last-modified'];
      const etag = response.headers['etag'];

      // Compare with stored values
      if (lastModified && new Date(lastModified) > subscription.lastCheckedAt) {
        // Detected change!
        await this.ingestNewVersion(subscription);
      }

      // Update last checked
      await db.update(regulation_subscriptions)
        .set({ lastCheckedAt: new Date() })
        .where(eq(regulation_subscriptions.id, subscription.id));

    } catch (error) {
      // Fallback to full content check
      await this.checkViaHashComparison(subscription);
    }
  }

  async checkViaHashComparison(subscription: RegulationSubscription) {
    // Download full content
    const response = await axios.get(subscription.sourceUrl);
    const content = this.extractText(response.data); // HTML → text

    // Calculate SHA-256 hash
    const hash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    // Compare with stored hash
    if (hash !== subscription.lastContentHash) {
      await this.ingestNewVersion(subscription, content, hash);
    }
  }

  async ingestNewVersion(subscription, content?, hash?) {
    // 1. Create new regulation_version record
    const newVersion = await db.insert(regulation_versions).values({
      regulationId: subscription.regulationId,
      versionNumber: currentVersion + 1,
      contentText: content,
      contentHash: hash,
      sourceUrl: subscription.sourceUrl,
      effectiveDate: new Date()
    });

    // 2. Generate embeddings via AI service
    const embeddingResponse = await aiClient.generateEmbeddings([content]);
    await db.update(regulation_versions)
      .set({ embedding: embeddingResponse.embeddings[0] })
      .where(eq(regulation_versions.id, newVersion.id));

    // 3. Emit WebSocket event
    this.io.to(`org:${subscription.organizationId}`)
      .emit('regulation_updated', {
        regulationId: subscription.regulationId,
        title: regulation.title
      });

    // 4. Update subscription record
    await db.update(regulation_subscriptions)
      .set({ 
        lastContentHash: hash,
        lastCheckedAt: new Date()
      })
      .where(eq(regulation_subscriptions.id, subscription.id));
  }
}
```

**Cron Job Setup**:
```typescript
// Backend: app.ts
import cron from 'node-cron';

// Run every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  const monitorService = new RegulationMonitorService();
  const activeSubscriptions = await db.query.regulation_subscriptions.findMany({
    where: eq(regulation_subscriptions.isActive, true)
  });

  for (const sub of activeSubscriptions) {
    await monitorService.checkForUpdates(sub);
  }
});
```

### 7.3 User Experience (Web UI)

**Regulations Page** - Subscribe Button:
```tsx
// src/app/(dashboard)/regulations/page.tsx
<Button onClick={() => openSubscribeDialog(regulation)}>
  🔔 Monitor Updates
</Button>

<Dialog open={showSubscribeDialog}>
  <DialogContent>
    <h2>Monitor Regulation Updates</h2>
    <p>Get notified when "{regulation.title}" is updated</p>
    <Label>Check Interval</Label>
    <Select defaultValue="24">
      <option value="12">Every 12 hours</option>
      <option value="24">Daily</option>
      <option value="168">Weekly</option>
    </Select>
    <Button onClick={handleSubscribe}>Enable Monitoring</Button>
  </DialogContent>
</Dialog>
```

**Settings Page** - Manage Subscriptions:
```tsx
// src/app/(dashboard)/settings/page.tsx
<Card>
  <CardHeader>
    <CardTitle>Monitored Regulations</CardTitle>
  </CardHeader>
  <CardContent>
    {subscriptions.map(sub => (
      <div key={sub.id}>
        <span>{sub.regulation.title}</span>
        <Badge>{sub.isActive ? 'Active' : 'Paused'}</Badge>
        <span>Last checked: {formatRelative(sub.lastCheckedAt)}</span>
        <Button variant="ghost" onClick={() => toggleSubscription(sub.id)}>
          {sub.isActive ? 'Pause' : 'Resume'}
        </Button>
      </div>
    ))}
  </CardContent>
</Card>
```

---

## 8. CASE STATUSES & RBAC (CANONICAL)

### 8.1 Case Statuses (MUST MATCH)

**Backend Enum**:
```typescript
export enum CaseStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  PENDING_HEARING = 'pending_hearing',
  CLOSED = 'closed',
  ARCHIVED = 'archived'
}
```

**UI Labels (Arabic + English)**:
```typescript
export const CASE_STATUS_LABELS = {
  open: { ar: 'مفتوح', en: 'Open' },
  in_progress: { ar: 'قيد التنفيذ', en: 'In Progress' },
  pending_hearing: { ar: 'في انتظار الجلسة', en: 'Pending Hearing' },
  closed: { ar: 'مغلق', en: 'Closed' },
  archived: { ar: 'مؤرشف', en: 'Archived' }
};
```

**UI Colors (Badge Component)**:
```typescript
export const CASE_STATUS_COLORS = {
  open: 'blue',
  in_progress: 'yellow',
  pending_hearing: 'orange',
  closed: 'green',
  archived: 'gray'
};
```

### 8.2 RBAC Roles (MUST MATCH)

**Backend Enum**:
```typescript
export enum UserRole {
  ADMIN = 'admin',
  SENIOR_LAWYER = 'senior_lawyer',
  LAWYER = 'lawyer',
  PARALEGAL = 'paralegal',
  CLERK = 'clerk'
}
```

**Permissions Matrix**:
```typescript
export const PERMISSIONS = {
  admin: {
    cases: ['create', 'read', 'update', 'delete', 'verify_ai'],
    regulations: ['create', 'read', 'update', 'delete', 'subscribe'],
    users: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update']
  },
  senior_lawyer: {
    cases: ['create', 'read', 'update', 'verify_ai'],
    regulations: ['read', 'subscribe'],
    users: ['read'],
    settings: []
  },
  lawyer: {
    cases: ['create', 'read', 'update', 'verify_ai'],
    regulations: ['read'],
    users: [],
    settings: []
  },
  paralegal: {
    cases: ['create', 'read', 'update'],
    regulations: ['read'],
    users: [],
    settings: []
  },
  clerk: {
    cases: ['create', 'read'],
    regulations: ['read'],
    users: [],
    settings: []
  }
};
```

**UI Permission Check**:
```typescript
// src/lib/utils/permissions.ts
import { useAuthStore } from '@/lib/store/auth-store';

export function usePermission() {
  const user = useAuthStore(state => state.user);

  return {
    can: (resource: string, action: string) => {
      if (!user) return false;
      return PERMISSIONS[user.role]?.[resource]?.includes(action) ?? false;
    }
  };
}

// Usage in components
const { can } = usePermission();

{can('cases', 'verify_ai') && (
  <Button onClick={() => verifyLink(linkId)}>
    ✓ Verify
  </Button>
)}
```

---

## 9. ACCEPTANCE CRITERIA (V1 RELEASE)

### ✅ Functionality Checklist

**Authentication**:
- [ ] Login with email/password works
- [ ] Register creates new user + org
- [ ] JWT token stored securely
- [ ] 401 redirects to login
- [ ] Session persists on page refresh

**Cases**:
- [ ] Create case with all required fields
- [ ] List cases with filters (status, search)
- [ ] View case details (tabs: Details, AI, Documents)
- [ ] Update case metadata
- [ ] AI suggestions automatically generated on create
- [ ] Verify/dismiss AI suggestions works

**Regulations**:
- [ ] List regulations with search
- [ ] View regulation details
- [ ] Version history visible
- [ ] Subscribe to monitoring works
- [ ] Receive realtime alerts on updates

**Documents**:
- [ ] Upload documents to case
- [ ] List documents per case
- [ ] Download documents
- [ ] Delete documents

**Realtime**:
- [ ] WebSocket connection established on login
- [ ] Toast notifications appear on events
- [ ] UI auto-refreshes without manual reload
- [ ] Badge counts update in realtime

**UI/UX**:
- [ ] Arabic RTL works on all pages
- [ ] Theme toggle (light/dark) persists
- [ ] Locale switcher updates language
- [ ] Responsive design (mobile/tablet/desktop)
- [ ] No broken links or 404s

### ✅ Technical Quality Checklist

**Backend**:
- [ ] All endpoints return proper HTTP status codes
- [ ] JWT authentication on protected routes
- [ ] Multi-tenancy enforced (no cross-org access)
- [ ] Database migrations applied
- [ ] pgvector extension enabled
- [ ] OpenAPI docs accessible at `/docs`

**AI Service**:
- [ ] Embeddings generated correctly
- [ ] Cosine similarity returns sensible scores
- [ ] Health check endpoint responds
- [ ] Model cached in memory (not reloaded per request)

**Frontend**:
- [ ] TanStack Query caching working
- [ ] No console errors in browser
- [ ] TypeScript compiles without errors
- [ ] All components use translation keys (no hardcoded text)
- [ ] WebSocket reconnects on disconnect

**DevOps**:
- [ ] Docker Compose starts all services
- [ ] Environment variables documented
- [ ] Database backups configured
- [ ] Logs centralized (optional: ELK/Loki)

---

## 10. GRADUATION REPORT GUIDELINES

### 10.1 Recommended Chapter Structure

#### Chapter 1: Introduction
- Problem statement (legal case management inefficiency)
- Objectives (AI-powered regulation suggestions)
- Scope (web + mobile + AI)
- Contributions (smart monitoring, semantic search)

#### Chapter 2: Literature Review
- Background: Legal tech + AI in law
- Related work:
  - Case management systems (Clio, PracticePanther)
  - Legal AI (LexisNexis, ROSS Intelligence)
  - Semantic search in legal domain
- Research gap: Arabic-first, Saudi-specific, regulation monitoring

#### Chapter 3: Requirements & Specification
- Functional requirements (use cases with UML)
- Non-functional requirements (performance, security, scalability)
- User roles (RBAC matrix)
- System constraints (Arabic RTL, multi-tenancy)
- Gantt chart (project timeline)

#### Chapter 4: Design
- System architecture diagram (clients → API → DB/AI)
- Database design (ERD + normalization)
- Sequence diagrams (case creation → AI linking)
- Class diagrams (OOP structure if using OOP)
- UI/UX wireframes (screens with annotations)
- Alternative designs (why Fastify over NestJS, pgvector over Qdrant)

#### Chapter 5: Implementation
- Tech stack justification
- Code snippets (critical algorithms):
  - JWT authentication flow
  - Vector similarity query
  - WebSocket event emitter
- Data structures (regulation_versions with embeddings)
- Procedures (API endpoints with request/response examples)
- Challenges faced:
  - Arabic text preprocessing
  - Realtime sync across clients
  - Multi-tenancy isolation

#### Chapter 6: Testing
- Unit tests (backend services)
- Integration tests (API endpoints)
- E2E tests (Playwright for web)
- Test cases table:
  | Test ID | Test Case | Input | Expected Output | Status |
  |---------|-----------|-------|-----------------|--------|
  | TC-001 | User login | valid email/pw | JWT token + user data | ✅ Pass |
  | TC-002 | AI linking | case text | top 10 regulations | ✅ Pass |
  | TC-003 | Regulation update | changed PDF | new version created | ✅ Pass |

#### Chapter 7: Conclusion & Future Work
- Summary of achievements
- Limitations (no court e-filing, no mobile app completion)
- Future enhancements:
  - Qwen-based chat for regulation Q&A
  - Advanced analytics dashboard
  - Integration with TASI (Saudi stock market) for commercial cases
  - Blockchain for evidence integrity

### 10.2 Key Terminology (Professional Framing)

**AI/ML Terms**:
- "Semantic similarity using dense vector embeddings"
- "Cross-encoder reranking for precision improvement"
- "Transfer learning with BAAI/bge-m3 multilingual model"
- "Approximate nearest neighbor search via HNSW indexing"

**Regulation Monitoring Terms**:
- "Automated source synchronization pipeline"
- "Content integrity verification via cryptographic hashing"
- "Periodic delta detection using HTTP metadata headers"
- "AI-driven regulatory intelligence with Tavily API"

**Architecture Terms**:
- "Event-driven microservices architecture"
- "Stateless AI inference layer"
- "Row-level multi-tenancy with organization isolation"
- "Hybrid search combining full-text and vector similarity"

### 10.3 Diagrams to Include

**Must-have UML diagrams**:
1. **Use Case Diagram**: Actors (lawyer, admin) + use cases (create case, verify AI link)
2. **Sequence Diagram**: Case creation → AI linking → realtime notification
3. **Class Diagram**: Backend services + ORM entities
4. **Activity Diagram**: Regulation monitoring workflow
5. **Component Diagram**: System architecture (3-tier)
6. **ERD**: Database entities + relationships

**Architecture diagrams**:
1. System context diagram (C4 model level 1)
2. Container diagram (web, mobile, API, AI, DB)
3. Deployment diagram (Docker containers + network)

---

## 11. COMMON PITFALLS & SOLUTIONS

### Pitfall 1: Hardcoding Organization ID
❌ **Wrong**:
```typescript
const cases = await db.query.cases.findMany();
```

✅ **Correct**:
```typescript
const cases = await db.query.cases.findMany({
  where: eq(cases.organizationId, user.organizationId)
});
```

### Pitfall 2: Not Normalizing Embeddings
❌ **Wrong**:
```python
embeddings = model.encode(texts)
```

✅ **Correct**:
```python
embeddings = model.encode(texts, normalize_embeddings=True)
```

### Pitfall 3: Forgetting to Invalidate Queries
❌ **Wrong**:
```typescript
await createCase(input);
// UI still shows old data!
```

✅ **Correct**:
```typescript
await createCase(input);
queryClient.invalidateQueries(['cases']);
```

### Pitfall 4: Arabic Text Display Issues
❌ **Wrong**:
```html
<div className="text-left">
  {regulation.title}
</div>
```

✅ **Correct**:
```html
<div className="text-start" dir="auto">
  {regulation.title}
</div>
```

### Pitfall 5: Not Handling WebSocket Reconnection
❌ **Wrong**:
```typescript
socket.on('disconnect', () => {
  // Do nothing
});
```

✅ **Correct**:
```typescript
socket.on('disconnect', () => {
  setTimeout(() => socket.connect(), 5000);
});
```

---

## 12. QUICK REFERENCE COMMANDS

### Backend (Fastify)
```bash
# Development
npm run dev

# Build
npm run build

# Run production
npm start

# Database migrations
npm run db:generate
npm run db:migrate

# Run tests
npm test
```

### AI Service (FastAPI)
```bash
# Development
uvicorn app.main:app --reload --port 8000

# Production (Docker)
docker build -t lcms-ai-service .
docker run -p 8000:8000 lcms-ai-service

# Test embedding endpoint
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Saudi Labor Law Article 77"]}'
```

### Web Frontend (Next.js)
```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start

# Add shadcn component
npx shadcn@latest add dialog

# Type check
npm run type-check
```

### Database (PostgreSQL)
```bash
# Connect to DB
psql -U postgres -d lcms

# Enable pgvector
CREATE EXTENSION vector;

# Check indexes
\di

# Explain query plan
EXPLAIN ANALYZE SELECT * FROM regulations ...;
```

---

## 13. DEPLOYMENT CHECKLIST

### Pre-deployment
- [ ] Environment variables set (`.env.production`)
- [ ] Database migrations applied
- [ ] pgvector extension enabled
- [ ] AI model downloaded and cached
- [ ] CORS origins configured
- [ ] JWT secret generated (strong random string)
- [ ] SSL certificates obtained (Let's Encrypt)

### Docker Compose Production
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/lcms
      JWT_SECRET: ${JWT_SECRET}
      AI_SERVICE_URL: http://ai-service:8000
    depends_on:
      - postgres

  ai-service:
    build: ./ai-service
    ports:
      - "8000:8000"

  web:
    build: ./web-frontend
    environment:
      NEXT_PUBLIC_API_URL: ${API_URL}
    depends_on:
      - backend

volumes:
  pgdata:
```

### Post-deployment
- [ ] Health checks passing
- [ ] Logs monitored
- [ ] Backups scheduled (daily)
- [ ] SSL certificate auto-renewal enabled
- [ ] Performance metrics tracked (optional: Grafana)

---

**END OF MASTER CONTEXT**

*This document covers the complete LCMS system architecture, implementation details, and graduation project requirements. Use this as the single source of truth for all AI agent interactions.*
