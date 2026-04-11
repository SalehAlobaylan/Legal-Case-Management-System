CREATE TABLE "client_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_type" varchar(100),
	"file_size" integer,
	"uploaded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "lead_status" varchar(50) DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;