ALTER TABLE "orders" ADD COLUMN "shiprocket_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shiprocket_shipment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shiprocket_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shiprocket_error" text;