CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"license_number" varchar(100),
	"contact_info" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"role" varchar(50) DEFAULT 'lawyer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"case_number" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"case_type" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"client_info" text,
	"assigned_lawyer_id" integer,
	"court_jurisdiction" varchar(255),
	"filing_date" date,
	"next_hearing" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"regulation_number" varchar(100),
	"source_url" text,
	"category" varchar(100),
	"jurisdiction" varchar(255),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"effective_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulation_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"regulation_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"raw_html" text,
	"artifact_uri" varchar(500),
	"changes_summary" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(50) DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_regulation_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"regulation_id" integer NOT NULL,
	"similarity_score" numeric(5, 4),
	"method" varchar(20) DEFAULT 'ai' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" integer,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_lawyer_id_users_id_fk" FOREIGN KEY ("assigned_lawyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulation_versions" ADD CONSTRAINT "regulation_versions_regulation_id_regulations_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_regulation_links" ADD CONSTRAINT "case_regulation_links_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_regulation_links" ADD CONSTRAINT "case_regulation_links_regulation_id_regulations_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_regulation_links" ADD CONSTRAINT "case_regulation_links_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_org_case_number_idx" ON "cases" USING btree ("organization_id","case_number");--> statement-breakpoint
CREATE INDEX "cases_assigned_lawyer_idx" ON "cases" USING btree ("assigned_lawyer_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "regulations_category_idx" ON "regulations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "regulations_status_idx" ON "regulations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "regulation_versions_reg_version_idx" ON "regulation_versions" USING btree ("regulation_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "case_regulation_unique_idx" ON "case_regulation_links" USING btree ("case_id","regulation_id");--> statement-breakpoint
CREATE INDEX "case_reg_score_idx" ON "case_regulation_links" USING btree ("case_id","similarity_score");