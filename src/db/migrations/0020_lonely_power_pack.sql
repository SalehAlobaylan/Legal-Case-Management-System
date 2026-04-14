CREATE TABLE "client_portal_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"fields_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"intake_form_id" integer,
	"organization_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"source" varchar(64) DEFAULT 'public_form' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"trigger_type" varchar(64) NOT NULL,
	"trigger_value" varchar(128),
	"action_type" varchar(32) NOT NULL,
	"template_body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_portal_accounts" ADD CONSTRAINT "client_portal_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_accounts" ADD CONSTRAINT "client_portal_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_accounts" ADD CONSTRAINT "client_portal_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_intake_form_id_intake_forms_id_fk" FOREIGN KEY ("intake_form_id") REFERENCES "public"."intake_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_accounts_org_user_unique" ON "client_portal_accounts" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_accounts_org_client_unique" ON "client_portal_accounts" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "client_portal_accounts_user_idx" ON "client_portal_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "client_portal_accounts_client_idx" ON "client_portal_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "intake_forms_org_idx" ON "intake_forms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intake_submissions_org_idx" ON "intake_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intake_submissions_form_idx" ON "intake_submissions" USING btree ("intake_form_id");--> statement-breakpoint
CREATE INDEX "automation_rules_org_idx" ON "automation_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "automation_rules_trigger_idx" ON "automation_rules" USING btree ("trigger_type");