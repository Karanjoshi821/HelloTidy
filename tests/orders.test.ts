import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orderEvents } from "@/lib/db/schema";
import { getHomeStats, listOrders, recordRefund, updateOrderStatus } from "@/lib/orders/admin";
import {
  attachRazorpayOrder,
  getOrderByRazorpayOrderId,
  getOrderByToken,
  markOrderPaid,
  OrderError,
  placeOrder,
  prepaidAmount,
  PriceChangedError,
  switchOrderToCod,
  trackOrder,
} from "@/lib/orders/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { checkout, ctx, randomPhone, SEED } from "./helpers";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("placing orders", () => {
  it("creates a confirmed COD order with database prices, items, a customer and an event", async () => {
    const data = checkout();
    const { order, created } = await placeOrder(data, ctx);
    expect(created).toBe(true);
    expect(order.status).toBe("confirmed");
    expect(order.paymentMethod).toBe("cod");
    expect(order.total).toBe(SEED.pack25.price + SEED.codFee);
    expect(order.orderNumber).toMatch(/^HT-/);
    expect(order.publicToken.length).toBeGreaterThanOrEqual(30);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].sku).toBe("HT-SPONGE-25");
    expect(order.source).toBe("web");
    expect(order.attribution?.utmCampaign).toBe("launch");
    expect(order.fbp).toBe(ctx.fbp);

    const db = await getDb();
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id));
    expect(events.map((e) => e.type)).toEqual(["created"]);
    const [customer] = await db.select().from(customers).where(eq(customers.phone, data.phone));
    expect(order.customerId).toBe(customer.id);
    expect(customer.name).toBe("Priya Sharma");
  });

  it("is idempotent for the same checkout id", async () => {
    const data = checkout();
    const first = await placeOrder(data, ctx);
    const second = await placeOrder(data, ctx);
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
  });

  it("reuses the customer for the same phone and keeps the first name", async () => {
    const phone = randomPhone();
    const a = await placeOrder(checkout({ phone, name: "Asha Rao" }), ctx);
    const b = await placeOrder(checkout({ phone, name: "Asha R", email: "asha@example.com" }), ctx);
    expect(b.order.customerId).toBe(a.order.customerId);
    const db = await getDb();
    const [customer] = await db.select().from(customers).where(eq(customers.phone, phone));
    expect(customer.name).toBe("Asha Rao");
    expect(customer.email).toBe("asha@example.com");
  });

  it("refuses the order when the total the customer saw differs (prices changed)", async () => {
    await expect(placeOrder(checkout({ expectedTotal: 100 }), ctx)).rejects.toBeInstanceOf(PriceChangedError);
    const ok = await placeOrder(checkout({ expectedTotal: SEED.pack25.price + SEED.codFee }), ctx);
    expect(ok.created).toBe(true);
  });

  it("refuses prepaid when Razorpay isn't configured", async () => {
    await expect(placeOrder(checkout({ paymentMethod: "prepaid" }), ctx)).rejects.toBeInstanceOf(OrderError);
  });

  it("refuses unknown or inactive coupons", async () => {
    await expect(placeOrder(checkout({ couponCode: "FREEMONEY" }), ctx)).rejects.toThrow(/not valid/);
    // Seeded but disabled.
    await expect(placeOrder(checkout({ couponCode: "hello50" }), ctx)).rejects.toThrow(/not valid/);
  });

  it("refuses COD above the COD cap", async () => {
    await expect(placeOrder(checkout({ lines: [{ packId: "pack-50", qty: 5 }] }), ctx)).rejects.toThrow(
      /Cash on Delivery/,
    );
  });

  it("refuses COD for a blocked number but still takes online payment", async () => {
    const phone = randomPhone();
    await placeOrder(checkout({ phone }), ctx);
    const db = await getDb();
    await db.update(customers).set({ codBlocked: true }).where(eq(customers.phone, phone));
    await expect(placeOrder(checkout({ phone }), ctx)).rejects.toThrow(/isn't available for this mobile number/);

    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
    const prepaid = await placeOrder(checkout({ phone, paymentMethod: "prepaid" }), ctx);
    expect(prepaid.order.status).toBe("pending_payment");
    // ...and the unpaid order can't be switched to COD either.
    await expect(switchOrderToCod(prepaid.order.id, "customer")).rejects.toThrow(/isn't available/);
  });
});

