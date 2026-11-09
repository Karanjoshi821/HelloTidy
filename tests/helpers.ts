import { randomInt, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { packs, type PackRow } from "@/lib/db/schema";
import { checkoutSchema, type CheckoutData } from "@/lib/validation";

/** Seeded catalogue values (drizzle/0001_admin_panel.sql), in paise. */
export const SEED = {
  pack25: { id: "pack-25", price: 54900, mrp: 109900 },
  pack50: { id: "pack-50", price: 89900 },
  codFee: 4900,
  codMaxOrderValue: 300000,
};

export const ctx = { ip: "203.0.113.7", userAgent: "vitest", fbp: "fb.1.123.456" };

/** A random valid Indian mobile, so tests sharing a database don't share customers. */
export function randomPhone(): string {
  return `9${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

export function checkout(overrides: Partial<Record<string, unknown>> = {}): CheckoutData {
  return checkoutSchema.parse({
    checkoutId: randomUUID(),
    lines: [{ packId: SEED.pack25.id, qty: 1 }],
    paymentMethod: "cod",
    name: "Priya Sharma",
    phone: randomPhone(),
    address1: "Flat 12, Shanti Apartments, MG Road",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    attribution: { utmSource: "facebook", utmCampaign: "launch" },
    ...overrides,
  });
}

/** A private pack for tests that change stock, so they never affect each other or the seeded packs. */
export async function testPack(overrides: Partial<PackRow> = {}): Promise<PackRow> {
  const db = await getDb();
  const id = `test-${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(packs)
    .values({
      id,
      productSlug: "test-product",
      sku: `SKU-${id}`,
      name: `Test ${id}`,
      count: 10,
      price: 30000,
      mrp: 50000,
      weightGrams: 250,
      ...overrides,
    })
    .returning();
  return row;
}

export async function getPackRow(id: string): Promise<PackRow> {
  const db = await getDb();
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
  return row;
}
