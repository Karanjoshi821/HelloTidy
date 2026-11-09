import "server-only";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Tx } from "../db";
import { inventoryMovements, orderItems, packs, type PackRow } from "../db/schema";
import { OrderError } from "../orders/errors";
import { isPackAvailable } from "./service";

/**
 * Stock bookkeeping. Stock is taken when an order becomes real (COD placed,
 * online payment captured, manual order created) and given back when a
 * cancelled or returned order is restocked. Each order line records how many
 * units it took, so a restock can never return more than was taken.
 */

/** What a stock change means outside the database: refresh the storefront, alert the owner. */
export type StockEffect = { availabilityChanged: boolean; alerts: string[] };

export function noStockEffect(): StockEffect {
  return { availabilityChanged: false, alerts: [] };
}

export function mergeStockEffects(...effects: (StockEffect | null | undefined)[]): StockEffect {
  const out = noStockEffect();
  for (const e of effects) {
    if (!e) continue;
    out.availabilityChanged ||= e.availabilityChanged;
    out.alerts.push(...e.alerts);
  }
  return out;
}

/**
 * Locks pack rows in id order, so concurrent orders for the same pack queue up
 * (no double-selling the last unit) and can't deadlock each other.
 */
export async function lockPacks(tx: Tx, ids: string[]): Promise<PackRow[]> {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return [];
  return tx.select().from(packs).where(inArray(packs.id, unique)).orderBy(asc(packs.id)).for("update");
}

function describeLevel(row: PackRow, before: number, after: number, orderNumber: string | null): string | null {
  if (after < 0) {
    return `Oversold: ${row.name} (${row.sku}) is at ${after} after order ${orderNumber ?? "-"}. Restock it or contact the customer.`;
  }
  if (before > 0 && after <= 0) return `Out of stock: ${row.name} (${row.sku}) just sold out.`;
  if (before > row.lowStockThreshold && after <= row.lowStockThreshold) {
    return `Low stock: ${row.name} (${row.sku}) has ${after} left.`;
  }
  return null;
}

/**
 * Takes stock for an order's lines. With `allowOversell` (a payment already
 * captured) stock may go negative and the owner is alerted; otherwise a
 * shortage throws an OrderError and the caller's transaction rolls back.
 * Pass `locked` when the caller already holds the pack locks.
 */
export async function deductStock(
  tx: Tx,
  input: {
    orderId: string;
    orderNumber: string;
    items: { id: string; packId: string; qty: number }[];
    actor: string;
    allowOversell: boolean;
    locked?: PackRow[];
  },
): Promise<StockEffect> {
  const rows =
    input.locked ??
    (await lockPacks(
      tx,
      input.items.map((i) => i.packId),
    ));
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  const effect = noStockEffect();

  for (const item of input.items) {
    const row = byId.get(item.packId);
    if (!row || !row.trackInventory) continue;
    const before = row.stock;
    if (!input.allowOversell && before < item.qty) {
      throw new OrderError(
        before <= 0 ? `${row.name} is out of stock right now.` : `Only ${before} of the ${row.name} left in stock.`,
      );
    }
    const after = before - item.qty;
    row.stock = after;
    await tx.update(packs).set({ stock: after }).where(eq(packs.id, row.id));
    await tx.update(orderItems).set({ stockDeducted: item.qty }).where(eq(orderItems.id, item.id));
    await tx.insert(inventoryMovements).values({
      packId: row.id,
      delta: -item.qty,
      stockAfter: after,
      reason: "order",
      orderId: input.orderId,
      note: input.orderNumber,
      actor: input.actor,
    });
    if (isPackAvailable({ ...row, stock: before }) !== isPackAvailable(row)) effect.availabilityChanged = true;
    const alert = describeLevel(row, before, after, input.orderNumber);
    if (alert) effect.alerts.push(alert);
  }
  return effect;
}

/** Checks there is enough tracked stock without taking it (online orders before payment). */
export function assertInStock(rows: PackRow[], items: { packId: string; qty: number }[]): void {
  for (const item of items) {
    const row = rows.find((r) => r.id === item.packId);
    if (!row || !row.trackInventory) continue;
    if (row.stock < item.qty) {
      throw new OrderError(
        row.stock <= 0
          ? `${row.name} is out of stock right now.`
          : `Only ${row.stock} of the ${row.name} left in stock.`,
      );
    }
  }
}

/** Returns the stock a cancelled or returned order took. Safe to call twice: lines are zeroed. */
export async function restockOrder(
  tx: Tx,
  input: { orderId: string; orderNumber: string; reason: "cancelled" | "returned"; actor: string },
): Promise<StockEffect> {
  const items = await tx
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, input.orderId), gt(orderItems.stockDeducted, 0)));
  const effect = noStockEffect();
  if (!items.length) return effect;

  const rows = await lockPacks(
    tx,
    items.map((i) => i.packId),
  );
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const item of items) {
    const row = byId.get(item.packId);
    if (!row) continue;
    const before = row.stock;
    const after = before + item.stockDeducted;
    row.stock = after;
    await tx.update(packs).set({ stock: after }).where(eq(packs.id, row.id));
    await tx.update(orderItems).set({ stockDeducted: 0 }).where(eq(orderItems.id, item.id));
    await tx.insert(inventoryMovements).values({
      packId: row.id,
      delta: item.stockDeducted,
      stockAfter: after,
      reason: input.reason,
      orderId: input.orderId,
      note: input.orderNumber,
      actor: input.actor,
    });
    if (isPackAvailable({ ...row, stock: before }) !== isPackAvailable(row)) effect.availabilityChanged = true;
  }
  return effect;
}
