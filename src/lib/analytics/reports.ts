import "server-only";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { addDays, istYmd } from "../dates";
import { getDb } from "../db";
import { orderItems, orders } from "../db/schema";
import { SALE_STATUSES } from "../orders/admin";

/**
 * Owner reports (Admin → Analytics). "Sales" are orders that went through
 * (confirmed, packed, shipped or delivered) placed in the range, net of
 * refunds. Unpaid checkouts, cancellations and returns (RTO) are reported
 * separately, never as sales. Days are IST calendar days.
 */

export type Range = { from: Date; to: Date; days: number };

const net = sql<number>`coalesce(sum(${orders.total} - ${orders.refundedAmount}), 0)`;
const istDay = sql<string>`to_char(${orders.createdAt} + interval '330 minutes', 'YYYY-MM-DD')`;
const istMonth = sql<string>`to_char(${orders.createdAt} + interval '330 minutes', 'YYYY-MM')`;

function inRange(range: Range) {
  return and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to))!;
}

async function totals(range: Range) {
  const db = await getDb();
  const [row] = await db
    .select({
      orders: count(),
      gross: sql<number>`coalesce(sum(${orders.subtotal}), 0)`.mapWith(Number),
      discounts: sql<number>`coalesce(sum(${orders.discount}), 0)`.mapWith(Number),
      codFees: sql<number>`coalesce(sum(${orders.codFee}), 0)`.mapWith(Number),
      refunds: sql<number>`coalesce(sum(${orders.refundedAmount}), 0)`.mapWith(Number),
      net: net.mapWith(Number),
    })
    .from(orders)
    .where(and(inArray(orders.status, SALE_STATUSES), inRange(range)));
  const [units] = await db
    .select({ units: sql<number>`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number) })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(orders.status, SALE_STATUSES), inRange(range)));
  const orderCount = Number(row?.orders ?? 0);
  const netTotal = row?.net ?? 0;
  return {
    orders: orderCount,
    units: units?.units ?? 0,
    gross: row?.gross ?? 0,
    discounts: row?.discounts ?? 0,
    codFees: row?.codFees ?? 0,
    refunds: row?.refunds ?? 0,
    net: netTotal,
    aov: orderCount ? Math.round(netTotal / orderCount) : 0,
  };
}

export async function getSalesReport(range: Range) {
  const db = await getDb();
  const previous: Range = { from: addDays(range.from, -range.days), to: range.from, days: range.days };
  const monthly = range.days > 92;
  const bucket = monthly ? istMonth : istDay;
  const sales = and(inArray(orders.status, SALE_STATUSES), inRange(range));

  const [
    current,
    prior,
    seriesRows,
    byPack,
    byMethod,
    outcomes,
    byState,
    bySource,
    [customerMix],
    [funnel],
    cancelReasons,
  ] = await Promise.all([
    totals(range),
    totals(previous),
    db
      .select({ bucket, orders: count(), net: net.mapWith(Number) })
      .from(orders)
      .where(sales)
      .groupBy(bucket),
    db
      .select({
        packId: orderItems.packId,
        name: sql<string>`max(${orderItems.name})`,
        units: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
        revenue: sql<number>`sum(${orderItems.lineTotal})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(sales)
      .groupBy(orderItems.packId)
      .orderBy(desc(sql`sum(${orderItems.lineTotal})`)),
    db
      .select({ method: orders.paymentMethod, orders: count(), net: net.mapWith(Number) })
      .from(orders)
      .where(sales)
      .groupBy(orders.paymentMethod),
    db
      .select({
        method: orders.paymentMethod,
        delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')`.mapWith(Number),
        rto: sql<number>`count(*) filter (where ${orders.status} = 'rto')`.mapWith(Number),
        inTransit: sql<number>`count(*) filter (where ${orders.status} = 'shipped')`.mapWith(Number),
        cancelled:
          sql<number>`count(*) filter (where ${orders.status} = 'cancelled' and ${orders.confirmedAt} is not null)`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(inRange(range))
      .groupBy(orders.paymentMethod),
    db
      .select({ state: orders.state, orders: count(), net: net.mapWith(Number) })
      .from(orders)
      .where(sales)
      .groupBy(orders.state)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        source: sql<string>`coalesce(nullif(${orders.attribution}->>'utmSource', ''), case when ${orders.source} = 'admin' then 'admin (manual)' else 'direct / unknown' end)`,
        campaign: sql<string>`coalesce(nullif(${orders.attribution}->>'utmCampaign', ''), '-')`,
        orders: count(),
        net: net.mapWith(Number),
      })
      .from(orders)
      .where(sales)
      .groupBy(sql`1, 2`)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({
        customers: sql<number>`count(distinct ${orders.customerId})`.mapWith(Number),
        returning:
          sql<number>`count(distinct ${orders.customerId}) filter (where exists (select 1 from orders p where p.customer_id = "orders"."customer_id" and p.status in ('confirmed', 'processing', 'shipped', 'delivered') and p.created_at < ${range.from}))`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(sales),
    db
      .select({
        checkouts: sql<number>`count(*) filter (where ${orders.source} = 'web')`.mapWith(Number),
        abandoned: sql<number>`count(*) filter (where ${orders.status} = 'pending_payment')`.mapWith(Number),
        unpaidCancelled:
          sql<number>`count(*) filter (where ${orders.status} = 'cancelled' and ${orders.confirmedAt} is null)`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(inRange(range)),
    db
      .select({ reason: sql<string>`coalesce(${orders.cancelReason}, 'No reason given')`, orders: count() })
      .from(orders)
      .where(and(eq(orders.status, "cancelled"), inRange(range)))
      .groupBy(sql`1`)
      .orderBy(desc(count())),
  ]);

  // Fill empty days/months so the chart has no gaps.
  const byBucket = new Map(seriesRows.map((r) => [r.bucket, { orders: Number(r.orders), net: r.net }]));
  const series: { label: string; orders: number; net: number }[] = [];
  if (monthly) {
    const seen = new Set<string>();
    for (let d = range.from; d < range.to; d = addDays(d, 1)) {
      const key = istYmd(d).slice(0, 7);
      if (seen.has(key)) continue;
      seen.add(key);
      series.push({ label: key, ...(byBucket.get(key) ?? { orders: 0, net: 0 }) });
    }
  } else {
    for (let d = range.from; d < range.to; d = addDays(d, 1)) {
      const key = istYmd(d);
      series.push({ label: key, ...(byBucket.get(key) ?? { orders: 0, net: 0 }) });
    }
  }

  const outcome = (method: "cod" | "prepaid") => {
    const row = outcomes.find((o) => o.method === method);
    const delivered = row?.delivered ?? 0;
    const rto = row?.rto ?? 0;
    return {
      delivered,
      rto,
      inTransit: row?.inTransit ?? 0,
      cancelled: row?.cancelled ?? 0,
      rtoRate: delivered + rto ? Math.round((rto / (delivered + rto)) * 1000) / 10 : null,
    };
  };
  const method = (m: "cod" | "prepaid") => {
    const row = byMethod.find((r) => r.method === m);
    return { orders: Number(row?.orders ?? 0), net: row?.net ?? 0 };
  };

  return {
    current,
    previous: prior,
    monthly,
    series,
    byPack,
    byMethod: { cod: method("cod"), prepaid: method("prepaid") },
    outcomes: { cod: outcome("cod"), prepaid: outcome("prepaid") },
    byState: byState.map((r) => ({ ...r, orders: Number(r.orders) })),
    bySource: bySource.map((r) => ({ ...r, orders: Number(r.orders) })),
    customers: {
      total: customerMix?.customers ?? 0,
      returning: customerMix?.returning ?? 0,
      new: (customerMix?.customers ?? 0) - (customerMix?.returning ?? 0),
    },
    funnel: {
      checkouts: funnel?.checkouts ?? 0,
      abandoned: funnel?.abandoned ?? 0,
      unpaidCancelled: funnel?.unpaidCancelled ?? 0,
    },
    cancelReasons: cancelReasons.map((r) => ({ reason: r.reason, orders: Number(r.orders) })),
  };
}

export type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;