describe("prepaid flow", () => {
  async function prepaidOrder() {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
    const { order } = await placeOrder(checkout({ paymentMethod: "prepaid" }), ctx);
    const rzpId = `order_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    await attachRazorpayOrder(order.id, rzpId);
    return { order, rzpId };
  }

  it("starts as pending payment, then is marked paid exactly once", async () => {
    const { order, rzpId } = await prepaidOrder();
    expect(order.status).toBe("pending_payment");
    expect(order.codFee).toBe(0);
    expect((await getOrderByRazorpayOrderId(rzpId))?.id).toBe(order.id);

    const paid = await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_abc",
      amountPaise: order.total,
      actor: "customer",
    });
    expect(paid?.outcome).toBe("confirmed");
    expect(paid?.order.status).toBe("confirmed");
    expect(paid?.order.paymentStatus).toBe("paid");
    expect(paid?.order.confirmedAt).toBeInstanceOf(Date);

    // A webhook arriving afterwards must not notify again.
    expect(
      await markOrderPaid({
        orderId: order.id,
        razorpayPaymentId: "pay_abc",
        amountPaise: order.total,
        actor: "razorpay",
      }),
    ).toBeNull();
  });

  it("keeps the first Razorpay order when two payment starts race", async () => {
    const { order, rzpId } = await prepaidOrder();
    expect(await attachRazorpayOrder(order.id, "order_secondAttempt")).toBe(rzpId);
  });

  it("lets an unpaid order switch to COD and adds the store's COD fee", async () => {
    const { order } = await prepaidOrder();
    const { order: switched, switched: changed } = await switchOrderToCod(order.id, "customer");
    expect(changed).toBe(true);
    expect(switched.paymentMethod).toBe("cod");
    expect(switched.status).toBe("confirmed");
    expect(switched.total).toBe(order.total + SEED.codFee);
    expect(prepaidAmount(switched)).toBe(order.total);

    // Switching again is a no-op.
    expect((await switchOrderToCod(order.id, "customer")).switched).toBe(false);
  });

  it("reverts a COD switch to prepaid when the online payment lands late", async () => {
    const { order } = await prepaidOrder();
    await switchOrderToCod(order.id, "customer");
    const paid = await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_late",
      amountPaise: order.total,
      actor: "razorpay",
    });
    expect(paid?.outcome).toBe("reverted_from_cod");
    expect(paid?.order.paymentMethod).toBe("prepaid");
    expect(paid?.order.codFee).toBe(0);
    expect(paid?.order.total).toBe(order.total);
  });

  it("flags money received for a cancelled order", async () => {
    const { order } = await prepaidOrder();
    await updateOrderStatus(order.id, "cancelled", "owner@test");
    const paid = await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_c",
      amountPaise: order.total,
      actor: "razorpay",
    });
    expect(paid?.outcome).toBe("paid_after_cancel");
    expect(paid?.order.status).toBe("cancelled");
  });

  it("does not switch a paid order to COD", async () => {
    const { order } = await prepaidOrder();
    await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_x", amountPaise: order.total, actor: "customer" });
    const { order: after, switched } = await switchOrderToCod(order.id, "customer");
    expect(switched).toBe(false);
    expect(after.paymentMethod).toBe("prepaid");
  });

  it("won't let an admin confirm an unpaid online order without payment", async () => {
    const { order } = await prepaidOrder();
    await expect(updateOrderStatus(order.id, "confirmed", "owner@test")).rejects.toBeInstanceOf(OrderError);
  });
});

describe("lookups", () => {
  it("finds an order by token and rejects malformed tokens", async () => {
    const { order } = await placeOrder(checkout(), ctx);
    expect((await getOrderByToken(order.publicToken))?.id).toBe(order.id);
    expect(await getOrderByToken("'; drop table orders; --")).toBeNull();
  });

  it("tracks only with the matching phone number", async () => {
    const data = checkout();
    const { order } = await placeOrder(data, ctx);
    expect((await trackOrder(order.orderNumber, data.phone))?.status).toBe("confirmed");
    expect(await trackOrder(order.orderNumber, "9999999999")).toBeNull();
  });
});

describe("admin operations", () => {
  it("follows allowed status transitions and collects COD on delivery", async () => {
    const { order } = await placeOrder(checkout(), ctx);
    await updateOrderStatus(order.id, "processing", "owner@test");
    await updateOrderStatus(order.id, "shipped", "owner@test");
    await expect(updateOrderStatus(order.id, "confirmed", "owner@test")).rejects.toBeInstanceOf(OrderError);
    await updateOrderStatus(order.id, "delivered", "owner@test");

    const after = await getOrderByToken(order.publicToken);
    expect(after?.status).toBe("delivered");
    expect(after?.paymentStatus).toBe("paid");
    expect(after?.deliveredAt).toBeInstanceOf(Date);
    await expect(updateOrderStatus(order.id, "cancelled", "owner@test")).rejects.toBeInstanceOf(OrderError);
  });

  it("won't record a refund on an order that hasn't been paid", async () => {
    const { order } = await placeOrder(checkout(), ctx);
    await expect(recordRefund(order.id, { amount: 100, reason: "test" }, "owner@test")).rejects.toBeInstanceOf(
      OrderError,
    );
  });

  it("lists, searches and summarises orders", async () => {
    const phone = randomPhone();
    const { order } = await placeOrder(checkout({ name: "Searchable Person", phone }), ctx);
    const byNumber = await listOrders({ q: order.orderNumber });
    expect(byNumber.rows.map((r) => r.id)).toContain(order.id);
    expect(byNumber.rows.find((r) => r.id === order.id)?.items).toBe(1);
    const byPhone = await listOrders({ q: `${phone.slice(0, 5)} ${phone.slice(5)}` });
    expect(byPhone.rows.map((r) => r.id)).toContain(order.id);
    const byStatus = await listOrders({ status: "confirmed" });
    expect(byStatus.rows.every((r) => r.status === "confirmed")).toBe(true);
    // LIKE wildcards in the search box are treated literally.
    expect((await listOrders({ q: "%" })).total).toBe(0);

    const stats = await getHomeStats();
    expect(stats.today.orders).toBeGreaterThan(0);
    expect(stats.recent.length).toBeGreaterThan(0);
    expect(stats.series).toHaveLength(14);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit within a window", async () => {
    const key = `test:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
  });
});
