import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { product } from "@/config/products";
import { recordAudit } from "../audit";
import { startOfIndianDay } from "../dates";
import { getDb } from "../db";
import { isUniqueViolation } from "../db/errors";
import { inventoryMovements, orderItems, orders, packs, type PackRow } from "../db/schema";
import { formatPaise } from "../money";
import { UserError } from "../orders/errors";
import { lockPacks } from "./inventory";

/**
 * Products admin: packs (variants), prices and stock. Every change is written
 * to the activity log; stock changes also to the inventory history. Callers
 * expire the cached storefront afterwards (see ./invalidate.ts).
 */

export type PackInput = {
  name: string;
  sku: string;
  count: number;
  price: number;
  mrp: number;
  badge: string | null;
  blurb: string;
  weightGrams: number;
  position: number;
  status: "active" | "hidden";
  trackInventory: boolean;
  lowStockThreshold: number;
};

export const STOCK_REASONS = {
  received: "Stock received",
  damaged: "Damaged / lost",
  returned: "Customer return",
  correction: "Count correction",
} as const;
export type StockReason = keyof typeof STOCK_REASONS;

const SOLD_STATUSES = ["confirmed", "processing", "shipped", "delivered"] as const;

function soldSince(since: Date) {
  // The outer table is spelled out: drizzle leaves columns unqualified in single-table queries.
  return sql<number>`(select coalesce(sum(oi.qty), 0) from order_items oi join orders o on o.id = oi.order_id where oi.pack_id = "packs"."id" and o.status in ('confirmed', 'processing', 'shipped', 'delivered') and o.created_at >= ${since})`.mapWith(
    Number,
  );
}

export async function listPacksAdmin() {
  const db = await getDb();
  return db
    .select({
      pack: packs,
      sold30: soldSince(startOfIndianDay(29)),
    })
    .from(packs)
    .orderBy(asc(packs.productSlug), asc(packs.position), asc(packs.price));
}

