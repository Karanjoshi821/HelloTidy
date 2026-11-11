import "server-only";
import { and, eq, lt, lte, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "../auth/session";
import { getDb, type Database } from "../db";
import { isUniqueViolation } from "../db/errors";
import { orders, visitorEvents, visitorSessions, visitors } from "../db/schema";
import { rateLimit } from "../security/rate-limit";
import { getRequestContext } from "../security/request";
import { arrivalOf, cleanPath, isPrivatePath, type Arrival } from "./attribution";
import { dropVisitorCookie, keepVisitorCookie, visitorCookie } from "./cookie";
import { placeFromHeaders, type Place } from "./location";
import { visitSchema, type VisitInput } from "./schema";
import { describeAgent, type Agent } from "./user-agent";

/**
 * Server half of our own visitor tracking (browser half: tracker.ts).
 *
 * Without cookie consent a visit is its own anonymous visitor: no cookie, IP
 * address, PIN area or phone model, and nothing links it to other visits.
 * With consent, a first-party cookie links the device's visits and those
 * details are kept. Bots and signed-in staff are never recorded, nor are
 * order pages (their URL holds a private token).
 */

/** Past this many pages in one visit, a script rather than a person. */
const MAX_VIEWS_PER_VISIT = 300;
/** More than an hour on one page is a tab left open. */
const MAX_SECONDS_PER_VIEW = 3600;
/** The privacy policy promises 12 months. */
export const RETENTION_DAYS = 365;

type Facts = Place & { ip: string | null; ipHash: string; userAgent: string; host: string | null };
type Resolved = { id: string; anonymous: boolean; visitCount: number };
type Visit = { id: string; pageviews: number };
type Device = Extract<VisitInput, { t: "view" }>["device"];

async function requestFacts(): Promise<Facts> {
  const h = await headers();
  const ctx = await getRequestContext();
  return {
    ...placeFromHeaders(h),
    ip: ctx.ip === "0.0.0.0" ? null : ctx.ip,
    ipHash: ctx.ipHash,
    userAgent: ctx.userAgent,
    host: h.get("x-forwarded-host") ?? h.get("host"),
  };
}

const keep = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

/** Undefined fields are left as they are, so a request without location headers never wipes a city. */
function profile(agent: Agent, facts: Facts, device: Device, identified: boolean) {
  return {
    deviceType: agent.deviceType,
    os: keep(agent.os),
    browser: keep(agent.browser),
    screen: keep(device?.screen),
    language: keep(device?.lang),
    timezone: keep(device?.tz),
    country: keep(facts.country),
    region: keep(facts.region),
    city: keep(facts.city),
    ...(identified
      ? { ip: keep(facts.ip), postalCode: keep(facts.postalCode), deviceModel: keep(agent.deviceModel) }
      : {}),
  };
}

function arrivalFor(input: VisitInput, facts: Facts): Arrival | null {
  if (input.t !== "view") return null;
  return arrivalOf({ path: input.path, referrer: input.ref, ownHost: facts.host, userAgent: facts.userAgent });
}

const VISITOR_COLS = { id: visitors.id, anonymous: visitors.anonymous, visitCount: visitors.visitCount };

async function findByAnonKey(db: Database, sid: string): Promise<Resolved | undefined> {
  const [row] = await db.select(VISITOR_COLS).from(visitors).where(eq(visitors.anonKey, sid)).limit(1);
  return row;
}

/**
 * Accepting mid-visit keeps the pages seen so far: the visit's anonymous row
 * becomes the device's, or is folded into the device the cookie already names.
 */
async function resolveVisitor(
  db: Database,
  input: VisitInput,
  facts: Facts,
  agent: Agent,
  now: Date,
): Promise<Resolved> {
  const arrival = arrivalFor(input, facts);
  const device = input.t === "view" ? input.device : undefined;
  const seed = {
    firstSeenAt: now,
    lastSeenAt: now,
    ...profile(agent, facts, device, input.consent),
    referrer: keep(arrival?.referrer),
    source: keep(arrival?.source),
    medium: keep(arrival?.medium),
    campaign: keep(arrival?.campaign),
    landingPage: input.t === "view" ? cleanPath(input.path) : undefined,
  };

  const thisVisit = await findByAnonKey(db, input.sid);

  if (!input.consent) {
    if (thisVisit) return thisVisit;
    try {
      const [created] = await db
        .insert(visitors)
        .values({ ...seed, anonymous: true, anonKey: input.sid })
        .returning(VISITOR_COLS);
      return created!;
    } catch (error) {
      // Two messages from the same new visit, both first.
      if (!isUniqueViolation(error)) throw error;
      return (await findByAnonKey(db, input.sid))!;
    }
  }

  const cookieId = await visitorCookie();
  const [known] = cookieId
    ? await db
        .select(VISITOR_COLS)
        .from(visitors)
        .where(and(eq(visitors.id, cookieId), eq(visitors.anonymous, false)))
        .limit(1)
    : [];

  let visitor: Resolved;
  if (known) {
    if (thisVisit) await foldInto(db, known.id, thisVisit.id, input.sid);
    visitor = known;
  } else if (thisVisit) {
    const [updated] = await db
      .update(visitors)
      .set({ anonymous: false, anonKey: null, consentAt: now, ...profile(agent, facts, device, true) })
      .where(eq(visitors.id, thisVisit.id))
      .returning(VISITOR_COLS);
    visitor = updated!;
    await db
      .update(visitorSessions)
      .set({ ip: facts.ip })
      .where(and(eq(visitorSessions.visitorId, visitor.id), eq(visitorSessions.key, input.sid)));
  } else {
    const [created] = await db
      .insert(visitors)
      .values({ ...seed, anonymous: false, consentAt: now })
      .returning(VISITOR_COLS);
    visitor = created!;
  }

  // Every time, so the year runs from the last visit.
  await keepVisitorCookie(visitor.id);
  return visitor;
}

async function foldInto(db: Database, knownId: string, anonId: string, sid: string): Promise<void> {
  await db.transaction(async (tx) => {
    // The device may already hold this visit (choice changed mid-visit): merge into it.
    const [same] = await tx
      .select({ id: visitorSessions.id })
      .from(visitorSessions)
      .where(and(eq(visitorSessions.visitorId, knownId), eq(visitorSessions.key, sid)))
      .limit(1);
    if (same) {
      const [stretch] = await tx
        .select({
          id: visitorSessions.id,
          pageviews: visitorSessions.pageviews,
          engaged: visitorSessions.engagedSeconds,
        })
        .from(visitorSessions)
        .where(and(eq(visitorSessions.visitorId, anonId), eq(visitorSessions.key, sid)))
        .limit(1);
      if (stretch) {
        await tx
          .update(visitorEvents)
          .set({ visitorId: knownId, sessionId: same.id })
          .where(eq(visitorEvents.sessionId, stretch.id));
        await tx.update(orders).set({ visitId: same.id }).where(eq(orders.visitId, stretch.id));
        await tx
          .update(visitorSessions)
          .set({
            pageviews: sql`${visitorSessions.pageviews} + ${stretch.pageviews}`,
            engagedSeconds: sql`${visitorSessions.engagedSeconds} + ${stretch.engaged}`,
          })
          .where(eq(visitorSessions.id, same.id));
        await tx.delete(visitorSessions).where(eq(visitorSessions.id, stretch.id));
      }
    }
    await tx.update(visitorSessions).set({ visitorId: knownId }).where(eq(visitorSessions.visitorId, anonId));
    await tx.update(visitorEvents).set({ visitorId: knownId }).where(eq(visitorEvents.visitorId, anonId));
    const [anon] = await tx.delete(visitors).where(eq(visitors.id, anonId)).returning({
      visitCount: visitors.visitCount,
      pageviews: visitors.pageviews,
      engaged: visitors.engagedSeconds,
    });
    if (anon) {
      await tx
        .update(visitors)
        .set({
          visitCount: sql`${visitors.visitCount} + ${same ? 0 : anon.visitCount}`,
          pageviews: sql`${visitors.pageviews} + ${anon.pageviews}`,
          engagedSeconds: sql`${visitors.engagedSeconds} + ${anon.engaged}`,
        })
        .where(eq(visitors.id, knownId));
    }
  });
}

async function findSession(db: Database, visitorId: string, sid: string): Promise<Visit | undefined> {
  const [row] = await db
    .select({ id: visitorSessions.id, pageviews: visitorSessions.pageviews })
    .from(visitorSessions)
    .where(and(eq(visitorSessions.visitorId, visitorId), eq(visitorSessions.key, sid)))
    .limit(1);
  return row;
}

async function resolveSession(
  db: Database,
  visitor: Resolved,
  input: VisitInput,
  facts: Facts,
  agent: Agent,
  now: Date,
): Promise<Visit> {
  const found = await findSession(db, visitor.id, input.sid);
  if (found) return found;

  const arrival = arrivalFor(input, facts);
  const landing = input.t === "view" ? cleanPath(input.path) : null;
  try {
    const [created] = await db
      .insert(visitorSessions)
      .values({
        visitorId: visitor.id,
        key: input.sid,
        firstVisit: visitor.anonymous || visitor.visitCount === 0,
        startedAt: now,
        lastSeenAt: now,
        landingPage: landing,
        currentPage: landing,
        referrer: arrival?.referrer ?? null,
        source: arrival?.source ?? null,
        medium: arrival?.medium ?? null,
        campaign: arrival?.campaign ?? null,
        deviceType: agent.deviceType,
        browser: agent.browser,
        os: agent.os,
        country: facts.country,
        region: facts.region,
        city: facts.city,
        ip: visitor.anonymous ? null : facts.ip,
      })
      .returning({ id: visitorSessions.id, pageviews: visitorSessions.pageviews });
    await db
      .update(visitors)
      .set({ visitCount: sql`${visitors.visitCount} + 1` })
      .where(eq(visitors.id, visitor.id));
    return created!;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await findSession(db, visitor.id, input.sid))!;
  }
}

