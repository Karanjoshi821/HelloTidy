CREATE TYPE "public"."cart_lead_status" AS ENUM('open', 'called', 'converted', 'opted_out', 'closed');--> statement-breakpoint
CREATE TABLE "cart_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" text NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal" integer NOT NULL,
	"items_summary" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" "cart_lead_status" DEFAULT 'open' NOT NULL,
	"notified_at" timestamp with time zone,
	"call_attempts" integer DEFAULT 0 NOT NULL,
	"last_call_at" timestamp with time zone,
	"last_outcome" text,
	"call_summary" text,
	"coupon_code" text,
	"coupon_sent_at" timestamp with time zone,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "cart_leads" ADD CONSTRAINT "cart_leads_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_leads_client_key_idx" ON "cart_leads" USING btree ("client_key");--> statement-breakpoint
CREATE INDEX "cart_leads_phone_idx" ON "cart_leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "cart_leads_status_created_idx" ON "cart_leads" USING btree ("status","created_at");