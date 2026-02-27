# RAG Phase 1 Backend Note

Phase 1 introduces backend storage/retrieval plumbing for document-grounded RAG without changing existing frontend API contracts.

## Added Database Primitive
- `document_chunks` (PostgreSQL)
  - tenant scope: `organization_id`
  - parent scope: `document_id`
  - uniqueness: `(document_id, chunk_index)`
  - embedding storage: `embedding vector(1024)`
  - ANN index: HNSW cosine (`vector_cosine_ops`)

## Prerequisite
- PostgreSQL must enable pgvector before migrations:
  - `CREATE EXTENSION IF NOT EXISTS vector;`

## Compatibility
- Existing insights endpoints remain unchanged:
  - `GET /api/documents/:docId/insights`
  - `POST /api/documents/:docId/insights/refresh`
- Existing response fields used by UI remain intact:
  - `summary`
  - `highlights`

## Phase 2/3 Runtime Wiring (Current)
- OCR extraction now triggers chunking + embedding + `document_chunks` reindex.
- Insights generation uses pgvector similarity retrieval (document-scoped, org-scoped) before AI summarization.
- Insights payload remains backward-compatible while exposing optional fields:
  - `citations?`
  - `retrievalMeta?`
