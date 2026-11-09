import "server-only";
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { mergeStockEffects, noStockEffect, restockOrder, type StockEffect } from "../catalog/inventory";
import { upsertCustomer } from "../customers/service";
import { addDays, istDayStart, istYmd, startOfIndianDay } from "../dates";
import { getDb, type Tx } from "../db";
import {
  contactMessages,
  customers,
  orderEvents,
  orderItems,
  orders,
  packs,
  refunds,
  type Order,
  type OrderStatus,
} from "../db/schema";
import { formatPaise } from "../money";
import { OrderError } from "./errors";
import { STATUS_LABELS, STATUS_TRANSITIONS, ORDER_STATUSES, type BulkAction } from "./labels";

export {
  BULK_ACTIONS,
  CANCEL_REASONS,
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDER_VIEWS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type BulkAction,
} from "./labels";

/** Orders that count as real sales in revenue figures. */
export const SALE_STATUSES: OrderStatus[] = ["confirmed", "processing", "shipped", "delivered"];
/** Statuses where the customer details and address can still be edited. */
const EDITABLE_STATUSES: OrderStatus[] = ["pending_payment", "confirmed", "processing"];

export type OrderListParams = {
  status?: string;
  payment?: string;
  paymentStatus?: string;
  q?: string;
  tag?: string;
  from?: string;
  to?: string;
  source?: string;
  sort?: string;
  page?: number;
};

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * An unpaid checkout whose customer (same phone) later placed an order that
 * went through, e.g. after "Change order details" at checkout. It isn't
 * abandoned, and a payment reminder would lead to a duplicate paid order.
 * The outer table is spelled out: drizzle leaves single-table columns unqualified.
 */
export const supersededByLaterOrder = sql`exists (select 1 from orders later where later.phone = "orders"."phone" and later.created_at > "orders"."created_at" and later.status not in ('pending_payment', 'cancelled'))`;

/** COD orders still to be confirmed with the customer before shipping. */
const toVerify = and(
  eq(orders.paymentMethod, "cod"),
  inArray(orders.status, ["confirmed", "processing"]),
  isNull(orders.codVerifiedAt),
)!;

function orderFilters(params: OrderListParams): SQL[] {
  const filters: SQL[] = [];
  const status = params.status ?? "";
  if (status === "unfulfilled") filters.push(inArray(orders.status, ["confirmed", "processing"]));
  else if (status === "to_verify") filters.push(toVerify);
  else if ((ORDER_STATUSES as string[]).includes(status)) filters.push(eq(orders.status, status as OrderStatus));

  if (params.payment === "cod" || params.payment === "prepaid") filters.push(eq(orders.paymentMethod, params.payment));
  if (params.paymentStatus === "partially_refunded") {
    filters.push(and(eq(orders.paymentStatus, "paid"), sql`${orders.refundedAmount} > 0`)!);
  } else if (["unpaid", "paid", "failed", "refunded"].includes(params.paymentStatus ?? "")) {
    filters.push(eq(orders.paymentStatus, params.paymentStatus as Order["paymentStatus"]));
  }
  if (params.source === "web" || params.source === "admin") filters.push(eq(orders.source, params.source));
  if (params.tag) filters.push(arrayContains(orders.tags, [params.tag.toLowerCase()]));

  const from = istDayStart(params.from);
  const to = istDayStart(params.to);
  if (from) filters.push(gte(orders.createdAt, from));
  if (to) filters.push(lt(orders.createdAt, addDays(to, 1)));

  const q = params.q?.trim().slice(0, 60);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");
    const conditions: SQL[] = [
      ilike(orders.orderNumber, like),
      ilike(orders.customerName, like),
      ilike(orders.email, like),
      ilike(orders.awbCode, like),
    ];
    if (digits.length >= 4) conditions.push(ilike(orders.phone, `%${digits.slice(-10)}%`));
    filters.push(or(...conditions)!);
  }
  return filters;
}

