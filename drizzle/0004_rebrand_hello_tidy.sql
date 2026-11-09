-- Rename the seeded SKUs and coupon from Kivo to Hello Tidy. SKUs or codes edited in the admin are left alone.
UPDATE "packs" SET "sku" = 'HT-' || substr("sku", 6) WHERE "sku" LIKE 'KIVO-%';--> statement-breakpoint
UPDATE "discounts" SET "code" = 'HELLO50'
WHERE "code" = 'KIVO50' AND NOT EXISTS (SELECT 1 FROM "discounts" WHERE "code" = 'HELLO50');
