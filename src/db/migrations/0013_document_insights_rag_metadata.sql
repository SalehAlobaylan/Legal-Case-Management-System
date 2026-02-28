ALTER TABLE "document_extractions"
  ADD COLUMN "insights_citations_json" text DEFAULT '[]' NOT NULL,
  ADD COLUMN "insights_retrieval_meta_json" text;