function orderSort(sort: string | undefined) {
  switch (sort) {
    case "oldest":
      return [asc(orders.createdAt)];
    case "total_desc":
      return [desc(orders.total), desc(orders.createdAt)];
    case "total_asc":
      return [asc(orders.total), desc(orders.createdAt)];
    default:
      return [desc(orders.createdAt)];
  }
}

const PAGE_SIZE = 25;

/**
 * Correlated subqueries spell out the outer table ("orders"."id"): drizzle leaves
 * columns unqualified in single-table queries, where "id" would bind to the inner table.
 */
const itemCount = sql<number>`(select coalesce(sum(oi.qty), 0) from order_items oi where oi.order_id = "orders"."id")`;

export async function listOrders(params: OrderListParams) {
  const db = await getDb();
  const filters = orderFilters(params);
  const where = filters.length ? and(...filters) : undefined;
  const page = Math.max(1, Math.floor(params.page ?? 1));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        phone: orders.phone,
        city: orders.city,
        state: orders.state,
        total: orders.total,
        status: orders.status,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        refundedAmount: orders.refundedAmount,
        codVerifiedAt: orders.codVerifiedAt,
        tags: orders.tags,
        source: orders.source,
        createdAt: orders.createdAt,
        items: itemCount.mapWith(Number),
      })
      .from(orders)
      .where(where)
      .orderBy(...orderSort(params.sort))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
  ]);

  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

export type OrderListRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

/** Every order matching the filters (or the given ids), with lines, for CSV export and printing. */
export async function getOrdersWithItems(params: OrderListParams & { ids?: string[] }, limit = 5000) {
  const db = await getDb();
  const filters = params.ids ? [inArray(orders.id, params.ids)] : orderFilters(params);
  const rows = await db
    .select()
    .from(orders)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(...orderSort(params.sort))
    .limit(limit);
  if (!rows.length) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    );
  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }
  return rows.map((order) => ({ ...order, items: byOrder.get(order.id) ?? [] }));
}

export async function getOrderDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const [items, events, refundRows, customerRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.createdAt)),
    db.select().from(refunds).where(eq(refunds.orderId, id)).orderBy(asc(refunds.createdAt)),
    order.customerId
      ? db
          .select({
            id: customers.id,
            name: customers.name,
            codBlocked: customers.codBlocked,
            tags: customers.tags,
            orders:
              sql<number>`(select count(*) from orders o where o.customer_id = "customers"."id" and o.status not in ('pending_payment', 'cancelled'))`.mapWith(
                Number,
              ),
            rto: sql<number>`(select count(*) from orders o where o.customer_id = "customers"."id" and o.status = 'rto')`.mapWith(
              Number,
            ),
          })
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  // For an unpaid checkout: did this customer go on to place an order that went through?
  const [laterOrder] =
    order.status === "pending_payment"
      ? await db
          .select({ id: orders.id, orderNumber: orders.orderNumber })
          .from(orders)
          .where(
            and(
              eq(orders.phone, order.phone),
              gt(orders.createdAt, order.createdAt),
              notInArray(orders.status, ["pending_payment", "cancelled"]),
            ),
          )
          .orderBy(asc(orders.createdAt))
          .limit(1)
      : [];
  return {
    order,
    items,
    events,
    refunds: refundRows,
    customer: customerRows[0] ?? null,
    laterOrder: laterOrder ?? null,
  };
}

/**
 * Moves an order to a new status. Cancelling or marking returned (RTO) puts
 * its stock back unless `restock` is false (e.g. a damaged return).
 * `from` is the status the person was looking at: if the order moved on
 * meanwhile (say the customer paid while a Cancel form was open), nothing
 * changes and they're asked to look again.
 */
