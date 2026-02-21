ALTER TABLE "document_extractions"
  ADD COLUMN "insights_status" varchar(50) DEFAULT 'pending' NOT NULL,
  ADD COLUMN "insights_summary" text,
  ADD COLUMN "insights_highlights_json" text DEFAULT '[]' NOT NULL,
  ADD COLUMN "insights_case_context_hash" varchar(64),
  ADD COLUMN "insights_source_text_hash" varchar(64),
  ADD COLUMN "insights_method" varchar(100),
  ADD COLUMN "insights_error_code" varchar(100),
  ADD COLUMN "insights_warnings_json" text,
  ADD COLUMN "insights_attempt_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "insights_last_attempt_at" timestamp,
  ADD COLUMN "insights_next_retry_at" timestamp DEFAULT now() NOT NULL,
  ADD COLUMN "insights_updated_at" timestamp;
--> statement-breakpoint
CREATE INDEX "doc_extract_case_insights_status_idx"
  ON "document_extractions" USING btree ("case_id","insights_status");
--> statement-breakpoint
CREATE INDEX "doc_extract_org_insights_retry_idx"
  ON "document_extractions" USING btree ("organization_id","insights_status","insights_next_retry_at");
