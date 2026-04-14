CREATE TABLE "client_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"sender_user_id" uuid,
	"type" varchar(50) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_messages_org_idx" ON "client_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_messages_client_idx" ON "client_messages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_messages_status_idx" ON "client_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_messages_created_at_idx" ON "client_messages" USING btree ("created_at");