export async function updateOrderStatus(
  id: string,
  next: OrderStatus,
  actor: string,
  opts: { restock?: boolean; reason?: string; from?: OrderStatus } = {},
): Promise<StockEffect> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for("update");
    if (!current) throw new OrderError("Order not found.");
    if (opts.from && current.status !== opts.from) {
      throw new OrderError(
        `This order is now "${STATUS_LABELS[current.status]}" (it changed while you were looking). Check it and try again.`,
      );
    }
    if (!STATUS_TRANSITIONS[current.status].includes(next)) {
      throw new OrderError(`Can't move an order from "${STATUS_LABELS[current.status]}" to "${STATUS_LABELS[next]}".`);
    }

    const now = new Date();
    const patch: Partial<Order> = { status: next };
    if (next === "confirmed" && !current.confirmedAt) patch.confirmedAt = now;
    if (next === "shipped") patch.shippedAt = now;
    if (next === "cancelled") {
      patch.cancelledAt = now;
      patch.cancelReason = opts.reason?.slice(0, 200) || null;
    }
    if (next === "delivered") {
      patch.deliveredAt = now;
      // Cash collected by the courier.
      if (current.paymentMethod === "cod" && current.paymentStatus !== "paid") {
        patch.paymentStatus = "paid";
        patch.paidAt = now;
      }
    }

    // Optimistic check: only apply if nobody changed the status meanwhile.
    const updated = await tx
      .update(orders)
      .set(patch)
      .where(and(eq(orders.id, id), eq(orders.status, current.status)))
      .returning({ id: orders.id });
    if (!updated.length) throw new OrderError("This order was just updated by someone else. Refresh and try again.");

    let stock = noStockEffect();
    const releases = next === "cancelled" || next === "rto";
    if (releases && opts.restock !== false) {
      stock = await restockOrder(tx, {
        orderId: id,
        orderNumber: current.orderNumber,
        reason: next === "cancelled" ? "cancelled" : "returned",
        actor,
      });
    }

    let message = `Status changed: ${STATUS_LABELS[current.status]} → ${STATUS_LABELS[next]}`;
    if (next === "cancelled" && opts.reason) message += ` (${opts.reason})`;
    if (releases) message += opts.restock === false ? " · stock not returned" : "";
    if (next === "cancelled" && current.paymentStatus === "paid") {
      message += " (prepaid: refund it in the Razorpay dashboard, then record the refund here)";
    }
    await tx.insert(orderEvents).values({ orderId: id, type: "status_changed", message, actor });
    return stock;
  });
}

/** Runs `fn` with the order row locked, so concurrent edits to one order queue up. */
async function inOrderTransaction<T>(id: string, fn: (tx: Tx, order: Order) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for("update");
    if (!order) throw new OrderError("Order not found.");
    return fn(tx, order);
  });
}

/** Records that staff confirmed a COD order with the customer, which cuts refusals (RTO). */
export async function verifyCod(id: string, actor: string, note?: string): Promise<void> {
  await inOrderTransaction(id, async (tx, order) => {
    if (order.paymentMethod !== "cod" || !["confirmed", "processing"].includes(order.status)) {
      throw new OrderError("Only open Cash on Delivery orders can be verified.");
    }
    if (order.codVerifiedAt) return;
    await tx.update(orders).set({ codVerifiedAt: new Date() }).where(eq(orders.id, id));
    await tx.insert(orderEvents).values({
      orderId: id,
      type: "cod_verified",
      message: `COD confirmed with the customer${note ? `: ${note.slice(0, 200)}` : ""}`,
      actor,
    });
  });
}

export async function addOrderComment(id: string, message: string, actor: string): Promise<void> {
  await inOrderTransaction(id, async (tx) => {
    await tx.insert(orderEvents).values({ orderId: id, type: "comment", message: message.slice(0, 1000), actor });
  });
}

