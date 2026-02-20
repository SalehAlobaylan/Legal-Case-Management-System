CREATE TABLE "document_extractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"case_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"file_hash" varchar(64),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"normalized_text_hash" varchar(64),
	"extraction_method" varchar(100),
	"ocr_provider_used" varchar(50),
	"error_code" varchar(100),
	"warnings_json" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"next_retry_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "doc_extract_document_unique_idx" ON "document_extractions" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX "doc_extract_case_status_idx" ON "document_extractions" USING btree ("case_id","status");
--> statement-breakpoint
CREATE INDEX "doc_extract_org_retry_idx" ON "document_extractions" USING btree ("organization_id","status","next_retry_at");
--> statement-breakpoint
ALTER TABLE "case_regulation_links" ADD COLUMN "evidence_sources" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "case_regulation_links" ADD COLUMN "matched_with_documents" boolean DEFAULT false NOT NULL;
