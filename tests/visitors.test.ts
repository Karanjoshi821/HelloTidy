import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gaClientIdFromCookie, gaSessionCookieName, gaSessionIdFromCookie } from "@/lib/analytics/ga-cookies";
import { getDb } from "@/lib/db";
import { orders, visitorEvents, visitorSessions, visitors } from "@/lib/db/schema";
import { escapeXml, productFeed } from "@/lib/feeds";
import { placeOrder } from "@/lib/orders/service";
import { arrivalOf, cleanPath, isPrivatePath } from "@/lib/visitors/attribution";
import { describeEvent, formatDuration, pageName } from "@/lib/visitors/format";
import { placeFromHeaders } from "@/lib/visitors/location";
import { visitSchema } from "@/lib/visitors/schema";
import { describeAgent } from "@/lib/visitors/user-agent";
import { checkout, ctx } from "./helpers";

// ── request mocks for the database flow ─────────────────────
const request = { headers: new Headers(), jar: new Map<string, string>() };
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name) } : undefined),
    set: (name: string, value: string) => void request.jar.set(name, value),
    delete: (name: string) => void request.jar.delete(name),
  }),
}));

const { recordVisit, linkOrderToVisit } = await import("@/lib/visitors/service");

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

describe("cleanPath and private paths", () => {
  it("keeps only allow-listed parameters", () => {
    expect(cleanPath("/products/x?pack=pack-50&phone=9876543210&utm_source=ig&token=abc")).toBe(
      "/products/x?pack=pack-50&utm_source=ig",
    );
    expect(cleanPath("/")).toBe("/");
  });
  it("never records order pages, the admin or the API", () => {
    expect(isPrivatePath("/order/abc123")).toBe(true);
    expect(isPrivatePath("/admin/orders")).toBe(true);
    expect(isPrivatePath("/api/visits")).toBe(true);
    expect(isPrivatePath("/orders-faq")).toBe(false);
    expect(isPrivatePath("/products/magic-eraser-sponge")).toBe(false);
  });
});

describe("arrivalOf", () => {
  it("uses UTM tags first", () => {
    expect(
      arrivalOf({
        path: "/?utm_source=Instagram&utm_medium=paid&utm_campaign=Diwali",
        referrer: "https://google.com/",
      }),
    ).toMatchObject({
      source: "instagram",
      medium: "paid",
      campaign: "diwali",
    });
  });
  it("reads ad click ids", () => {
    expect(arrivalOf({ path: "/?gclid=x" })).toMatchObject({ source: "google", medium: "cpc" });
    expect(arrivalOf({ path: "/?fbclid=x", userAgent: "Mozilla Instagram 300.0" })).toMatchObject({
      source: "instagram",
    });
    expect(arrivalOf({ path: "/?fbclid=x" })).toMatchObject({ source: "facebook", medium: "social" });
  });
  it("classifies referrers, Android apps and in-app browsers", () => {
    expect(arrivalOf({ path: "/", referrer: "https://www.google.co.in/" })).toMatchObject({
      source: "google",
      medium: "organic",
    });
    expect(arrivalOf({ path: "/", referrer: "https://l.instagram.com/" })).toMatchObject({
      source: "instagram",
      medium: "social",
    });
    expect(arrivalOf({ path: "/", referrer: "android-app://com.whatsapp/" })).toMatchObject({ source: "whatsapp" });
    expect(arrivalOf({ path: "/", referrer: "https://blog.example.com/post?x=1" })).toMatchObject({
      source: "blog.example.com",
      medium: "referral",
      referrer: "https://blog.example.com/post",
    });
    expect(arrivalOf({ path: "/", userAgent: "Mozilla [FBAN/FBIOS;FBAV/400]" })).toMatchObject({ source: "facebook" });
  });
  it("treats our own site and no referrer as direct", () => {
    expect(arrivalOf({ path: "/", referrer: "https://hellotidy.in/faq", ownHost: "hellotidy.in" }).source).toBe(
      "direct",
    );
    expect(arrivalOf({ path: "/" }).source).toBe("direct");
  });
});