export async function setOrderTags(id: string, tags: string[], actor: string): Promise<void> {
  await inOrderTransaction(id, async (tx, order) => {
    const before = order.tags.join(", ") || "none";
    const after = tags.join(", ") || "none";
    if (before === after) return;
    await tx.update(orders).set({ tags }).where(eq(orders.id, id));
    await tx.insert(orderEvents).values({ orderId: id, type: "tags", message: `Tags: ${after}`, actor });
  });
}

export type OrderContactInput = {
  customerName: string;
  phone: string;
  email: string | null;
  address1: string;
  address2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
};

const CONTACT_LABELS: Record<keyof OrderContactInput, string> = {
  customerName: "name",
  phone: "phone",
  email: "email",
  address1: "address",
  address2: "area",
  landmark: "landmark",
  city: "city",
  state: "state",
  pincode: "pincode",
};

/** Fixes the customer's details or delivery address before the order ships. */
export async function updateOrderContact(id: string, input: OrderContactInput, actor: string): Promise<void> {
  await inOrderTransaction(id, async (tx, order) => {
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new OrderError("The address can't be changed after the order has shipped.");
    }
    // Only these fields are copied, whatever else the caller's object carries.
    const fields = Object.keys(CONTACT_LABELS) as (keyof OrderContactInput)[];
    const changed = fields.filter((key) => (order[key] ?? null) !== (input[key] ?? null));
    if (!changed.length) return;

    const patch: Partial<Order> = Object.fromEntries(fields.map((key) => [key, input[key] ?? null]));
    if (input.phone !== order.phone) {
      const customer = await upsertCustomer(tx, { phone: input.phone, name: input.customerName, email: input.email });
      patch.customerId = customer.id;
    }
    await tx.update(orders).set(patch).where(eq(orders.id, id));
    await tx.insert(orderEvents).values({
      orderId: id,
      type: "details_updated",
      message: `Customer details updated: ${changed.map((k) => CONTACT_LABELS[k]).join(", ")}`,
      actor,
    });
  });
}

export async function updateShipping(
  id: string,
  input: { courierName?: string; awbCode?: string; trackingUrl?: string },
  actor: string,
): Promise<void> {
  await inOrderTransaction(id, async (tx) => {
    await tx
      .update(orders)
      .set({
        courierName: input.courierName || null,
        awbCode: input.awbCode || null,
        trackingUrl: input.trackingUrl || null,
      })
      .where(eq(orders.id, id));
    await tx.insert(orderEvents).values({
      orderId: id,
      type: "shipping_updated",
      message: `Shipping details: ${[input.courierName, input.awbCode].filter(Boolean).join(" · ") || "cleared"}`,
      actor,
    });
  });
}

export async function updateAdminNotes(id: string, notes: string, actor: string): Promise<void> {
  await inOrderTransaction(id, async (tx) => {
    await tx
      .update(orders)
      .set({ adminNotes: notes || null })
      .where(eq(orders.id, id));
    await tx.insert(orderEvents).values({ orderId: id, type: "note", message: "Internal notes updated", actor });
  });
}

/**
 * Records a refund already paid out (Razorpay dashboard, or UPI/bank for a
 * delivered COD order). Partial refunds add up; the full amount marks the
 * order refunded.
 */
export async function recordRefund(
  id: string,
  input: { amount: number; reason: string; reference?: string | null },
  actor: string,
): Promise<{ fullyRefunded: boolean }> {
  return inOrderTransaction(id, async (tx, order) => {
    if (order.paymentStatus !== "paid") {
      throw new OrderError("Only paid orders can be refunded. A COD order is paid once it's delivered.");
    }
    const remaining = order.total - order.refundedAmount;
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderError("Enter the refund amount.");
    if (input.amount > remaining) {
      throw new OrderError(`You can refund at most ${formatPaise(remaining)} on this order.`);
    }
    const refundedAmount = order.refundedAmount + input.amount;
    const fullyRefunded = refundedAmount === order.total;
    await tx.insert(refunds).values({
      orderId: id,
      amount: input.amount,
      reason: input.reason.slice(0, 200),
      reference: input.reference?.slice(0, 100) || null,
      actor,
    });
    await tx
      .update(orders)
      .set({ refundedAmount, ...(fullyRefunded ? { paymentStatus: "refunded" as const } : {}) })
      .where(eq(orders.id, id));
    await tx.insert(orderEvents).values({
      orderId: id,
      type: "refunded",
      message: `Refund of ${formatPaise(input.amount)} recorded (${input.reason.slice(0, 200)})${input.reference ? ` · ref ${input.reference.slice(0, 100)}` : ""}${fullyRefunded ? " (fully refunded)" : ""}`,
      actor,
    });
    return { fullyRefunded };
  });
}

