-- Orders refunded before refunds were tracked were marked payment_status = 'refunded'
-- with no amount. Record them as fully refunded, so revenue and customer totals
-- don't count them, and keep a matching entry in the refunds history.
INSERT INTO "refunds" ("order_id", "amount", "reason", "actor", "created_at")
SELECT o."id", o."total", 'Refunded before refunds were tracked', 'system', o."updated_at"
FROM "orders" o
WHERE o."payment_status" = 'refunded' AND o."refunded_amount" = 0;--> statement-breakpoint
UPDATE "orders" SET "refunded_amount" = "total" WHERE "payment_status" = 'refunded' AND "refunded_amount" = 0;
