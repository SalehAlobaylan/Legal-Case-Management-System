import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";

describe("Document insights RAG metadata migration smoke", () => {
  it("should add citations and retrieval meta columns", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "src/db/migrations/0013_document_insights_rag_metadata.sql"
    );

    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("ALTER TABLE \"document_extractions\"");
    expect(sql).toContain("\"insights_citations_json\" text DEFAULT '[]' NOT NULL");
    expect(sql).toContain("\"insights_retrieval_meta_json\" text");
  });
});

