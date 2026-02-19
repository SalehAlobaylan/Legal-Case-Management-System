CREATE TABLE "regulation_monitor_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"status" varchar(30) NOT NULL,
	"trigger_source" varchar(50) DEFAULT 'worker' NOT NULL,
	"triggered_by_user_id" uuid,
	"dry_run" boolean DEFAULT false NOT NULL,
	"scanned" integer DEFAULT 0 NOT NULL,
	"changed" integer DEFAULT 0 NOT NULL,
	"versions_created" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error_message" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulation_monitor_runs" ADD CONSTRAINT "regulation_monitor_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "reg_monitor_runs_started_at_idx" ON "regulation_monitor_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX "reg_monitor_runs_status_idx" ON "regulation_monitor_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "reg_monitor_runs_trigger_source_idx" ON "regulation_monitor_runs" USING btree ("trigger_source");
