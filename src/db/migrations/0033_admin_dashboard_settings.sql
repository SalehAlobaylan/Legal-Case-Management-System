CREATE TABLE IF NOT EXISTS "admin_dashboard_settings" (
  "organization_id" integer PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "stale_case_days" integer DEFAULT 30 NOT NULL,
  "hearing_soon_days" integer DEFAULT 7 NOT NULL,
  "workload_high_open_cases" integer DEFAULT 12 NOT NULL,
  "ai_review_high_count" integer DEFAULT 10 NOT NULL,
  "monitor_stale_minutes" integer DEFAULT 360 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_dashboard_settings_org_uidx" ON "admin_dashboard_settings" USING btree ("organization_id");
