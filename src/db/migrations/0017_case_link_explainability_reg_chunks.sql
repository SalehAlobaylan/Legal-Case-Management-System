CREATE TABLE "regulation_chunks" (
  "id" serial PRIMARY KEY NOT NULL,
  "regulation_id" integer NOT NULL,
  "regulation_version_id" integer NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "line_start" integer,
  "line_end" integer,
  "article_ref" varchar(255),
  "token_count" integer,
  "embedding" vector(1024),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulation_chunks"
  ADD CONSTRAINT "regulation_chunks_regulation_id_regulations_id_fk"
  FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulation_chunks"
  ADD CONSTRAINT "regulation_chunks_regulation_version_id_regulation_versions_id_fk"
  FOREIGN KEY ("regulation_version_id") REFERENCES "public"."regulation_versions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "regulation_chunks_reg_version_chunk_unique_idx"
  ON "regulation_chunks" ("regulation_version_id", "chunk_index");
--> statement-breakpoint
CREATE INDEX "regulation_chunks_reg_version_idx"
  ON "regulation_chunks" ("regulation_id", "regulation_version_id");
--> statement-breakpoint
CREATE INDEX "regulation_chunks_embedding_hnsw_cosine_idx"
  ON "regulation_chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
ALTER TABLE "case_regulation_links"
  ADD COLUMN "matched_regulation_version_id" integer;
--> statement-breakpoint
ALTER TABLE "case_regulation_links"
  ADD COLUMN "match_explanation" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "case_regulation_links"
  ADD CONSTRAINT "case_reg_links_matched_reg_version_fk"
  FOREIGN KEY ("matched_regulation_version_id") REFERENCES "public"."regulation_versions"("id")
  ON DELETE set null ON UPDATE no action;
