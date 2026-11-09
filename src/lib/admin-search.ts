import "server-only";
import { desc, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { customers, discounts, orders, packs } from "./db/schema";
import { escapeLike } from "./orders/admin";

/** Admin search box: orders, customers, packs and discount codes in one go. */
export async function adminSearch(query: string) {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return null;
  const like = `%${escapeLike(q)}%`;
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? `%${digits.slice(-10)}%` : null;
  const db = await getDb();

  const orderMatch: SQL[] = [
    ilike(orders.orderNumber, like),
    ilike(orders.customerName, like),
    ilike(orders.email, like),
    ilike(orders.awbCode, like),
  ];
  if (phone) orderMatch.push(ilike(orders.phone, phone));
  const customerMatch: SQL[] = [ilike(customers.name, like), ilike(customers.email, like)];
  if (phone) customerMatch.push(ilike(customers.phone, phone));

  const [orderRows, customerRows, packRows, discountRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        status: orders.status,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(or(...orderMatch))
      .orderBy(desc(orders.createdAt))
      .limit(10),
    db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email })
      .from(customers)
      .where(or(...customerMatch))
      .orderBy(desc(customers.updatedAt))
      .limit(10),
    db
      .select({ id: packs.id, name: packs.name, sku: packs.sku, status: packs.status })
      .from(packs)
      .where(or(ilike(packs.name, like), ilike(packs.sku, like)))
      .limit(10),
    db
      .select({ id: discounts.id, code: discounts.code, description: discounts.description, active: discounts.active })
      .from(discounts)
      .where(or(ilike(discounts.code, like), ilike(discounts.description, like)))
      .limit(10),
  ]);
  return { orders: orderRows, customers: customerRows, packs: packRows, discounts: discountRows };
}
