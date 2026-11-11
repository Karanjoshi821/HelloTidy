import "server-only";
import { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { addDays, istYmd } from "../dates";
import { getDb } from "../db";
import { customers, orders, visitorEvents, visitorSessions, visitors } from "../db/schema";

/**
 * Admin → Visitors: traffic overview, live visitors, the visitor list and
 * one visitor's timeline, from our own tracker (service.ts). Days are IST.
 * Without cookie consent each visit is its own visitor, so "returning" only
 * counts people who accepted cookies.
 */

export type Range = { from: Date; to: Date; days: number };

const s = visitorSessions;
const e = visitorEvents;

/** Sessions with an order placed in them. */
const hasOrder = sql<boolean>`exists (select 1 from ${orders} where ${orders.visitId} = ${s.id})`;
const sessionEvent = (condition: SQL) =>
  sql<boolean>`exists (select 1 from ${e} where ${e.sessionId} = ${s.id} and ${condition})`;
const sawProduct = sessionEvent(sql`${e.type} = 'view' and ${e.path} like '/products/%'`);
const addedToCart = sessionEvent(sql`${e.type} = 'add_to_cart'`);
const startedCheckout = sessionEvent(
  sql`(${e.type} = 'begin_checkout' or (${e.type} = 'view' and ${e.path} like '/checkout%'))`,
);
/** One page, under 10 seconds, no order: GA4's idea of a visit that didn't engage. */
const bounced = sql<boolean>`(${s.pageviews} <= 1 and ${s.engagedSeconds} < 10 and not ${hasOrder})`;
const pagePath = (column: AnyColumn) => sql<string>`coalesce(split_part(${column}, '?', 1), '/')`;
const num = (expr: SQL) => sql<number>`${expr}`.mapWith(Number);

function inRange(range: Range) {
  return and(gte(s.startedAt, range.from), lt(s.startedAt, range.to))!;
}

async function totals(range: Range) {
  const db = await getDb();
  const [row] = await db
    .select({
      visits: count(),
      visitors: num(sql`count(distinct ${s.visitorId})`),
      pageviews: num(sql`coalesce(sum(${s.pageviews}), 0)`),
      engaged: num(sql`coalesce(avg(${s.engagedSeconds}), 0)`),
      bounced: num(sql`count(*) filter (where ${bounced})`),
      ordered: num(sql`count(*) filter (where ${hasOrder})`),
      returning: num(sql`count(*) filter (where not ${s.firstVisit})`),
    })
    .from(s)
    .where(inRange(range));
  const visits = Number(row?.visits ?? 0);
  return {
    visits,
    visitors: row?.visitors ?? 0,
    pageviews: row?.pageviews ?? 0,
    avgEngagedSeconds: Math.round(row?.engaged ?? 0),
    bounceRate: visits ? Math.round(((row?.bounced ?? 0) / visits) * 100) : null,
    ordered: row?.ordered ?? 0,
    conversionRate: visits ? Math.round(((row?.ordered ?? 0) / visits) * 1000) / 10 : null,
    returning: row?.returning ?? 0,
  };
}

export async function getTrafficOverview(range: Range) {
  const db = await getDb();
  const previous: Range = { from: addDays(range.from, -range.days), to: range.from, days: range.days };
  const where = inRange(range);
  const istDay = sql<string>`to_char(${s.startedAt} + interval '330 minutes', 'YYYY-MM-DD')`;
  const eventsInRange = and(gte(e.createdAt, range.from), lt(e.createdAt, range.to))!;

  const [
    current,
    prior,
    seriesRows,
    [funnel],
    topPages,
    landing,
    exits,
    sources,
    campaigns,
    devices,
    browsers,
    systems,
    states,
    cities,
    actions,
    packs,
    [pins],
    [consent],
  ] = await Promise.all([
    totals(range),
    totals(previous),
    db.select({ day: istDay, visits: count() }).from(s).where(where).groupBy(istDay),
    db
      .select({
        visits: count(),
        product: num(sql`count(*) filter (where ${sawProduct})`),
        cart: num(sql`count(*) filter (where ${addedToCart})`),
        checkout: num(sql`count(*) filter (where ${startedCheckout})`),
        ordered: num(sql`count(*) filter (where ${hasOrder})`),
      })
      .from(s)
      .where(where),
    db
      .select({
        path: pagePath(e.path),
        views: count(),
        visits: num(sql`count(distinct ${e.sessionId})`),
        avgSeconds: num(sql`coalesce(avg(${e.seconds}), 0)`),
      })
      .from(e)
      .where(and(eq(e.type, "view"), eventsInRange))
      .groupBy(pagePath(e.path))
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({
        path: pagePath(s.landingPage),
        visits: count(),
        bounced: num(sql`count(*) filter (where ${bounced})`),
        ordered: num(sql`count(*) filter (where ${hasOrder})`),
      })
      .from(s)
      .where(where)
      .groupBy(pagePath(s.landingPage))
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ path: pagePath(s.exitPage), visits: count() })
      .from(s)
      .where(where)
      .groupBy(pagePath(s.exitPage))
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        source: sql<string>`coalesce(${s.source}, 'direct')`,
        medium: sql<string>`coalesce(${s.medium}, '')`,
        visits: count(),
        ordered: num(sql`count(*) filter (where ${hasOrder})`),
      })
      .from(s)
      .where(where)
      .groupBy(sql`coalesce(${s.source}, 'direct')`, sql`coalesce(${s.medium}, '')`)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({
        source: sql<string>`coalesce(${s.source}, 'direct')`,
        campaign: sql<string>`${s.campaign}`,
        visits: count(),
        ordered: num(sql`count(*) filter (where ${hasOrder})`),
      })
      .from(s)
      .where(and(where, sql`${s.campaign} is not null`))
      .groupBy(sql`coalesce(${s.source}, 'direct')`, s.campaign)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ label: sql<string>`coalesce(${s.deviceType}, 'unknown')`, visits: count() })
      .from(s)
      .where(where)
      .groupBy(sql`coalesce(${s.deviceType}, 'unknown')`)
      .orderBy(desc(count())),
    db
      .select({
        label: sql<string>`coalesce(regexp_replace(${s.browser}, '\\s+\\d+$', ''), 'Unknown')`,
        visits: count(),
      })
      .from(s)
      .where(where)
      .groupBy(sql`coalesce(regexp_replace(${s.browser}, '\\s+\\d+$', ''), 'Unknown')`)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({
        label: sql<string>`coalesce(regexp_replace(${s.os}, '\\s+[0-9./]+$', ''), 'Unknown')`,
        visits: count(),
      })
      .from(s)
      .where(where)
      .groupBy(sql`coalesce(regexp_replace(${s.os}, '\\s+[0-9./]+$', ''), 'Unknown')`)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({
        label: sql<string>`coalesce(${s.region}, ${s.country}, 'Unknown')`,
        visits: count(),
        ordered: num(sql`count(*) filter (where ${hasOrder})`),
      })
      .from(s)
      .where(where)
      .groupBy(sql`coalesce(${s.region}, ${s.country}, 'Unknown')`)
      .orderBy(desc(count()))
      .limit(12),
    db
      .select({ city: sql<string>`${s.city}`, region: sql<string | null>`max(${s.region})`, visits: count() })
      .from(s)
      .where(and(where, sql`${s.city} is not null`))
      .groupBy(s.city)
      .orderBy(desc(count()))
      .limit(12),
    db
      .select({ type: e.type, times: count(), visits: num(sql`count(distinct ${e.sessionId})`) })
      .from(e)
      .where(and(eventsInRange, sql`${e.type} not in ('view', 'consent')`))
      .groupBy(e.type)
      .orderBy(desc(count())),
    db
      .select({
        pack: sql<string>`${e.data}->>'pack'`,
        picked: num(sql`count(*) filter (where ${e.type} = 'pack_select')`),
        carted: num(sql`count(*) filter (where ${e.type} = 'add_to_cart')`),
      })
      .from(e)
      .where(and(eventsInRange, inArray(e.type, ["pack_select", "add_to_cart"])))
      .groupBy(sql`${e.data}->>'pack'`)
      .orderBy(desc(count())),
    db
      .select({
        checks: count(),
        serviceable: num(sql`count(*) filter (where ${e.data}->>'serviceable' = 'true')`),
        notServiceable: num(sql`count(*) filter (where ${e.data}->>'serviceable' = 'false')`),
        noCod: num(sql`count(*) filter (where ${e.data}->>'cod' = 'false')`),
      })
      .from(e)
      .where(and(eventsInRange, eq(e.type, "pin_check"))),
    db
      .select({ visits: count(), accepted: num(sql`count(*) filter (where ${visitors.anonymous} = false)`) })
      .from(s)
      .innerJoin(visitors, eq(visitors.id, s.visitorId))
      .where(where),
  ]);

  const byDay = new Map(seriesRows.map((r) => [r.day, Number(r.visits)]));
  const series: { label: string; value: number }[] = [];
  for (let d = range.from; d < range.to; d = addDays(d, 1)) {
    const key = istYmd(d);
    series.push({ label: key, value: byDay.get(key) ?? 0 });
  }

  return {
    current,
    previous: prior,
    series,
    funnel: {
      visits: Number(funnel?.visits ?? 0),
      product: funnel?.product ?? 0,
      cart: funnel?.cart ?? 0,
      checkout: funnel?.checkout ?? 0,
      ordered: funnel?.ordered ?? 0,
    },
    topPages,
    landing,
    exits,
    sources,
    campaigns,
    devices,
    browsers,
    systems,
    states,
    cities,
    actions,
    packs,
    pins: {
      checks: Number(pins?.checks ?? 0),
      serviceable: pins?.serviceable ?? 0,
      notServiceable: pins?.notServiceable ?? 0,
      noCod: pins?.noCod ?? 0,
    },
    consent: { visits: Number(consent?.visits ?? 0), accepted: consent?.accepted ?? 0 },
  };
}

