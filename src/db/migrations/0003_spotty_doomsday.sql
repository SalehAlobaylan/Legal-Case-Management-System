CREATE TABLE "user_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"title" varchar(500) NOT NULL,
	"reference_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"awarded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "specialization" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_activities_user_idx" ON "user_activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_activities_created_at_idx" ON "user_activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_achievements_user_idx" ON "user_achievements" USING btree ("user_id");