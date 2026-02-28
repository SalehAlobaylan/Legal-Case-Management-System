import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import {
  documentChunks,
  DOCUMENT_CHUNK_EMBEDDING_DIMENSION,
} from "../schema";

describe("Document chunks migration/schema smoke", () => {
  it("should include required pgvector migration statements", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "src/db/migrations/0012_document_chunks_pgvector.sql"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql).toContain('CREATE TABLE "document_chunks"');
    expect(sql).toContain(
      '"document_chunks_doc_chunk_unique_idx" ON "document_chunks" USING btree ("document_id","chunk_index")'
    );
    expect(sql).toContain(
      '"document_chunks_embedding_hnsw_cosine_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)'
    );
  });

  it("should expose typed document_chunks schema", () => {
    expect(documentChunks).toBeDefined();
    expect(documentChunks.organizationId).toBeDefined();
    expect(documentChunks.documentId).toBeDefined();
    expect(documentChunks.chunkIndex).toBeDefined();
    expect(documentChunks.embedding).toBeDefined();
    expect(DOCUMENT_CHUNK_EMBEDDING_DIMENSION).toBe(1024);
  });
});
