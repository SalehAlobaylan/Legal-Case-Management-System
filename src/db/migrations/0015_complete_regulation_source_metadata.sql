ALTER TABLE "regulations"
  ADD COLUMN "source_provider" varchar(50) DEFAULT 'manual' NOT NULL,
  ADD COLUMN "source_serial" varchar(255),
  ADD COLUMN "source_listing_url" text,
  ADD COLUMN "source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN "source_metadata_hash" varchar(64),
  ADD COLUMN "summary" text;
--> statement-breakpoint
CREATE INDEX "regulations_source_provider_idx" ON "regulations" ("source_provider");
--> statement-breakpoint
CREATE INDEX "regulations_source_serial_idx" ON "regulations" ("source_serial");
--> statement-breakpoint
CREATE UNIQUE INDEX "regulations_source_provider_serial_uidx"
  ON "regulations" ("source_provider", "source_serial")
  WHERE "source_serial" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "regulation_versions"
  ADD COLUMN "source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN "source_metadata_hash" varchar(64),
  ADD COLUMN "extraction_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
