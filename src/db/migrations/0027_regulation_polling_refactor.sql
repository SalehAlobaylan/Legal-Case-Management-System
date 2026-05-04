CREATE TABLE "integration_webhook_endpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(200),
	"events" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"last_delivered_at" timestamp,
	"last_status_code" integer,
	"last_error" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"provider" varchar(60) NOT NULL,
	"status" varchar(30) DEFAULT 'not_connected' NOT NULL,
	"setup_state" varchar(120),
	"display_name" varchar(120),
	"config" jsonb DEFAULT '{}'::jsonb,
	"credentials_encrypted" text,
	"connected_by" uuid,
	"connected_at" timestamp,
	"last_sync_at" timestamp,
	"error_message" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "reg_sub_org_active_next_idx";--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "monitoring_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "check_interval_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "last_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "last_content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "last_etag" text;--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "last_modified" timestamp;--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "next_check_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_webhook_endpoints" ADD CONSTRAINT "integration_webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_webhooks_org_idx" ON "integration_webhook_endpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integration_webhooks_active_idx" ON "integration_webhook_endpoints" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_provider_unique" ON "integrations" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "integrations_org_idx" ON "integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integrations_status_idx" ON "integrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "regulations_monitoring_due_idx" ON "regulations" USING btree ("monitoring_enabled","next_check_at");--> statement-breakpoint
CREATE INDEX "reg_sub_org_active_idx" ON "regulation_subscriptions" USING btree ("organization_id","is_active");--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "source_url";--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "check_interval_hours";--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "last_checked_at";--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "last_etag";--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "last_modified";--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "last_content_hash";--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" DROP COLUMN "next_check_at";