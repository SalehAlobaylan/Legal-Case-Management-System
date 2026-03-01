CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email_alerts" boolean DEFAULT true NOT NULL,
	"push_notifications" boolean DEFAULT true NOT NULL,
	"ai_suggestions" boolean DEFAULT true NOT NULL,
	"regulation_updates" boolean DEFAULT true NOT NULL,
	"case_updates" boolean DEFAULT true NOT NULL,
	"system_alerts" boolean DEFAULT true NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" varchar(5) DEFAULT '22:00',
	"quiet_hours_end" varchar(5) DEFAULT '07:00',
	"digest_enabled" boolean DEFAULT false NOT NULL,
	"digest_frequency" varchar(10) DEFAULT 'daily',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
