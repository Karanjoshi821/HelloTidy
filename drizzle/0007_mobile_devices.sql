CREATE TABLE "admin_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"platform" text DEFAULT 'android' NOT NULL,
	"device_name" text,
	"notify_orders" boolean DEFAULT true NOT NULL,
	"notify_alerts" boolean DEFAULT true NOT NULL,
	"notify_messages" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_devices" ADD CONSTRAINT "admin_devices_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_devices" ADD CONSTRAINT "admin_devices_session_id_admin_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."admin_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_devices_token_idx" ON "admin_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "admin_devices_user_idx" ON "admin_devices" USING btree ("user_id");