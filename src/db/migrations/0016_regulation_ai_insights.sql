CREATE TABLE "regulation_insights" (
  "id" serial PRIMARY KEY NOT NULL,
  "regulation_id" integer NOT NULL,
  "regulation_version_id" integer NOT NULL,
  "language_code" varchar(8) DEFAULT 'ar' NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "summary" text,
  "obligations_json" text DEFAULT '[]' NOT NULL,
  "risk_flags_json" text DEFAULT '[]' NOT NULL,
  "key_dates_json" text DEFAULT '[]' NOT NULL,
  "citations_json" text DEFAULT '[]' NOT NULL,
  "source_text_hash" varchar(64),
  "method" varchar(120),
  "error_code" varchar(120),
  "warnings_json" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp,
  "next_retry_at" timestamp DEFAULT now() NOT NULL,
  "triggered_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulation_insights"
  ADD CONSTRAINT "regulation_insights_regulation_id_regulations_id_fk"
  FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulation_insights"
  ADD CONSTRAINT "regulation_insights_regulation_version_id_regulation_versions_id_fk"
  FOREIGN KEY ("regulation_version_id") REFERENCES "public"."regulation_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulation_insights"
  ADD CONSTRAINT "regulation_insights_triggered_by_user_id_users_id_fk"
  FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "regulation_insights_reg_version_lang_uidx"
  ON "regulation_insights" ("regulation_version_id", "language_code");
--> statement-breakpoint
CREATE INDEX "regulation_insights_status_retry_idx"
  ON "regulation_insights" ("status", "next_retry_at");
--> statement-breakpoint
CREATE INDEX "regulation_insights_reg_lang_updated_idx"
  ON "regulation_insights" ("regulation_id", "language_code", "updated_at");
--> statement-breakpoint
CREATE TABLE "regulation_amendment_impacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "regulation_id" integer NOT NULL,
  "from_version_number" integer NOT NULL,
  "to_version_number" integer NOT NULL,
  "language_code" varchar(8) DEFAULT 'ar' NOT NULL,
  "from_version_id" integer NOT NULL,
  "to_version_id" integer NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "what_changed_json" text DEFAULT '[]' NOT NULL,
  "legal_impact_json" text DEFAULT '[]' NOT NULL,
  "affected_parties_json" text DEFAULT '[]' NOT NULL,
  "citations_json" text DEFAULT '[]' NOT NULL,
  "diff_fingerprint_hash" varchar(64),
  "method" varchar(120),
  "error_code" varchar(120),
  "warnings_json" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp,
  "next_retry_at" timestamp DEFAULT now() NOT NULL,
  "triggered_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulation_amendment_impacts"
  ADD CONSTRAINT "reg_amendment_impacts_regulation_id_regulations_id_fk"
  FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulation_amendment_impacts"
  ADD CONSTRAINT "reg_amendment_impacts_from_version_id_regulation_versions_id_fk"
  FOREIGN KEY ("from_version_id") REFERENCES "public"."regulation_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulation_amendment_impacts"
  ADD CONSTRAINT "reg_amendment_impacts_to_version_id_regulation_versions_id_fk"
  FOREIGN KEY ("to_version_id") REFERENCES "public"."regulation_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulation_amendment_impacts"
  ADD CONSTRAINT "reg_amendment_impacts_triggered_by_user_id_users_id_fk"
  FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "reg_amendment_impacts_pair_lang_uidx"
  ON "regulation_amendment_impacts" (
    "regulation_id",
    "from_version_number",
    "to_version_number",
    "language_code"
  );
--> statement-breakpoint
CREATE INDEX "reg_amendment_impacts_status_retry_idx"
  ON "regulation_amendment_impacts" ("status", "next_retry_at");
--> statement-breakpoint
CREATE INDEX "reg_amendment_impacts_reg_updated_idx"
  ON "regulation_amendment_impacts" ("regulation_id", "updated_at");
