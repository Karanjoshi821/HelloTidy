CREATE TYPE "public"."admin_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('new', 'handled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rto');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cod', 'prepaid');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'staff' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"topic" text NOT NULL,
	"order_number" text,
	"message" text NOT NULL,
	"status" "contact_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"pack_count" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"public_token" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "order_status" NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address1" text NOT NULL,
	"address2" text,
	"landmark" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"shipping_fee" integer DEFAULT 0 NOT NULL,
	"cod_fee" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"coupon_code" text,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"courier_name" text,
	"awb_code" text,
	"tracking_url" text,
	"admin_notes" text,
	"client_ip" text,
	"user_agent" text,
	"fbp" text,
	"fbc" text,
	"attribution" jsonb,
	"confirmed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_idx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contact_messages_status_idx" ON "contact_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_token_idx" ON "orders" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_razorpay_order_id_idx" ON "orders" USING btree ("razorpay_order_id") WHERE "orders"."razorpay_order_id" is not null;--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_phone_idx" ON "orders" USING btree ("phone");