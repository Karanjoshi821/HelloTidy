import "server-only";
import { and, arrayContains, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "../audit";
import { getDb } from "../db";
import { customers, orders, type Customer } from "../db/schema";
import { escapeLike } from "../orders/admin";
import { UserError } from "../orders/errors";

/**
 * Customers admin. Lifetime numbers are computed from orders, never stored,
 * so they can't drift: "orders" counts orders that went through (not unpaid
 * checkouts or cancellations); "spent" is net of refunds and excludes returns.
 */

const ordersCount = sql<number>`count(${orders.id}) filter (where ${orders.status} not in ('pending_payment', 'cancelled'))`;
const spent = sql<number>`coalesce(sum(${orders.total} - ${orders.refundedAmount}) filter (where ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered')), 0)`;
const rtoCount = sql<number>`count(${orders.id}) filter (where ${orders.status} = 'rto')`;
const lastOrderAt = sql<Date | null>`max(${orders.createdAt})`;

export const CUSTOMER_FILTERS = {
  all: "All",
  repeat: "Repeat buyers",
  rto: "Had a return (RTO)",
  cod_blocked: "COD blocked",
  checkout_only: "Never completed an order",
} as const;

export const CUSTOMER_SORTS = {
  recent: "Last order",
  spent: "Total spent",
  orders: "Most orders",
  newest: "Newest customers",
} as const;

const PAGE_SIZE = 25;

export async function listCustomers(params: {
  q?: string;
  filter?: string;
  tag?: string;
  sort?: string;
  page?: number;
}) {
  const db = await getDb();
  const where: SQL[] = [];
  const q = params.q?.trim().slice(0, 60);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");
    const conditions: SQL[] = [ilike(customers.name, like), ilike(customers.email, like)];
    if (digits.length >= 4) conditions.push(ilike(customers.phone, `%${digits.slice(-10)}%`));
    where.push(or(...conditions)!);
  }
  if (params.filter === "cod_blocked") where.push(eq(customers.codBlocked, true));
  if (params.tag) where.push(arrayContains(customers.tags, [params.tag.toLowerCase()]));

  const having: SQL[] = [];
  if (params.filter === "repeat") having.push(sql`${ordersCount} >= 2`);
  if (params.filter === "rto") having.push(sql`${rtoCount} > 0`);
  if (params.filter === "checkout_only") having.push(sql`${ordersCount} = 0`);

  const sort = (() => {
    switch (params.sort) {
      case "spent":
        return [desc(spent), desc(lastOrderAt)];
      case "orders":
        return [desc(ordersCount), desc(lastOrderAt)];
      case "newest":
        return [desc(customers.createdAt)];
      default:
        return [sql`${lastOrderAt} desc nulls last`];
    }
  })();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const whereSql = where.length ? and(...where) : undefined;
  const havingSql = having.length ? and(...having) : undefined;
  const matching = db
    .select({ id: customers.id })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(whereSql)
    .groupBy(customers.id)
    .having(havingSql);
  const base = db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      tags: customers.tags,
      codBlocked: customers.codBlocked,
      createdAt: customers.createdAt,
      orders: ordersCount.mapWith(Number),
      spent: spent.mapWith(Number),
      rto: rtoCount.mapWith(Number),
      lastOrderAt: lastOrderAt.mapWith((v) => (v ? new Date(v as unknown as string) : null)),
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(whereSql)
    .groupBy(customers.id)
    .having(havingSql);

  const [rows, [{ total }]] = await Promise.all([
    base
      .orderBy(...sort)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(matching.as("matching")),
  ]);
  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

export async function getCustomerDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return null;
  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      total: orders.total,
      refundedAmount: orders.refundedAmount,
      createdAt: orders.createdAt,
      address1: orders.address1,
      address2: orders.address2,
      landmark: orders.landmark,
      city: orders.city,
      state: orders.state,
      pincode: orders.pincode,
      couponCode: orders.couponCode,
    })
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt));

  const real = orderRows.filter((o) => o.status !== "pending_payment" && o.status !== "cancelled");
  const sales = orderRows.filter((o) => ["confirmed", "processing", "shipped", "delivered"].includes(o.status));
  const spentTotal = sales.reduce((s, o) => s + o.total - o.refundedAmount, 0);
  const delivered = orderRows.filter((o) => o.status === "delivered").length;
  const rto = orderRows.filter((o) => o.status === "rto").length;

  // Distinct delivery addresses, most recent first.
  const seen = new Set<string>();
  const addresses = [];
  for (const o of orderRows) {
    const lines = [o.address1, o.address2, o.landmark].filter(Boolean).join(", ");
    const key = `${lines}|${o.city}|${o.pincode}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push({ lines, city: o.city, state: o.state, pincode: o.pincode });
  }

  return {
    customer,
    orders: orderRows,
    addresses,
    stats: {
      orders: real.length,
      spent: spentTotal,
      averageOrder: sales.length ? Math.round(spentTotal / sales.length) : 0,
      delivered,
      rto,
      /** Share of finished deliveries the customer refused. */
      rtoRate: delivered + rto ? Math.round((rto / (delivered + rto)) * 100) : 0,
      cod: real.filter((o) => o.paymentMethod === "cod").length,
      prepaid: real.filter((o) => o.paymentMethod === "prepaid").length,
      firstOrderAt: orderRows.at(-1)?.createdAt ?? null,
      lastOrderAt: orderRows[0]?.createdAt ?? null,
    },
  };
}

export type CustomerInput = {
  name: string;
  email: string | null;
  notes: string | null;
  tags: string[];
  codBlocked: boolean;
};

export async function updateCustomer(id: string, input: CustomerInput, actor: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(eq(customers.id, id)).limit(1).for("update");
    if (!before) throw new UserError("Customer not found.");
    const changes: string[] = [];
    if (before.name !== input.name) changes.push(`name → ${input.name}`);
    if ((before.email ?? null) !== input.email) changes.push(`email → ${input.email ?? "none"}`);
    if ((before.notes ?? null) !== input.notes) changes.push("notes");
    if (before.tags.join(",") !== input.tags.join(",")) changes.push(`tags → ${input.tags.join(", ") || "none"}`);
    if (before.codBlocked !== input.codBlocked) changes.push(input.codBlocked ? "COD blocked" : "COD unblocked");
    if (!changes.length) return;
    await tx.update(customers).set(input).where(eq(customers.id, id));
    await recordAudit(tx, {
      actor,
      action: "customer.updated",
      entityType: "customer",
      entityId: id,
      summary: `${before.name} (${before.phone}): ${changes.join(", ")}`,
    });
  });
}

/** All customers with lifetime numbers, for the owner's CSV export (e.g. a Meta custom audience). */
export async function getCustomersForExport(): Promise<
  (Pick<Customer, "name" | "phone" | "email" | "tags" | "codBlocked" | "createdAt"> & {
    orders: number;
    spent: number;
    rto: number;
    lastOrderAt: Date | null;
  })[]
> {
  const db = await getDb();
  return db
    .select({
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      tags: customers.tags,
      codBlocked: customers.codBlocked,
      createdAt: customers.createdAt,
      orders: ordersCount.mapWith(Number),
      spent: spent.mapWith(Number),
      rto: rtoCount.mapWith(Number),
      lastOrderAt: lastOrderAt.mapWith((v) => (v ? new Date(v as unknown as string) : null)),
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .groupBy(customers.id)
    .orderBy(asc(customers.createdAt))
    .limit(20000);
}