describe("describeAgent", () => {
  it("flags bots, crawlers and headless browsers", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
      "curl/8.4.0",
      "facebookexternalhit/1.1",
      "",
    ]) {
      expect(describeAgent(ua).bot).toBe(true);
    }
    // Cubot is a phone maker, not a bot.
    expect(describeAgent("Mozilla/5.0 (Linux; Android 12; CUBOT X50) Mobile").bot).toBe(false);
  });
  it("reads phones, tablets and in-app browsers", () => {
    expect(describeAgent(PHONE_UA)).toMatchObject({
      deviceType: "mobile",
      os: "Android 14",
      browser: "Chrome 130",
      deviceModel: "SM-S918B",
    });
    expect(
      describeAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      ),
    ).toMatchObject({ deviceType: "mobile", os: "iOS 17.4", browser: "Safari 17", deviceModel: "iPhone" });
    expect(describeAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", { touch: 5 }).deviceType).toBe(
      "tablet",
    );
    expect(
      describeAgent(
        "Mozilla/5.0 (Linux; Android 10; K) Chrome/130.0 Mobile Instagram 300.0 Android (33/13; 420dpi; 1080x2340; samsung; SM-S911B; dm1q;",
      ),
    ).toMatchObject({ browser: "Instagram app", deviceModel: "samsung SM-S911B" });
    expect(
      describeAgent("Mozilla/5.0 (Linux; Android 10; K) Chrome/130.0 Mobile", {
        model: "Pixel 8",
        platformVersion: "14.0.0",
      }),
    ).toMatchObject({
      os: "Android 14",
      deviceModel: "Pixel 8",
    });
  });
});

describe("placeFromHeaders", () => {
  it("turns Vercel's headers into a place, with Indian state names", () => {
    const h = new Headers({
      "x-vercel-ip-country": "IN",
      "x-vercel-ip-country-region": "UP",
      "x-vercel-ip-city": "Ghaziabad",
      "x-vercel-ip-postal-code": "201001",
    });
    expect(placeFromHeaders(h)).toEqual({
      country: "IN",
      region: "Uttar Pradesh",
      city: "Ghaziabad",
      postalCode: "201001",
    });
    expect(
      placeFromHeaders(new Headers({ "x-vercel-ip-country": "IN", "x-vercel-ip-country-region": "TS" })).region,
    ).toBe("Telangana");
    expect(
      placeFromHeaders(
        new Headers({
          "x-vercel-ip-city": "S%C3%A3o%20Paulo",
          "x-vercel-ip-country": "BR",
          "x-vercel-ip-country-region": "SP",
        }),
      ),
    ).toMatchObject({
      city: "São Paulo",
      region: "SP",
    });
    expect(placeFromHeaders(new Headers({ "x-vercel-ip-country": "XX" })).country).toBeNull();
    expect(placeFromHeaders(new Headers())).toEqual({ country: null, region: null, city: null, postalCode: null });
  });
});

describe("visitSchema", () => {
  const sid = randomUUID();
  it("accepts tracker messages and rejects unknown events or bulky data", () => {
    expect(visitSchema.safeParse({ t: "view", sid, consent: false, pv: randomUUID(), path: "/" }).success).toBe(true);
    expect(
      visitSchema.safeParse({ t: "event", sid, consent: false, name: "pin_check", data: { pin: "201001" } }).success,
    ).toBe(true);
    expect(visitSchema.safeParse({ t: "event", sid, consent: false, name: "hack" }).success).toBe(false);
    const bulky = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i]));
    expect(visitSchema.safeParse({ t: "event", sid, consent: false, name: "pack_select", data: bulky }).success).toBe(
      false,
    );
    expect(visitSchema.safeParse({ t: "time", sid, consent: false, pv: randomUUID(), s: 5000 }).success).toBe(false);
  });
});

describe("Google Analytics cookies", () => {
  it("reads the client and session ids", () => {
    expect(gaClientIdFromCookie("GA1.1.1234567890.1700000000")).toBe("1234567890.1700000000");
    expect(gaClientIdFromCookie("junk")).toBeUndefined();
    expect(gaSessionIdFromCookie("GS1.1.1700000000.3.1.1700000100.0.0.0")).toBe("1700000000");
    expect(gaSessionIdFromCookie("GS2.1.s1700000000$o3$g1$t1700000100$j0$l0$h0")).toBe("1700000000");
    expect(gaSessionCookieName("G-ABC123")).toBe("_ga_ABC123");
  });
});

describe("productFeed", () => {
  const packs = [
    {
      id: "pack-25",
      sku: "HT-25",
      name: "Pack of 25",
      count: 25,
      price: 54900,
      mrp: 109900,
      badge: null,
      blurb: "",
      available: true,
    },
    {
      id: "pack-50",
      sku: "HT-50",
      name: "Mega <Pack> & more",
      count: 50,
      price: 89900,
      mrp: 89900,
      badge: null,
      blurb: "",
      available: false,
    },
  ];
  it("gives Google the selling price and the MRP in maximum_retail_price", () => {
    const xml = productFeed({ packs }, "google");
    expect(xml).toContain("<g:price>549.00 INR</g:price><g:maximum_retail_price>1099.00 INR</g:maximum_retail_price>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(xml).toContain("<g:google_product_category>2796</g:google_product_category>");
    expect(xml).toContain("Mega &lt;Pack&gt; &amp; more");
    expect(xml).not.toContain("sale_price");
  });
  it("gives Meta the MRP as price and the selling price as sale_price, only when discounted", () => {
    const xml = productFeed({ packs }, "meta");
    expect(xml).toContain("<g:price>1099.00 INR</g:price><g:sale_price>549.00 INR</g:sale_price>");
    expect(xml).toContain("<g:price>899.00 INR</g:price><g:shipping>");
    expect(xml).toContain("<g:availability>in stock</g:availability>");
  });
  it("escapes XML", () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
  });
});

