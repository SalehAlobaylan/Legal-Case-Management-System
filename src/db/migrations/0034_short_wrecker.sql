CREATE TABLE "admin_ai_case_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"case_id" integer NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"urgency" varchar(20) DEFAULT 'low' NOT NULL,
	"confidence" varchar(20) DEFAULT 'medium' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text,
	"method" varchar(120),
	"model_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_ai_org_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"summary" jsonb DEFAULT '{"headline":"","bullets":[]}'::jsonb NOT NULL,
	"aggregate_risk" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workload_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quality_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"method" varchar(120),
	"confidence" varchar(20) DEFAULT 'medium' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_ai_case_profiles" ADD CONSTRAINT "admin_ai_case_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_case_profiles" ADD CONSTRAINT "admin_ai_case_profiles_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_org_snapshots" ADD CONSTRAINT "admin_ai_org_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_ai_case_profiles_org_case_uidx" ON "admin_ai_case_profiles" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "admin_ai_case_profiles_org_score_idx" ON "admin_ai_case_profiles" USING btree ("organization_id","score" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "admin_ai_org_snapshots_org_uidx" ON "admin_ai_org_snapshots" USING btree ("organization_id");