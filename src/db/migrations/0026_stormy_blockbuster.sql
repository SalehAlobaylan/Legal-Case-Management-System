CREATE TABLE "ai_evaluation_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"case_id" integer NOT NULL,
	"regulation_id" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"created_by" uuid,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" varchar(1000),
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_run_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"case_id" integer NOT NULL,
	"total_relevant" integer DEFAULT 0 NOT NULL,
	"recall_at_1" real DEFAULT 0 NOT NULL,
	"recall_at_3" real DEFAULT 0 NOT NULL,
	"recall_at_5" real DEFAULT 0 NOT NULL,
	"precision_at_1" real DEFAULT 0 NOT NULL,
	"precision_at_3" real DEFAULT 0 NOT NULL,
	"precision_at_5" real DEFAULT 0 NOT NULL,
	"reciprocal_rank" real DEFAULT 0 NOT NULL,
	"ndcg_at_5" real DEFAULT 0 NOT NULL,
	"top5_score_stddev" real DEFAULT 0 NOT NULL,
	"diagnostics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_evaluation_labels" ADD CONSTRAINT "ai_evaluation_labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_labels" ADD CONSTRAINT "ai_evaluation_labels_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_labels" ADD CONSTRAINT "ai_evaluation_labels_regulation_id_regulations_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_labels" ADD CONSTRAINT "ai_evaluation_labels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_runs" ADD CONSTRAINT "ai_evaluation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_runs" ADD CONSTRAINT "ai_evaluation_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_run_cases" ADD CONSTRAINT "ai_evaluation_run_cases_run_id_ai_evaluation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_run_cases" ADD CONSTRAINT "ai_evaluation_run_cases_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_eval_labels_org_case_reg_unique" ON "ai_evaluation_labels" USING btree ("organization_id","case_id","regulation_id");--> statement-breakpoint
CREATE INDEX "ai_eval_labels_org_case_idx" ON "ai_evaluation_labels" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "ai_eval_runs_org_created_idx" ON "ai_evaluation_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_eval_run_cases_run_case_idx" ON "ai_evaluation_run_cases" USING btree ("run_id","case_id");--> statement-breakpoint
CREATE INDEX "ai_eval_run_cases_case_idx" ON "ai_evaluation_run_cases" USING btree ("case_id");