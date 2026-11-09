import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { contactMessages, orders, packs } from "./db/schema";
import { supersededByLaterOrder } from "./orders/admin";

/** Badge numbers in the admin menu: work waiting to be done. */
export async function getNavCounts() {
  const db = await getDb();
  const [[orderCounts], [lowStock], [messages]] = await Promise.all([
    db
      .select({
        unfulfilled: sql<number>`count(*) filter (where ${orders.status} in ('confirmed', 'processing'))`.mapWith(
          Number,
        ),
        abandoned:
          sql<number>`count(*) filter (where ${orders.status} = 'pending_payment' and ${orders.createdAt} < now() - interval '15 minutes' and ${orders.createdAt} > now() - interval '7 days' and not ${supersededByLaterOrder})`.mapWith(
            Number,
          ),
      })
      .from(orders),
    db
      .select({ n: count() })
      .from(packs)
      .where(
        and(
          eq(packs.trackInventory, true),
          eq(packs.status, "active"),
          sql`${packs.stock} <= ${packs.lowStockThreshold}`,
        ),
      ),
    db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, "new")),
  ]);
  return {
    unfulfilled: orderCounts?.unfulfilled ?? 0,
    abandoned: orderCounts?.abandoned ?? 0,
    lowStock: Number(lowStock?.n ?? 0),
    newMessages: Number(messages?.n ?? 0),
  };
}
