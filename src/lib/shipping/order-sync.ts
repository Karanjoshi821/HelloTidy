import "server-only";
import { eq } from "drizzle-orm";
import { siteConfig } from "@/config/site";
import { getDb } from "../db";
import { orderEvents, orders, packs } from "../db/schema";
import { shiprocketConfig } from "../env";
import { getOrderById } from "../orders/service";
import {
  cancelShiprocketOrder,
  createShiprocketOrder,
  ShiprocketError,
  updateShiprocketOrder,
} from "./shiprocket";
import { shiprocketOrderPayload } from "./shiprocket-order";

export type SyncResult = { ok: true; message: string } | { ok: false; message: string };

const SKIP_STATUSES = new Set(["pending_payment", "cancelled"]);

async function log(orderId: string, message: string, actor: string) {
  const db = await getDb();
  await db.insert(orderEvents).values({ orderId, type: "shiprocket", message: message.slice(0, 1000), actor });
}

/**
 * Creates the order in Shiprocket, or updates it if it's already there.
 * Free: an order without a booked courier costs nothing.
 *
 * Runs automatically when an order is confirmed, on the live site only
 * (`syncOrders`); an admin can also send one by hand (`manual`).
 */
export async function syncOrderToShiprocket(
  orderId: string,
  opts: { actor?: string; manual?: boolean } = {},
): Promise<SyncResult> {
  const actor = opts.actor ?? "system";
  const skip = (message: string): SyncResult => {
    console.info(`[shiprocket] not sent (${orderId}): ${message}`);
    return { ok: false, message };
  };
  const config = shiprocketConfig();
  if (!config?.pickupLocation) return skip("Shiprocket isn't set up.");
  if (!opts.manual && !config.syncOrders) return skip("Automatic sync is off here.");

  const order = await getOrderById(orderId);
  if (!order) return skip("Order not found.");
  if (SKIP_STATUSES.has(order.status)) return skip(`Only confirmed orders go to Shiprocket (this one is ${order.status}).`);

  const db = await getDb();
  const weights = await db.select({ id: packs.id, weightGrams: packs.weightGrams }).from(packs);
  const payload = shiprocketOrderPayload(order, {
    pickupLocation: config.pickupLocation,
    weightGramsByPack: new Map(weights.map((w) => [w.id, w.weightGrams])),
    fallbackEmail: siteConfig.contact.email,
  });

  try {
    const existing = order.shiprocketOrderId;
    const res = existing ? await updateShiprocketOrder(payload) : await createShiprocketOrder(payload);
    const srOrderId = res.order_id ? String(res.order_id) : existing;
    if (!srOrderId) throw new ShiprocketError(res.status ?? "Shiprocket didn't return an order id", 0);
    await db
      .update(orders)
      .set({
        shiprocketOrderId: srOrderId,
        shiprocketShipmentId: res.shipment_id ? String(res.shipment_id) : order.shiprocketShipmentId,
        shiprocketSyncedAt: new Date(),
        shiprocketError: null,
      })
      .where(eq(orders.id, orderId));
    const message = existing ? `Updated in Shiprocket (#${srOrderId})` : `Sent to Shiprocket (#${srOrderId})`;
    await log(orderId, message, actor);
    return { ok: true, message };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db
      .update(orders)
      .set({ shiprocketError: reason.slice(0, 300) })
      .where(eq(orders.id, orderId));
    await log(orderId, `Shiprocket sync failed: ${reason}`, actor);
    console.error(`[shiprocket] sync failed for ${order.orderNumber}:`, reason);
    return { ok: false, message: `Shiprocket said: ${reason}` };
  }
}

/** Mirrors a cancellation in Shiprocket. Does nothing for orders that were never sent. */
export async function cancelOrderOnShiprocket(orderId: string, actor = "system"): Promise<void> {
  const config = shiprocketConfig();
  if (!config) return;
  const order = await getOrderById(orderId);
  if (!order?.shiprocketOrderId) return;
  try {
    await cancelShiprocketOrder(order.shiprocketOrderId);
    await log(orderId, `Cancelled in Shiprocket (#${order.shiprocketOrderId})`, actor);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await log(orderId, `Couldn't cancel in Shiprocket: ${reason}. Cancel it there by hand.`, actor);
    console.error(`[shiprocket] cancel failed for ${order.orderNumber}:`, reason);
  }
}