/**
 * Applies one action to many orders. Each order is handled on its own: one
 * that doesn't qualify (wrong status, already done) is skipped, not fatal.
 */
export async function bulkOrderAction(
  ids: string[],
  action: BulkAction,
  actor: string,
  opts: { tag?: string } = {},
): Promise<{ done: number; skipped: { orderNumber: string; reason: string }[]; stock: StockEffect }> {
  const db = await getDb();
  const rows = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, tags: orders.tags })
    .from(orders)
    .where(inArray(orders.id, ids.slice(0, 100)));
  const skipped: { orderNumber: string; reason: string }[] = [];
  const effects: StockEffect[] = [];
  let done = 0;

  for (const row of rows) {
    try {
      switch (action) {
        case "mark_packed":
          if (row.status !== "confirmed") throw new OrderError(`is ${STATUS_LABELS[row.status].toLowerCase()}`);
          await updateOrderStatus(row.id, "processing", actor, { from: row.status });
          break;
        case "mark_shipped":
          if (!["confirmed", "processing"].includes(row.status)) {
            throw new OrderError(`is ${STATUS_LABELS[row.status].toLowerCase()}`);
          }
          await updateOrderStatus(row.id, "shipped", actor, { from: row.status });
          break;
        case "mark_delivered":
          if (row.status !== "shipped") throw new OrderError(`is ${STATUS_LABELS[row.status].toLowerCase()}`);
          await updateOrderStatus(row.id, "delivered", actor, { from: row.status });
          break;
        case "verify_cod":
          await verifyCod(row.id, actor);
          break;
        case "cancel_unpaid":
          if (row.status !== "pending_payment") throw new OrderError("isn't an unpaid checkout");
          effects.push(
            await updateOrderStatus(row.id, "cancelled", actor, {
              reason: "Payment not completed",
              from: "pending_payment",
            }),
          );
          break;
        case "add_tag":
        case "remove_tag": {
          if (!opts.tag) throw new OrderError("needs a tag");
          const tags =
            action === "add_tag"
              ? [...new Set([...row.tags, opts.tag])].slice(0, 10)
              : row.tags.filter((t) => t !== opts.tag);
          await setOrderTags(row.id, tags, actor);
          break;
        }
      }
      done++;
    } catch (error) {
      if (!(error instanceof OrderError)) throw error;
      skipped.push({ orderNumber: row.orderNumber, reason: error.message });
    }
  }
  return { done, skipped, stock: mergeStockEffects(...effects) };
}