export type TrafficOverview = Awaited<ReturnType<typeof getTrafficOverview>>;

/** Visits active in the last five minutes. */
export async function getLiveVisitors(now = new Date()) {
  const db = await getDb();
  const since = new Date(now.getTime() - 5 * 60 * 1000);
  const rows = await db
    .select({
      id: s.id,
      visitorId: s.visitorId,
      currentPage: s.currentPage,
      source: s.source,
      city: s.city,
      region: s.region,
      country: s.country,
      deviceType: s.deviceType,
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      pageviews: s.pageviews,
    })
    .from(s)
    .where(gt(s.lastSeenAt, since))
    .orderBy(desc(s.lastSeenAt))
    .limit(50);
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
  }));
}

export type LiveVisitor = Awaited<ReturnType<typeof getLiveVisitors>>[number];

export const VISITOR_FILTERS = {
  all: "All",
  returning: "Returning",
  carted: "Added to cart",
  checkout: "Reached checkout",
  bought: "Bought",
  accepted: "Accepted cookies",
} as const;
export type VisitorFilter = keyof typeof VISITOR_FILTERS;

const PAGE_SIZE = 50;

const visitorHas = (type: string) =>
  sql<boolean>`exists (select 1 from ${e} where ${e.visitorId} = ${visitors.id} and ${e.type} = ${type})`;