export async function getPackAdmin(id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ pack: packs, sold30: soldSince(startOfIndianDay(29)) })
    .from(packs)
    .where(eq(packs.id, id))
    .limit(1);
  if (!row) return null;
  const [movements, [{ orders: orderCount }], [{ units: unitsAllTime }]] = await Promise.all([
    db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.packId, id))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(50),
    db.select({ orders: count() }).from(orderItems).where(eq(orderItems.packId, id)),
    db
      .select({ units: sql<number>`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.packId, id), inArray(orders.status, [...SOLD_STATUSES]))),
  ]);
  return { ...row, movements, orderCount: Number(orderCount), unitsAllTime };
}

function describeChanges(before: PackRow, after: PackInput): string[] {
  const out: string[] = [];
  const money = (k: "price" | "mrp", label: string) => {
    if (before[k] !== after[k]) out.push(`${label} ${formatPaise(before[k])} → ${formatPaise(after[k])}`);
  };
  money("price", "price");
  money("mrp", "MRP");
  if (before.name !== after.name) out.push(`name "${before.name}" → "${after.name}"`);
  if (before.sku !== after.sku) out.push(`SKU ${before.sku} → ${after.sku}`);
  if (before.count !== after.count) out.push(`pieces ${before.count} → ${after.count}`);
  if (before.status !== after.status) out.push(after.status === "active" ? "made visible" : "hidden from the store");
  if (before.trackInventory !== after.trackInventory) {
    out.push(after.trackInventory ? "stock tracking on" : "stock tracking off");
  }
  if ((before.badge ?? null) !== (after.badge ?? null)) out.push(`badge "${after.badge ?? "none"}"`);
  if (before.blurb !== after.blurb) out.push("description");
  if (before.weightGrams !== after.weightGrams) out.push(`weight ${after.weightGrams} g`);
  if (before.position !== after.position) out.push(`position ${after.position}`);
  if (before.lowStockThreshold !== after.lowStockThreshold) out.push(`low-stock alert at ${after.lowStockThreshold}`);
  return out;
}

function skuTaken(error: unknown): boolean {
  return isUniqueViolation(error, "packs_sku_idx");
}

export async function createPack(input: PackInput & { stock: number }, actor: string): Promise<string> {
  const db = await getDb();
  const base = `pack-${input.count}`;
  try {
    return await db.transaction(async (tx) => {
      const taken = new Set(
        (
          await tx
            .select({ id: packs.id })
            .from(packs)
            .where(sql`${packs.id} = ${base} or ${packs.id} like ${`${base}-%`}`)
        ).map((r) => r.id),
      );
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;

      await tx.insert(packs).values({ ...input, id, productSlug: product.slug });
      if (input.trackInventory && input.stock !== 0) {
        await tx.insert(inventoryMovements).values({
          packId: id,
          delta: input.stock,
          stockAfter: input.stock,
          reason: "received",
          note: "Opening stock",
          actor,
        });
      }
      await recordAudit(tx, {
        actor,
        action: "pack.created",
        entityType: "pack",
        entityId: id,
        summary: `Added ${input.name} (${input.count} pcs) at ${formatPaise(input.price)}, MRP ${formatPaise(input.mrp)}${input.status === "hidden" ? ", hidden" : ""}`,
      });
      return id;
    });
  } catch (error) {
    if (skuTaken(error)) throw new UserError("Another pack already uses this SKU.");
    throw error;
  }
}

/**
 * Saves a pack. `stock` sets the on-hand count only when it was changed in the
 * form; `expected` is the count the form showed, so an order that came in
 * meanwhile isn't silently overwritten.
 */
export async function updatePack(
  id: string,
  input: PackInput & { stock?: { expected: number; value: number } },
  actor: string,
): Promise<void> {
  const db = await getDb();
  try {
    await db.transaction(async (tx) => {
      const [before] = await lockPacks(tx, [id]);
      if (!before) throw new UserError("Pack not found.");
      const { stock, ...fields } = input;
      const changes = describeChanges(before, fields);

      let stockPatch: { stock: number } | Record<string, never> = {};
      if (stock && stock.value !== stock.expected) {
        if (before.stock !== stock.expected) {
          throw new UserError(
            `Stock changed to ${before.stock} while you were editing (an order or another admin). Reload the page and try again.`,
          );
        }
        stockPatch = { stock: stock.value };
        await tx.insert(inventoryMovements).values({
          packId: id,
          delta: stock.value - before.stock,
          stockAfter: stock.value,
          reason: "correction",
          note: "Edited on the product page",
          actor,
        });
        changes.push(`stock ${before.stock} → ${stock.value}`);
      }
      if (!changes.length) return;

      await tx
        .update(packs)
        .set({ ...fields, ...stockPatch })
        .where(eq(packs.id, id));
      await recordAudit(tx, {
        actor,
        action: "pack.updated",
        entityType: "pack",
        entityId: id,
        summary: `${before.name}: ${changes.join(", ")}`,
      });
    });
  } catch (error) {
    if (skuTaken(error)) throw new UserError("Another pack already uses this SKU.");
    throw error;
  }
}

/** Adds or removes stock with a reason (stock received, damaged, count correction…). */
export async function adjustStock(
  id: string,
  input: { delta: number; reason: StockReason; note: string | null },
  actor: string,
): Promise<{ stock: number }> {
  if (!Number.isInteger(input.delta) || input.delta === 0)
    throw new UserError("Enter how many units to add or remove.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await lockPacks(tx, [id]);
    if (!row) throw new UserError("Pack not found.");
    const stock = row.stock + input.delta;
    await tx.update(packs).set({ stock }).where(eq(packs.id, id));
    await tx.insert(inventoryMovements).values({
      packId: id,
      delta: input.delta,
      stockAfter: stock,
      reason: input.reason,
      note: input.note,
      actor,
    });
    await recordAudit(tx, {
      actor,
      action: "pack.stock_adjusted",
      entityType: "pack",
      entityId: id,
      summary: `${row.name}: ${input.delta > 0 ? "+" : ""}${input.delta} (${STOCK_REASONS[input.reason]}), now ${stock}`,
    });
    return { stock };
  });
}

/** Deletes a pack that was never ordered. Packs with orders can only be hidden, to keep order history intact. */
export async function deletePack(id: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [row] = await lockPacks(tx, [id]);
    if (!row) throw new UserError("Pack not found.");
    const [{ n }] = await tx.select({ n: count() }).from(orderItems).where(eq(orderItems.packId, id));
    if (Number(n) > 0) throw new UserError("This pack has orders, so it can't be deleted. Hide it instead.");
    await tx.delete(packs).where(eq(packs.id, id));
    await recordAudit(tx, {
      actor,
      action: "pack.deleted",
      entityType: "pack",
      entityId: id,
      summary: `Deleted ${row.name} (${row.sku})`,
    });
  });
}
