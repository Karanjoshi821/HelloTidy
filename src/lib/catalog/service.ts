import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { preferredPackId, product } from "@/config/products";
import { getDb, type Executor } from "../db";
import { packs, storeSettings, type PackRow } from "../db/schema";
import type { Pack, Storefront } from "./types";

/**
 * Catalogue reads. Uncached: the order flow and the admin use these directly.
 * Public pages use the cached copy in ./storefront.ts.
 */

export type CheckoutSettings = { codFee: number; codMaxOrderValue: number };

export function isPackAvailable(row: Pick<PackRow, "status" | "trackInventory" | "stock">): boolean {
  return row.status === "active" && (!row.trackInventory || row.stock > 0);
}

export function toPublicPack(row: PackRow): Pack {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    count: row.count,
    price: row.price,
    mrp: row.mrp,
    badge: row.badge,
    blurb: row.blurb,
    available: isPackAvailable(row),
  };
}

export async function readCheckoutSettings(db: Executor): Promise<CheckoutSettings> {
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1)).limit(1);
  if (!row) throw new Error("Store settings are missing. Run the database migrations (npm run db:migrate).");
  return { codFee: row.codFee, codMaxOrderValue: row.codMaxOrderValue };
}

/** Builds the public catalogue: visible packs of the product, in display order. */
export async function loadStorefront(executor?: Executor): Promise<Storefront> {
  const db = executor ?? (await getDb());
  const rows = await db
    .select()
    .from(packs)
    .where(and(eq(packs.productSlug, product.slug), eq(packs.status, "active")))
    .orderBy(asc(packs.position), asc(packs.price));
  const settings = await readCheckoutSettings(db);

  const list = rows.map(toPublicPack);
  const defaultPackId =
    list.find((p) => p.id === preferredPackId && p.available)?.id ??
    list.find((p) => p.available)?.id ??
    list[0]?.id ??
    null;
  return { packs: list, defaultPackId, ...settings };
}