const visitorBought = sql<boolean>`exists (select 1 from ${orders} where ${orders.visitorId} = ${visitors.id} or ${orders.visitId} in (select ${s.id} from ${s} where ${s.visitorId} = ${visitors.id}))`;

export async function listVisitors(opts: { filter?: string; page?: number }) {
  const db = await getDb();
  const filter: VisitorFilter = opts.filter && opts.filter in VISITOR_FILTERS ? (opts.filter as VisitorFilter) : "all";
  const conditions: Record<VisitorFilter, SQL | undefined> = {
    all: undefined,
    returning: gt(visitors.visitCount, 1),
    carted: visitorHas("add_to_cart"),
    checkout: or(visitorHas("begin_checkout"), visitorBought),
    bought: visitorBought,
    accepted: eq(visitors.anonymous, false),
  };
  const where = conditions[filter];
  const page = Math.max(1, opts.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: visitors.id,
        anonymous: visitors.anonymous,
        firstSeenAt: visitors.firstSeenAt,
        lastSeenAt: visitors.lastSeenAt,
        visitCount: visitors.visitCount,
        pageviews: visitors.pageviews,
        engagedSeconds: visitors.engagedSeconds,
        source: visitors.source,
        medium: visitors.medium,
        campaign: visitors.campaign,
        deviceType: visitors.deviceType,
        os: visitors.os,
        browser: visitors.browser,
        deviceModel: visitors.deviceModel,
        city: visitors.city,
        region: visitors.region,
        country: visitors.country,
        customerName: customers.name,
        bought: visitorBought.mapWith(Boolean),
      })
      .from(visitors)
      .leftJoin(customers, eq(customers.id, visitors.customerId))
      .where(where)
      .orderBy(desc(visitors.lastSeenAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(visitors).where(where),
  ]);
  const totalCount = Number(total);
  return { rows, total: totalCount, pageCount: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), filter };
}

