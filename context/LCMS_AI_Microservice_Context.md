<!-- ========================================
File: LCMS_AI_Microservice_Context.md
======================================== -->

# LCMS — AI Microservice Context
**Primary Context for the AI/NLP Service (suggestions, search, summarization)**  
*Generated: 2026-01-03 | Use this as the single source of truth for building the AI microservice*

---

## PART 1: PURPOSE & RESPONSIBILITIES

### 1.1 Why this microservice exists
The AI microservice provides all **AI/NLP capabilities** for LCMS while keeping the main backend (Node/Go) focused on business logic, RBAC, and transactional integrity.

### 1.2 In-scope responsibilities (v1)
**P0**
- Generate **regulation suggestions** for a case (semantic retrieval + ranking).
- Provide **semantic search** over regulations.
- Provide **summaries** for regulations and/or case-to-regulation relevance.
- Maintain and serve **embeddings** for regulations (and optionally case text).
- Expose consistent API contracts for the backend to call.

**P1**
- Reranking using cross-encoder.
- Feedback learning signals (verified/dismissed links) for evaluation.
- Model monitoring, drift alerts, and offline evaluation pipelines.

### 1.3 Out of scope
- User auth and RBAC decisions (handled by main backend).
- Source crawling / regulation syncing (can be separate “regulation sync” service).

---

## PART 2: HIGH-LEVEL ARCHITECTURE

### 2.1 Deployment model
- Deploy as an independent service: `ai-service`.
- Communicates with main backend via HTTP (internal network).
- Uses background jobs for heavy tasks (embedding generation, batch indexing).

### 2.2 Recommended stack
**API Layer**
- Python: FastAPI + Uvicorn (preferred for AI ecosystem)
  - Alternatives acceptable: Node (Fastify) with Python worker, but keep ML core in Python.

**Async jobs** (choose one)
- Celery + Redis
- RQ + Redis
- arq + Redis

**Vector storage** (choose one)
- PostgreSQL + pgvector (recommended if backend already uses Postgres)
- Qdrant (if you want an external vector DB)

**LLM provider (pluggable)**
- External API (OpenAI / Azure OpenAI)
- Self-hosted (vLLM + Llama 3.x)

**Embeddings**
- BGE-M3 (multilingual) for Arabic + English regulation text.

### 2.3 Data flow (case suggestion)
1. Backend creates/updates a case.
2. Backend calls `POST /v1/suggestions/cases/{caseId}` with case text.
3. AI service:
   - normalizes text (Arabic normalization)
   - embeds query
   - retrieves top-K regulations via vector search
   - reranks (P1)
   - optionally calls LLM to produce a short relevance explanation
4. Returns ranked list of regulation candidates with score + explanation.
5. Backend persists suggestions and emits WebSocket event `case_links_refreshed`.

---

## PART 3: DOMAIN OBJECTS (AI SERVICE)

### 3.1 Regulation document schema (AI index)
Each regulation chunk stored for retrieval:
- `regulation_id` (int)
- `version_id` (int)
- `title_ar`, `title_en`
- `source_url`
- `status` (active/amended/repealed)
- `chunk_id` (int)
- `chunk_text` (string)
- `chunk_lang` (ar/en/mixed)
- `chunk_order` (int)
- `embedding` (vector)
- `metadata` (json): category, ministry, effective_date, etc.

### 3.2 Case query schema
- `case_id`
- `title`
- `description` (free text)
- `facts` (optional)
- `claims` (optional)
- `court` (optional)
- `tags` (optional)
- `language` (ar/en)

### 3.3 Suggestion schema (returned to backend)
- `regulation_id`
- `version_id` (latest at time of suggestion)
- `score` (float)
- `confidence` (0–1 float)
- `reason` (short text explanation)
- `highlights` (optional list of matched snippets)

---

## PART 4: API CONTRACT (INTERNAL)

All endpoints are internal-to-backend, protected by a service token header.

### 4.1 Auth between services
- Backend sends: `X-Service-Token: <shared_secret>`
- AI service rejects requests without correct token.
- (P1) Replace with mTLS.

### 4.2 Endpoints

#### Health
- `GET /health`
  - Returns: `{ "status": "ok" }`

#### Index regulations (batch)
- `POST /v1/index/regulations`
  - Body: list of regulations with versions + text or chunks
  - Use for initial bootstrapping and reindexing

#### Index single regulation (idempotent)
- `PUT /v1/index/regulations/{regulationId}/versions/{versionId}`
  - Body: `{ title, language, full_text, source_url, metadata }`
  - AI service chunks + embeds + upserts

#### Delete regulation version from index
- `DELETE /v1/index/regulations/{regulationId}/versions/{versionId}`

#### Generate suggestions for a case
- `POST /v1/suggestions/cases/{caseId}`
  - Body: `{ title, description, facts, claims, language, topK }`
  - Returns: `{ caseId, suggestions: [...] }`

#### Semantic search regulations
- `POST /v1/search/regulations`
  - Body: `{ query, language, filters, topK }`
  - Returns ranked regulations and snippets

#### Summarize regulation
- `POST /v1/summarize/regulation/{regulationId}`
  - Body: `{ versionId, language, maxWords }`

#### Explain relevance (optional)
- `POST /v1/explain/relevance`
  - Body: `{ caseText, regulationText, language }`

