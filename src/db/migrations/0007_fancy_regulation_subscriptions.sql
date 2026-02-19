CREATE TABLE "regulation_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" integer NOT NULL,
	"regulation_id" integer NOT NULL,
	"source_url" text NOT NULL,
	"check_interval_hours" integer DEFAULT 24 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp,
	"last_etag" text,
	"last_modified" timestamp,
	"last_content_hash" varchar(64),
	"next_check_at" timestamp DEFAULT now() NOT NULL,
	"subscribed_via" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" ADD CONSTRAINT "regulation_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" ADD CONSTRAINT "regulation_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulation_subscriptions" ADD CONSTRAINT "regulation_subscriptions_regulation_id_regulations_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reg_sub_user_reg_unique_idx" ON "regulation_subscriptions" USING btree ("user_id","regulation_id");--> statement-breakpoint
CREATE INDEX "reg_sub_org_active_next_idx" ON "regulation_subscriptions" USING btree ("organization_id","is_active","next_check_at");--> statement-breakpoint
CREATE INDEX "reg_sub_regulation_idx" ON "regulation_subscriptions" USING btree ("regulation_id");