export async function getVisitorDetail(id: string) {
  const db = await getDb();
  const [visitor] = await db
    .select({ visitor: visitors, customerName: customers.name, customerPhone: customers.phone })
    .from(visitors)
    .leftJoin(customers, eq(customers.id, visitors.customerId))
    .where(eq(visitors.id, id))
    .limit(1);
  if (!visitor) return null;

  const sessions = await db.select().from(s).where(eq(s.visitorId, id)).orderBy(desc(s.startedAt)).limit(30);
  const sessionIds = sessions.map((x) => x.id);
  const [events, linkedOrders] = await Promise.all([
    sessionIds.length
      ? db
          .select({
            id: e.id,
            sessionId: e.sessionId,
            type: e.type,
            path: e.path,
            seconds: e.seconds,
            data: e.data,
            createdAt: e.createdAt,
          })
          .from(e)
          .where(inArray(e.sessionId, sessionIds))
          .orderBy(asc(e.createdAt))
          .limit(1000)
      : Promise.resolve([]),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        total: orders.total,
        status: orders.status,
        createdAt: orders.createdAt,
        visitId: orders.visitId,
      })
      .from(orders)
      .where(
        sessionIds.length
          ? or(eq(orders.visitorId, id), inArray(orders.visitId, sessionIds))
          : eq(orders.visitorId, id),
      )
      .orderBy(desc(orders.createdAt)),
  ]);

  return { ...visitor, sessions, events, orders: linkedOrders };
}

export type VisitorDetail = NonNullable<Awaited<ReturnType<typeof getVisitorDetail>>>;

/** "How they found us" on an order: its visit, and (with cookie consent) the visits before it. */
export async function getOrderVisit(order: { visitId: string | null; visitorId: string | null; createdAt: Date }) {
  if (!order.visitId && !order.visitorId) return null;
  const db = await getDb();
  const [visit] = order.visitId ? await db.select().from(s).where(eq(s.id, order.visitId)).limit(1) : [];
  const visitorId = order.visitorId ?? visit?.visitorId;
  if (!visitorId) return null;
  const [visitor] = await db.select().from(visitors).where(eq(visitors.id, visitorId)).limit(1);
  if (!visitor) return null;

  const [before] = await db
    .select({
      visits: count(),
      pageviews: num(sql`coalesce(sum(${s.pageviews}), 0)`),
      engaged: num(sql`coalesce(sum(${s.engagedSeconds}), 0)`),
    })
    .from(s)
    .where(and(eq(s.visitorId, visitorId), lte(s.startedAt, order.createdAt)));

  const steps = visit
    ? await db
        .select({ type: e.type, path: e.path, seconds: e.seconds, data: e.data, createdAt: e.createdAt })
        .from(e)
        .where(and(eq(e.sessionId, visit.id), lte(e.createdAt, new Date(order.createdAt.getTime() + 60_000))))
        .orderBy(asc(e.createdAt))
        .limit(40)
    : [];

  return {
    visitor,
    visit: visit ?? null,
    visitsBefore: Number(before?.visits ?? 0),
    pageviewsBefore: before?.pageviews ?? 0,
    engagedBefore: before?.engaged ?? 0,
    steps,
  };
}

export type OrderVisit = NonNullable<Awaited<ReturnType<typeof getOrderVisit>>>;