### 4.3 Response contracts (example)
```json
{
  "caseId": 101,
  "suggestions": [
    {
      "regulationId": 12,
      "versionId": 3,
      "score": 0.82,
      "confidence": 0.91,
      "reason": "Matches labor dispute claims about termination procedures.",
      "highlights": [
        "... employer termination must follow ...",
        "... notice period requirements ..."
      ]
    }
  ]
}
```

---

## PART 5: RETRIEVAL PIPELINE (RAG)

### 5.1 Chunking strategy (regulations)
- Chunk by structure when available: articles/sections.
- Fallback chunking: 400–800 tokens with 10–15% overlap.
- Store `chunk_order` so UI can show context.

### 5.2 Arabic normalization (critical)
- Normalize Arabic forms to improve retrieval:
  - Alef forms: (أ/إ/آ → ا)
  - Yeh: (ى → ي)
  - Teh Marbuta normalization optionally (ة)
  - Remove tatweel (ـ)
  - Remove diacritics

### 5.3 Vector retrieval
- Compute embedding for query.
- Run vector search topK (e.g., 50).
- Apply filters (status/category/jurisdiction if provided).

### 5.4 Reranking (P1)
- Use cross-encoder reranker for top 50 → top 10.
- Output confidence = sigmoid(reranker_score) or calibrated score.

### 5.5 LLM explanation (optional)
- Provide short reason text (1–2 sentences).
- Must be deterministic-ish:
  - temperature low (0–0.2)
  - max tokens limited
  - prompt must request “no hallucinations” and cite text snippets.

---

## PART 6: PROMPTING RULES (LLM)

### 6.1 Core constraints
- Never produce legal advice; only “relevance explanation”.
- Must not invent law text.
- Must quote only from provided regulation snippet.

### 6.2 Relevance explanation prompt (template)
System:
- You are assisting in legal research.
- Explain why the provided regulation is relevant to the case description.
- If unsure, say you are unsure.

User:
- Case: <CASE_TEXT>
- Regulation snippet: <REG_SNIPPET>

Output JSON:
```json
{ "reason": "...", "confidence": 0.0, "quoted_snippets": ["..."] }
```

---

## PART 7: STORAGE DESIGN

### 7.1 If using PostgreSQL + pgvector
Tables (conceptual):
- `regulation_chunks`
  - ids + metadata + `embedding vector(1024)` (depends on embedding model)

Indexes:
- HNSW or IVFFlat index for embeddings.

### 7.2 Caching
- Cache frequent searches and suggestions (Redis) with short TTL (e.g., 5–15 min).
- Key: hash of query + filters.

---

## PART 8: INTEGRATION WITH MAIN BACKEND

### 8.1 Service-to-service contract
Backend is the source of truth for:
- Cases
- Regulations metadata
- Subscriptions
- Verified/dismissed suggestions

AI service is the source of truth for:
- Embedding index
- Retrieval results
- Optional generated summaries/explanations

### 8.2 Events (recommended)
- When backend updates regulation version → call AI service indexing endpoint.
- When AI service finishes long job (reindex) → callback webhook or message queue.

### 8.3 Idempotency
- Index endpoints must be idempotent (same reg/version overwrites same chunks).

---

## PART 9: SECURITY & COMPLIANCE

- Only accessible on private network.
- Service token required for every request.
- Request logging must not store sensitive case details (mask or truncate).
- Encrypt secrets (KMS) in production.

---

## PART 10: PERFORMANCE & SCALABILITY

### 10.1 Latency targets
- Suggestions request: < 2 seconds typical for top 10.
- Search request: < 800ms typical.

### 10.2 Scaling patterns
- Horizontal scale API pods.
- Keep embeddings model loaded in memory per worker.
- Use async job queue for batch indexing.

### 10.3 Backpressure
- Rate limit requests from backend (token bucket).
- If LLM provider rate limits, degrade gracefully:
  - Return suggestions without explanations.

---

## PART 11: OBSERVABILITY & EVALUATION

### 11.1 Metrics
- Request latency p50/p95
- Suggestions count per case
- Verified vs dismissed ratio
- Search success rate
- Embedding/indexing job durations

### 11.2 Offline evaluation (P1)
- Build dataset: (case text, expected regs) from verified links.
- Evaluate recall@k and MRR.
- Track per-language performance (AR vs EN).

---

## PART 12: IMPLEMENTATION PLAN

### Week 1 — Skeleton + Index
- FastAPI service scaffolding.
- Service auth header.
- pgvector schema + chunk upsert.
- Index endpoints.

### Week 2 — Retrieval
- Suggestion endpoint.
- Search endpoint.
- Arabic normalization.

### Week 3 — Quality
- Reranking (P1 if time).
- Explanation endpoint.
- Caching.

### Week 4 — Production hardening
- Metrics, tracing.
- Load testing.
- CI/CD, docker images.

---

## PART 13: ACCEPTANCE CRITERIA (AI SERVICE v1)

- [ ] Can index regulation versions and retrieve them via vector search.
- [ ] Suggestions endpoint returns stable ranked list.
- [ ] Arabic queries work well (normalization applied).
- [ ] Service-to-service auth enforced.
- [ ] Indexing is idempotent.
- [ ] Performance meets latency targets for typical load.

---

**END OF AI MICROSERVICE CONTEXT**