describe("visitor display helpers", () => {
  it("names pages and events", () => {
    expect(pageName("/products/magic-eraser-sponge?pack=pack-50")).toBe("Product page (pack-50)");
    expect(pageName("/guides/remove-crayon-from-walls")).toBe("Guide: remove crayon from walls");
    expect(describeEvent("pin_check", { pin: "201xxx", serviceable: true, cod: false })).toBe(
      "Checked a PIN code: 201xxx, delivers, no COD",
    );
    expect(describeEvent("add_to_cart", { pack: "pack-25", qty: 2, via: "buy_now" })).toBe(
      "Added to cart: pack-25 × 2 (Buy now)",
    );
    expect(formatDuration(5)).toBe("5s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3700)).toBe("1h 01m");
  });
});

// ── the whole flow, against the test database ───────────────
describe("recordVisit", () => {
  beforeEach(() => {
    request.headers = new Headers({
      "user-agent": PHONE_UA,
      "x-real-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      host: "hellotidy.in",
      "x-vercel-ip-country": "IN",
      "x-vercel-ip-country-region": "MH",
      "x-vercel-ip-city": "Pune",
      "x-vercel-ip-postal-code": "411001",
    });
    request.jar = new Map();
  });

  async function sessionFor(sid: string) {
    const db = await getDb();
    const [row] = await db.select().from(visitorSessions).where(eq(visitorSessions.key, sid));
    return row;
  }

  it("counts a visitor who declined anonymously: no cookie, IP, PIN area or phone model", async () => {
    const sid = randomUUID();
    const pv = randomUUID();
    const ok = await recordVisit({
      t: "view",
      sid,
      consent: false,
      pv,
      path: "/products/magic-eraser-sponge?pack=pack-50&phone=9876543210&utm_source=instagram&utm_campaign=launch",
      ref: "https://l.instagram.com/",
      device: { screen: "412x915", lang: "en-IN", model: "SM-S918B" },
    });
    expect(ok).toBe(true);
    expect(request.jar.size).toBe(0);

    const session = (await sessionFor(sid))!;
    expect(session).toMatchObject({
      pageviews: 1,
      source: "instagram",
      campaign: "launch",
      city: "Pune",
      region: "Maharashtra",
      ip: null,
    });
    expect(session.landingPage).toBe(
      "/products/magic-eraser-sponge?pack=pack-50&utm_source=instagram&utm_campaign=launch",
    );

    const db = await getDb();
    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, session.visitorId));
    expect(visitor).toMatchObject({
      anonymous: true,
      anonKey: sid,
      ip: null,
      postalCode: null,
      deviceModel: null,
      city: "Pune",
    });

    // Time is added to the view, but only by the same visit.
    expect(await recordVisit({ t: "time", sid, consent: false, pv, s: 12 })).toBe(true);
    expect(await recordVisit({ t: "time", sid: randomUUID(), consent: false, pv, s: 12 })).toBe(false);
    expect((await sessionFor(sid))!.engagedSeconds).toBe(12);

    // Only the PIN's postal region is kept without consent.
    await recordVisit({
      t: "event",
      sid,
      consent: false,
      name: "pin_check",
      path: "/products/x",
      data: { pin: "411001", serviceable: true },
    });
    const events = await db.select().from(visitorEvents).where(eq(visitorEvents.sessionId, session.id));
    expect(events.find((e) => e.type === "pin_check")?.data).toMatchObject({ pin: "411xxx", serviceable: true });
  });

  it("ignores bots, staff, order pages and duplicate views", async () => {
    const sid = randomUUID();
    request.headers.set("user-agent", "Mozilla/5.0 (compatible; Googlebot/2.1)");
    expect(await recordVisit({ t: "view", sid, consent: false, pv: randomUUID(), path: "/" })).toBe(false);
    request.headers.set("user-agent", PHONE_UA);
    expect(await recordVisit({ t: "view", sid, consent: false, pv: randomUUID(), path: "/order/secret-token" })).toBe(
      false,
    );
    request.jar.set("hellotidy_admin", "x");
    expect(await recordVisit({ t: "view", sid, consent: false, pv: randomUUID(), path: "/" })).toBe(false);
    request.jar.delete("hellotidy_admin");
    expect(await sessionFor(sid)).toBeUndefined();

    const pv = randomUUID();
    expect(await recordVisit({ t: "view", sid, consent: false, pv, path: "/" })).toBe(true);
    expect(await recordVisit({ t: "view", sid, consent: false, pv, path: "/" })).toBe(false);
    expect((await sessionFor(sid))!.pageviews).toBe(1);
  });

  it("links visits after Accept, keeps the pages seen so far, and forgets them after Decline", async () => {
    const db = await getDb();
    const sid = randomUUID();
    await recordVisit({ t: "view", sid, consent: false, pv: randomUUID(), path: "/" });
    // Accept mid-visit: the anonymous visitor becomes the device's, and a cookie is set.
    await recordVisit({ t: "consent", sid, consent: true });
    const cookieId = request.jar.get("hellotidy_vid");
    expect(cookieId).toBeTruthy();
    await recordVisit({ t: "view", sid, consent: true, pv: randomUUID(), path: "/faq", device: { model: "SM-S918B" } });

    const [known] = await db.select().from(visitors).where(eq(visitors.id, cookieId!));
    expect(known).toMatchObject({
      anonymous: false,
      anonKey: null,
      pageviews: 2,
      visitCount: 1,
      deviceModel: "SM-S918B",
      postalCode: "411001",
    });
    expect(known!.ip).toMatch(/^198\.51\.100\./);

    // A later visit from the same browser is linked and counted as returning.
    const sid2 = randomUUID();
    await recordVisit({ t: "view", sid: sid2, consent: true, pv: randomUUID(), path: "/" });
    const second = (await sessionFor(sid2))!;
    expect(second.visitorId).toBe(cookieId);
    expect(second.firstVisit).toBe(false);

    // An order placed in that visit is linked to the visit, the visitor and the customer.
    const { order } = await placeOrder(checkout({ attribution: { consent: "granted" }, visitId: sid2 }), ctx);
    await linkOrderToVisit({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      total: order.total,
      sid: sid2,
      consent: true,
      cookieId: cookieId!,
    });
    const [linked] = await db
      .select({ visitId: orders.visitId, visitorId: orders.visitorId })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(linked).toEqual({ visitId: second.id, visitorId: cookieId });

    // Decline: the cookie and identifying details go; the pages stay, anonymous.
    await recordVisit({ t: "consent", sid: sid2, consent: false });
    expect(request.jar.has("hellotidy_vid")).toBe(false);
    const [forgotten] = await db.select().from(visitors).where(eq(visitors.id, cookieId!));
    expect(forgotten).toMatchObject({
      anonymous: true,
      ip: null,
      postalCode: null,
      deviceModel: null,
      customerId: null,
    });
    const [unlinked] = await db.select({ visitorId: orders.visitorId }).from(orders).where(eq(orders.id, order.id));
    expect(unlinked!.visitorId).toBeNull();
    const placed = await db.select().from(visitorEvents).where(eq(visitorEvents.visitorId, cookieId!));
    expect(placed.find((e) => e.type === "order_placed")?.data).toBeNull();
  });

  it("doesn't make an empty visit when someone accepts before any page was recorded", async () => {
    const db = await getDb();
    const sid = randomUUID();
    expect(await recordVisit({ t: "consent", sid, consent: true })).toBe(true);
    expect(request.jar.has("hellotidy_vid")).toBe(false);
    expect(await db.select().from(visitors).where(eq(visitors.anonKey, sid))).toHaveLength(0);
    // The first page view then creates the device's visitor and its cookie.
    await recordVisit({ t: "view", sid, consent: true, pv: randomUUID(), path: "/" });
    expect(request.jar.has("hellotidy_vid")).toBe(true);
    expect((await sessionFor(sid))!.pageviews).toBe(1);
  });

  it("links an order from a visitor who declined to that visit only", async () => {
    const db = await getDb();
    const sid = randomUUID();
    await recordVisit({ t: "view", sid, consent: false, pv: randomUUID(), path: "/checkout" });
    const { order } = await placeOrder(checkout({ visitId: sid }), ctx);
    await linkOrderToVisit({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      total: order.total,
      sid,
      consent: false,
      cookieId: null,
    });
    const [linked] = await db
      .select({ visitId: orders.visitId, visitorId: orders.visitorId })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(linked!.visitId).toBe((await sessionFor(sid))!.id);
    expect(linked!.visitorId).toBeNull();
    const events = await db.select().from(visitorEvents).where(eq(visitorEvents.sessionId, linked!.visitId!));
    expect(events.find((e) => e.type === "order_placed")?.data).toEqual({ value: order.total });
  });
});