async function touch(db: Database, visitor: Resolved, visit: Visit, now: Date): Promise<void> {
  await db.update(visitorSessions).set({ lastSeenAt: now }).where(eq(visitorSessions.id, visit.id));
  await db.update(visitors).set({ lastSeenAt: now }).where(eq(visitors.id, visitor.id));
}

/** View id and visit id are both random and must match: only that visit can add time. */
async function addTime(db: Database, input: { pv: string; sid: string; s: number }): Promise<boolean> {
  const [view] = await db
    .select({ sessionId: visitorEvents.sessionId, visitorId: visitorEvents.visitorId })
    .from(visitorEvents)
    .innerJoin(visitorSessions, eq(visitorSessions.id, visitorEvents.sessionId))
    .where(and(eq(visitorEvents.id, input.pv), eq(visitorEvents.type, "view"), eq(visitorSessions.key, input.sid)))
    .limit(1);
  if (!view) return false;

  const added = await db
    .update(visitorEvents)
    .set({ seconds: sql`${visitorEvents.seconds} + ${input.s}` })
    .where(and(eq(visitorEvents.id, input.pv), lte(visitorEvents.seconds, MAX_SECONDS_PER_VIEW - input.s)))
    .returning({ id: visitorEvents.id });
  if (added.length === 0) return false;

  const now = new Date();
  await db
    .update(visitorSessions)
    .set({ engagedSeconds: sql`${visitorSessions.engagedSeconds} + ${input.s}`, lastSeenAt: now })
    .where(eq(visitorSessions.id, view.sessionId));
  await db
    .update(visitors)
    .set({ engagedSeconds: sql`${visitors.engagedSeconds} + ${input.s}`, lastSeenAt: now })
    .where(eq(visitors.id, view.visitorId));
  return true;
}

