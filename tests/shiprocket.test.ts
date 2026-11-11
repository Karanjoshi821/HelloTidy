import { afterEach, describe, expect, it, vi } from "vitest";
import { courierDeliveryRange } from "@/lib/delivery";
import type { OrderWithItems } from "@/lib/notify/types";
import { summariseCouriers } from "@/lib/shipping/shiprocket";
import { shiprocketDate, shiprocketOrderPayload } from "@/lib/shipping/shiprocket-order";

describe("summariseCouriers", () => {
  it("prefers Delhivery's estimate, since the vendor ships with Delhivery", () => {
    const s = summariseCouriers([
      { courier_name: "DTDC Air", estimated_delivery_days: "2", cod: 0, city: "Pune", state: "Maharashtra" },
      { courier_name: "Delhivery Surface", estimated_delivery_days: "4", cod: 1 },
      { courier_name: "Delhivery Air", estimated_delivery_days: "3", cod: 1 },
    ]);
    expect(s).toEqual({ serviceable: true, cod: true, days: 3, city: "Pune", state: "Maharashtra" });
  });

  it("falls back to the fastest courier and reports COD only if one collects cash", () => {
    const s = summariseCouriers([
      { courier_name: "DTDC Surface", estimated_delivery_days: "6", cod: 0 },
      { courier_name: "Xpressbees", estimated_delivery_days: "5", cod: 0 },
    ]);
    expect(s.days).toBe(5);
    expect(s.cod).toBe(false);
  });

  it("treats no couriers, or only blocked ones, as not serviceable", () => {
    expect(summariseCouriers([]).serviceable).toBe(false);
    expect(summariseCouriers([{ courier_name: "X", blocked: 1, cod: 1 }]).serviceable).toBe(false);
  });
});

describe("delivery range", () => {
  it("adds our 1–2 day dispatch and a day's margin to the courier's days", () => {
    expect(courierDeliveryRange(4)).toEqual({ min: 5, max: 7 });
  });
});

describe("shiprocketOrderPayload", () => {
  const order = {
    orderNumber: "HT-ABC123",
    createdAt: new Date("2026-11-10T18:45:00Z"),
    confirmedAt: new Date("2026-11-10T18:46:00Z"),
    customerName: "Priya  Rani Sharma",
    phone: "9812345670",
    email: null,
    address1: "Flat 12, Shanti Apartments",
    address2: "MG Road",
    landmark: "City Hospital",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    paymentMethod: "cod",
    subtotal: 109_800,
    discount: 10_000,
    shippingFee: 0,
    codFee: 4_900,
    total: 104_700,
    items: [{ packId: "pack-25", sku: "HT-SPONGE-25", name: "Home Pack", packCount: 25, qty: 2, unitPrice: 54_900 }],
  } as unknown as OrderWithItems;

  const payload = shiprocketOrderPayload(order, {
    pickupLocation: "warehouse",
    weightGramsByPack: new Map([["pack-25", 350]]),
    fallbackEmail: "support@hellotidy.in",
  });

  it("charges the customer exactly our order total", () => {
    const srTotal =
      payload.sub_total + payload.shipping_charges + payload.transaction_charges - payload.total_discount;
    expect(srTotal).toBeCloseTo(order.total / 100, 2);
    const itemsTotal = payload.order_items.reduce((s, i) => s + i.selling_price * i.units, 0);
    expect(itemsTotal).toBeCloseTo(payload.sub_total, 2);
  });

  it("maps the customer, address and payment mode", () => {
    expect(payload).toMatchObject({
      order_id: "HT-ABC123",
      order_date: "2026-11-11 00:16",
      pickup_location: "warehouse",
      billing_customer_name: "Priya",
      billing_last_name: "Rani Sharma",
      billing_address_2: "MG Road, Near City Hospital",
      billing_email: "support@hellotidy.in",
      billing_phone: "9812345670",
      payment_method: "COD",
      weight: 0.7,
    });
  });
});

describe("shiprocketDate", () => {
  it("formats in India time", () => {
    expect(shiprocketDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01 05:30");
  });
});

describe("Shiprocket login safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function client(responder: (url: string) => Response) {
    vi.resetModules();
    vi.doMock("next/cache", () => ({ cacheLife: () => undefined }));
    for (const [k, v] of Object.entries({
      SHIPROCKET_EMAIL: "api@example.com",
      SHIPROCKET_PASSWORD: "secret",
      SHIPROCKET_PICKUP_PINCODE: "395004",
    }))
      vi.stubEnv(k, v);
    const fetchMock = vi.fn(async (url: string | URL) => responder(String(url)));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/shipping/shiprocket");
    const logins = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("/auth/login")).length;
    return { ...mod, logins };
  }

  it("tries a refused login once, then pauses instead of getting the account locked", async () => {
    const { checkServiceability, logins } = await client(
      () => new Response(JSON.stringify({ message: "Invalid email and password combination" }), { status: 400 }),
    );
    for (const pin of ["411001", "560038", "110001", "400001"]) expect(await checkServiceability(pin)).toBeNull();
    expect(logins()).toBe(1);
  });

  it("reads a 404 as 'no courier serves this pincode'", async () => {
    const { checkServiceability } = await client((url) =>
      url.includes("/auth/login")
        ? new Response(JSON.stringify({ token: "t" }), { status: 200 })
        : new Response(JSON.stringify({ message: "Delivery postcode not serviceable" }), { status: 404 }),
    );
    expect(await checkServiceability("744101")).toMatchObject({ serviceable: false, cod: false });
  });
});

describe("shiprocketConfig", () => {
  afterEach(() => vi.unstubAllEnvs());
  const base = {
    SHIPROCKET_EMAIL: "api@example.com",
    SHIPROCKET_PASSWORD: "secret",
    SHIPROCKET_PICKUP_PINCODE: "395004",
    SHIPROCKET_PICKUP_LOCATION: "warehouse",
  };

  async function load(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries({ ...base, VERCEL_ENV: "", SHIPROCKET_SYNC_ORDERS: "", ...env })) vi.stubEnv(k, v);
    return (await import("@/lib/env")).shiprocketConfig();
  }

  it("pushes orders automatically only on the live site", async () => {
    expect((await load({}))?.syncOrders).toBe(false);
    expect((await load({ VERCEL_ENV: "preview" }))?.syncOrders).toBe(false);
    expect((await load({ VERCEL_ENV: "production" }))?.syncOrders).toBe(true);
    expect((await load({ VERCEL_ENV: "production", SHIPROCKET_SYNC_ORDERS: "0" }))?.syncOrders).toBe(false);
    expect((await load({ SHIPROCKET_SYNC_ORDERS: "1" }))?.syncOrders).toBe(true);
  });

  it("is off without a valid pickup pincode", async () => {
    expect(await load({ SHIPROCKET_PICKUP_PINCODE: "12345" })).toBeNull();
  });
});
