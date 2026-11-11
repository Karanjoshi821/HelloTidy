CREATE TABLE "visitor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"path" text,
	"seconds" integer DEFAULT 0 NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"key" text NOT NULL,
	"first_visit" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"engaged_seconds" integer DEFAULT 0 NOT NULL,
	"landing_page" text,
	"exit_page" text,
	"current_page" text,
	"referrer" text,
	"source" text,
	"medium" text,
	"campaign" text,
	"device_type" text,
	"browser" text,
	"os" text,
	"country" text,
	"region" text,
	"city" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anon_key" text,
	"anonymous" boolean DEFAULT true NOT NULL,
	"consent_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"engaged_seconds" integer DEFAULT 0 NOT NULL,
	"source" text,
	"medium" text,
	"campaign" text,
	"referrer" text,
	"landing_page" text,
	"device_type" text,
	"os" text,
	"browser" text,
	"screen" text,
	"language" text,
	"timezone" text,
	"country" text,
	"region" text,
	"city" text,
	"device_model" text,
	"postal_code" text,
	"ip" text,
	"customer_id" uuid
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "visitor_id" uuid;--> statement-breakpoint
ALTER TABLE "visitor_events" ADD CONSTRAINT "visitor_events_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_events" ADD CONSTRAINT "visitor_events_session_id_visitor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_events_session_idx" ON "visitor_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "visitor_events_visitor_idx" ON "visitor_events" USING btree ("visitor_id","created_at");--> statement-breakpoint
CREATE INDEX "visitor_events_type_created_idx" ON "visitor_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_sessions_visitor_key_idx" ON "visitor_sessions" USING btree ("visitor_id","key");--> statement-breakpoint
CREATE INDEX "visitor_sessions_started_idx" ON "visitor_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "visitor_sessions_last_seen_idx" ON "visitor_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visitors_anon_key_idx" ON "visitors" USING btree ("anon_key") WHERE "visitors"."anon_key" is not null;--> statement-breakpoint
CREATE INDEX "visitors_last_seen_idx" ON "visitors" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "visitors_customer_idx" ON "visitors" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_visit_id_visitor_sessions_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_visit_idx" ON "orders" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "orders_visitor_idx" ON "orders" USING btree ("visitor_id");