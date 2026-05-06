CREATE TABLE "legal_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"trust_tier" varchar(32) NOT NULL,
	"source_authority" varchar(100) NOT NULL,
	"is_citable_in_court" boolean DEFAULT false NOT NULL,
	"title" varchar(1000) NOT NULL,
	"summary" text,
	"source_url" text,
	"canonical_identifier" varchar(255),
	"language" varchar(16) DEFAULT 'ar' NOT NULL,
	"source_provider" varchar(100) NOT NULL,
	"source_serial" varchar(255),
	"source_listing_url" text,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_metadata_hash" varchar(64),
	"category" varchar(100),
	"jurisdiction" varchar(255) DEFAULT 'SA' NOT NULL,
	"published_date" date,
	"effective_date" date,
	"regulation_id" integer,
	"curator_verified" boolean DEFAULT false NOT NULL,
	"curator_verified_by" uuid,
	"curator_verified_at" timestamp,
	"curator_notes" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp,
	"monitoring_enabled" boolean DEFAULT true NOT NULL,
	"check_interval_hours" integer DEFAULT 168 NOT NULL,
	"last_checked_at" timestamp,
	"last_content_hash" varchar(64),
	"last_etag" text,
	"last_modified" timestamp,
	"next_check_at" timestamp DEFAULT now() NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_source_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"legal_source_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"section_ref" varchar(255),
	"section_type" varchar(64),
	"line_start" integer,
	"line_end" integer,
	"token_count" integer,
	"embedding" vector(1024),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_source_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"legal_source_id" integer NOT NULL,
	"relevance_score" numeric(5, 4),
	"trust_weighted_score" numeric(5, 4),
	"method" varchar(32) DEFAULT 'ai' NOT NULL,
	"pipeline_stage" varchar(64),
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp,
	"dismissed" boolean DEFAULT false NOT NULL,
	"dismissed_by" uuid,
	"dismissed_at" timestamp,
	"dismiss_reason" text,
	"evidence_sources" text DEFAULT '[]' NOT NULL,
	"match_explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matched_with_documents" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake_forms" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD COLUMN IF NOT EXISTS "schema" jsonb;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "legal_sources" ADD CONSTRAINT "legal_sources_regulation_id_regulations_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_sources" ADD CONSTRAINT "legal_sources_curator_verified_by_users_id_fk" FOREIGN KEY ("curator_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_source_chunks" ADD CONSTRAINT "legal_source_chunks_legal_source_id_legal_sources_id_fk" FOREIGN KEY ("legal_source_id") REFERENCES "public"."legal_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_source_links" ADD CONSTRAINT "case_source_links_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_source_links" ADD CONSTRAINT "case_source_links_legal_source_id_legal_sources_id_fk" FOREIGN KEY ("legal_source_id") REFERENCES "public"."legal_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_source_links" ADD CONSTRAINT "case_source_links_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_source_links" ADD CONSTRAINT "case_source_links_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_sources_source_type_idx" ON "legal_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "legal_sources_trust_tier_idx" ON "legal_sources" USING btree ("trust_tier");--> statement-breakpoint
CREATE INDEX "legal_sources_status_idx" ON "legal_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "legal_sources_category_idx" ON "legal_sources" USING btree ("category");--> statement-breakpoint
CREATE INDEX "legal_sources_source_provider_idx" ON "legal_sources" USING btree ("source_provider");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_sources_provider_serial_uidx" ON "legal_sources" USING btree ("source_provider","source_serial") WHERE "legal_sources"."source_serial" is not null;--> statement-breakpoint
CREATE INDEX "legal_sources_regulation_id_idx" ON "legal_sources" USING btree ("regulation_id");--> statement-breakpoint
CREATE INDEX "legal_sources_monitoring_due_idx" ON "legal_sources" USING btree ("monitoring_enabled","next_check_at");--> statement-breakpoint
CREATE INDEX "legal_sources_expires_at_idx" ON "legal_sources" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "legal_sources_curator_verified_idx" ON "legal_sources" USING btree ("curator_verified","trust_tier");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_source_chunks_source_chunk_unique_idx" ON "legal_source_chunks" USING btree ("legal_source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "legal_source_chunks_source_id_idx" ON "legal_source_chunks" USING btree ("legal_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_source_unique_idx" ON "case_source_links" USING btree ("case_id","legal_source_id");--> statement-breakpoint
CREATE INDEX "case_source_score_idx" ON "case_source_links" USING btree ("case_id","trust_weighted_score");--> statement-breakpoint
CREATE INDEX "case_source_source_idx" ON "case_source_links" USING btree ("legal_source_id");--> statement-breakpoint
CREATE INDEX "case_source_pending_verify_idx" ON "case_source_links" USING btree ("verified","dismissed","method");--> statement-breakpoint
CREATE INDEX "legal_source_chunks_embedding_hnsw_cosine_idx" ON "legal_source_chunks" USING hnsw ("embedding" vector_cosine_ops);