CREATE TYPE "public"."discount_type" AS ENUM('percent', 'flat');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('web', 'admin');--> statement-breakpoint
CREATE TYPE "public"."pack_status" AS ENUM('active', 'hidden');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cod_blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"type" "discount_type" NOT NULL,
	"value" integer NOT NULL,
	"min_order" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"once_per_customer" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_value_check" CHECK (("discounts"."type" = 'percent' and "discounts"."value" between 1 and 90) or ("discounts"."type" = 'flat' and "discounts"."value" > 0))
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" text NOT NULL,
	"delta" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" text NOT NULL,
	"order_id" uuid,
	"note" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packs" (
	"id" text PRIMARY KEY NOT NULL,
	"product_slug" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"count" integer NOT NULL,
	"price" integer NOT NULL,
	"mrp" integer NOT NULL,
	"badge" text,
	"blurb" text DEFAULT '' NOT NULL,
	"weight_grams" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "pack_status" DEFAULT 'active' NOT NULL,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packs_price_check" CHECK ("packs"."price" > 0 and "packs"."mrp" >= "packs"."price" and "packs"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cod_fee" integer NOT NULL,
	"cod_max_order_value" integer NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_singleton" CHECK ("store_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_deducted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" "order_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cod_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_created_idx" ON "customers" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_code_idx" ON "discounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "inventory_movements_pack_idx" ON "inventory_movements" USING btree ("pack_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "packs_sku_idx" ON "packs" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "packs_product_idx" ON "packs" USING btree ("product_slug","position");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_coupon_idx" ON "orders" USING btree ("coupon_code");--> statement-breakpoint
-- Seed: the catalogue, checkout settings and coupon that used to live in code.
INSERT INTO "packs" ("id", "product_slug", "sku", "name", "count", "price", "mrp", "badge", "blurb", "weight_grams", "position") VALUES
	('pack-10', 'magic-eraser-sponge', 'KIVO-SPONGE-10', 'Starter Pack', 10, 34900, 59900, NULL, 'Try it on your toughest stains', 250, 1),
	('pack-25', 'magic-eraser-sponge', 'KIVO-SPONGE-25', 'Home Pack', 25, 54900, 109900, 'Most popular', 'Enough for every room, for months', 500, 2),
	('pack-50', 'magic-eraser-sponge', 'KIVO-SPONGE-50', 'Mega Pack', 50, 89900, 199900, 'Best value', 'For big homes, offices and sharing', 1000, 3)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "store_settings" ("id", "cod_fee", "cod_max_order_value") VALUES (1, 4900, 300000) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "discounts" ("code", "description", "type", "value", "min_order", "active")
VALUES ('KIVO50', '₹50 off on orders above ₹500', 'flat', 5000, 50000, false)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Backfill: one customer per phone number from existing orders (latest name, latest known email, first order date).
INSERT INTO "customers" ("phone", "name", "email", "created_at")
SELECT DISTINCT ON (o."phone")
	o."phone",
	o."customer_name",
	(SELECT e."email" FROM "orders" e WHERE e."phone" = o."phone" AND e."email" IS NOT NULL ORDER BY e."created_at" DESC LIMIT 1),
	(SELECT min(f."created_at") FROM "orders" f WHERE f."phone" = o."phone")
FROM "orders" o
ORDER BY o."phone", o."created_at" DESC
ON CONFLICT ("phone") DO NOTHING;--> statement-breakpoint
UPDATE "orders" SET "customer_id" = c."id" FROM "customers" c WHERE c."phone" = "orders"."phone" AND "orders"."customer_id" IS NULL;
