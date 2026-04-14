ALTER TABLE "client_messages" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "max_retries" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "next_retry_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "is_read" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "client_messages_next_retry_at_idx" ON "client_messages" USING btree ("next_retry_at");