/** Customers who started paying online and didn't finish (older than 15 minutes, so not still paying). */
export async function listAbandonedCheckouts(page = 1) {
  const db = await getDb();
  const where = and(
    eq(orders.status, "pending_payment"),
    ne(orders.paymentStatus, "paid"),
    lt(orders.createdAt, new Date(Date.now() - 15 * 60 * 1000)),
    sql`not ${supersededByLaterOrder}`,
  );
  const safePage = Math.max(1, Math.floor(page));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        publicToken: orders.publicToken,
        customerName: orders.customerName,
        phone: orders.phone,
        email: orders.email,
        city: orders.city,
        total: orders.total,
        createdAt: orders.createdAt,
        items: itemCount.mapWith(Number),
        reminders:
          sql<number>`(select count(*) from order_events e where e.order_id = "orders"."id" and e.type = 'recovery_sent')`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((safePage - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { rows, total: Number(total), page: safePage, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

/** Numbers for the admin home page. Revenue is net of refunds and excludes unpaid, cancelled and returned orders. */
export async function getHomeStats() {
  const db = await getDb();
  const sales = inArray(orders.status, SALE_STATUSES);
  const revenue = sql<string>`coalesce(sum(${orders.total} - ${orders.refundedAmount}), 0)`;

  const period = async (from: Date, to?: Date) => {
    const [row] = await db
      .select({ orders: count(), revenue })
      .from(orders)
      .where(and(sales, gte(orders.createdAt, from), to ? lt(orders.createdAt, to) : undefined));
    return { orders: Number(row?.orders ?? 0), revenue: Number(row?.revenue ?? 0) };
  };

  const today = startOfIndianDay(0);
  const days14 = startOfIndianDay(13);
  const istDay = sql<string>`to_char(${orders.createdAt} + interval '330 minutes', 'YYYY-MM-DD')`;

  const [todayStats, week, prevWeek, month, prevMonth, queue, lowStock, newMessages, recent, daily, tracked] =
    await Promise.all([
      period(today),
      period(startOfIndianDay(6)),
      period(startOfIndianDay(13), startOfIndianDay(6)),
      period(startOfIndianDay(29)),
      period(startOfIndianDay(59), startOfIndianDay(29)),
      db
        .select({
          toVerify: sql<number>`count(*) filter (where ${toVerify})`.mapWith(Number),
          toPack: sql<number>`count(*) filter (where ${orders.status} = 'confirmed')`.mapWith(Number),
          toShip: sql<number>`count(*) filter (where ${orders.status} = 'processing')`.mapWith(Number),
          staleShipped:
            sql<number>`count(*) filter (where ${orders.status} = 'shipped' and ${orders.shippedAt} < now() - interval '7 days')`.mapWith(
              Number,
            ),
          abandoned:
            sql<number>`count(*) filter (where ${orders.status} = 'pending_payment' and ${orders.createdAt} < now() - interval '15 minutes' and ${orders.createdAt} > now() - interval '7 days' and not ${supersededByLaterOrder})`.mapWith(
              Number,
            ),
        })
        .from(orders),
      db
        .select({
          id: packs.id,
          name: packs.name,
          sku: packs.sku,
          stock: packs.stock,
          threshold: packs.lowStockThreshold,
        })
        .from(packs)
        .where(
          and(
            eq(packs.trackInventory, true),
            eq(packs.status, "active"),
            sql`${packs.stock} <= ${packs.lowStockThreshold}`,
          ),
        )
        .orderBy(asc(packs.stock)),
      db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, "new")),
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          city: orders.city,
          total: orders.total,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          refundedAmount: orders.refundedAmount,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(8),
      db
        .select({ day: istDay, orders: count(), revenue })
        .from(orders)
        .where(and(sales, gte(orders.createdAt, days14)))
        .groupBy(istDay),
      db
        .select({ n: count() })
        .from(packs)
        .where(and(eq(packs.trackInventory, true), eq(packs.status, "active"))),
    ]);

  const byDay = new Map(daily.map((d) => [d.day, { orders: Number(d.orders), revenue: Number(d.revenue) }]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const key = istYmd(addDays(days14, i));
    return { day: key, ...(byDay.get(key) ?? { orders: 0, revenue: 0 }) };
  });

  return {
    today: todayStats,
    week,
    prevWeek,
    month,
    prevMonth,
    queue: queue[0],
    lowStock,
    newMessages: Number(newMessages[0]?.n ?? 0),
    recent,
    series,
    /** Visible packs with stock tracking switched on. */
    trackedPacks: Number(tracked[0]?.n ?? 0),
  };
}