/** Consent withdrawn: drop the cookie and everything identifying. The pages stay, anonymous. */
async function forgetDevice(db: Database): Promise<void> {
  const id = await visitorCookie();
  if (!id) return;
  await dropVisitorCookie();
  await db.transaction(async (tx) => {
    await tx
      .update(visitors)
      .set({ anonymous: true, consentAt: null, ip: null, postalCode: null, deviceModel: null, customerId: null })
      .where(and(eq(visitors.id, id), eq(visitors.anonymous, false)));
    await tx.update(visitorSessions).set({ ip: null }).where(eq(visitorSessions.visitorId, id));
    await tx.update(orders).set({ visitorId: null }).where(eq(orders.visitorId, id));
    // The order number would lead back to a name.
    await tx
      .update(visitorEvents)
      .set({ data: null })
      .where(and(eq(visitorEvents.visitorId, id), eq(visitorEvents.type, "order_placed")));
  });
}

/** Signed-in staff browsing the store are not visitors. A stale cookie only means one person isn't counted. */
async function isStaff(): Promise<boolean> {
  return Boolean((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Records one tracker message. Public and unauthenticated: it never reads data
 * back out, and answers the same whatever happened.
 */
export async function recordVisit(raw: unknown): Promise<boolean> {
  const parsed = visitSchema.safeParse(raw);
  if (!parsed.success) return false;
  const input = parsed.data;
  if ((input.t === "view" || input.t === "event") && input.path && isPrivatePath(input.path)) return false;
  if (await isStaff()) return false;

  const facts = await requestFacts();
  const device = input.t === "view" ? input.device : undefined;
  const agent = describeAgent(facts.userAgent, {
    model: device?.model,
    platformVersion: device?.platformVersion,
    touch: device?.touch,
  });
  if (agent.bot) return false;

  const limit = await rateLimit(`visits:${facts.ipHash}`, 600, 600);
  if (!limit.ok) return false;

  const db = await getDb();
  if (input.t === "time") return addTime(db, input);

  // Consent withdrawn: forget before anything else is written.
  if (input.t === "consent" && !input.consent) {
    await forgetDevice(db);
    return true;
  }

  const now = new Date();
  if (input.t === "consent") {
    // Accepted before any page was recorded (e.g. on an order page): the next page view creates the visitor.
    if (!(await findByAnonKey(db, input.sid)) && !(await visitorCookie())) return true;
    const visitor = await resolveVisitor(db, input, facts, agent, now);
    const visit = await findSession(db, visitor.id, input.sid);
    if (visit) {
      await db
        .insert(visitorEvents)
        .values({ visitorId: visitor.id, sessionId: visit.id, type: "consent", data: { granted: true } });
    }
    return true;
  }

  const visitor = await resolveVisitor(db, input, facts, agent, now);
  const visit = await resolveSession(db, visitor, input, facts, agent, now);

  switch (input.t) {
    case "view": {
      const path = cleanPath(input.path);
      if (visit.pageviews >= MAX_VIEWS_PER_VISIT) {
        await touch(db, visitor, visit, now);
        return false;
      }
      const inserted = await db
        .insert(visitorEvents)
        .values({ id: input.pv, visitorId: visitor.id, sessionId: visit.id, type: "view", path })
        .onConflictDoNothing()
        .returning({ id: visitorEvents.id });
      // Duplicate delivery.
      if (inserted.length === 0) return false;
      await db
        .update(visitorSessions)
        .set({ pageviews: sql`${visitorSessions.pageviews} + 1`, exitPage: path, currentPage: path, lastSeenAt: now })
        .where(eq(visitorSessions.id, visit.id));
      await db
        .update(visitors)
        .set({
          pageviews: sql`${visitors.pageviews} + 1`,
          lastSeenAt: now,
          ...profile(agent, facts, input.device, !visitor.anonymous),
        })
        .where(eq(visitors.id, visitor.id));
      return true;
    }
    case "event": {
      const data = input.data ? { ...input.data } : null;
      // Without consent only the PIN's first three digits (its postal region) are kept.
      if (data && typeof data.pin === "string" && visitor.anonymous) data.pin = `${data.pin.slice(0, 3)}xxx`;
      await db.insert(visitorEvents).values({
        visitorId: visitor.id,
        sessionId: visit.id,
        type: input.name,
        path: input.path ? cleanPath(input.path) : null,
        data,
      });
      await touch(db, visitor, visit, now);
      return true;
    }
  }
}

/**
 * Links a new order to the visit it was placed in, and (only if the buyer
 * accepted cookies) to their visitor and customer record. Must never fail an
 * order: call it from after().
 */
export async function linkOrderToVisit(input: {
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  total: number;
  sid: string | undefined;
  consent: boolean;
  cookieId: string | null;
}): Promise<void> {
  try {
    if (!input.sid) return;
    const db = await getDb();
    const [known] =
      input.consent && input.cookieId
        ? await db
            .select(VISITOR_COLS)
            .from(visitors)
            .where(and(eq(visitors.id, input.cookieId), eq(visitors.anonymous, false)))
            .limit(1)
        : [];
    const visitor = known ?? (await findByAnonKey(db, input.sid));
    if (!visitor) return;
    const visit = await findSession(db, visitor.id, input.sid);
    if (!visit) return;

    await db
      .update(orders)
      .set({ visitId: visit.id, visitorId: known ? known.id : null })
      .where(eq(orders.id, input.orderId));
    await db.insert(visitorEvents).values({
      visitorId: visitor.id,
      sessionId: visit.id,
      type: "order_placed",
      data: known ? { order: input.orderNumber, value: input.total } : { value: input.total },
    });
    await touch(db, visitor, visit, new Date());
    if (known && input.customerId) {
      await db.update(visitors).set({ customerId: input.customerId }).where(eq(visitors.id, known.id));
    }
  } catch (error) {
    console.error("[visitors] could not link order", input.orderNumber, error);
  }
}

let lastPrune = 0;

/**
 * Deletes visits older than the retention period, as the privacy policy says.
 * There's no scheduler, so it runs (at most every 6 hours per server) when
 * staff open the visitor screens.
 */
export async function pruneVisitorData(now = new Date()): Promise<void> {
  if (now.getTime() - lastPrune < 6 * 60 * 60 * 1000) return;
  lastPrune = now.getTime();
  try {
    const db = await getDb();
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.delete(visitorSessions).where(lt(visitorSessions.lastSeenAt, cutoff));
    await db.delete(visitors).where(lt(visitors.lastSeenAt, cutoff));
  } catch (error) {
    lastPrune = 0;
    console.error("[visitors] prune failed:", error);
  }
}
