import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { createDiscount } from "@/lib/discounts/admin";
import {
  bulkOrderAction,
  getOrderDetail,
  listAbandonedCheckouts,
  recordRefund,
  updateOrderStatus,
} from "@/lib/orders/admin";
import { attachRazorpayOrder, getOrderById, markOrderPaid, placeOrder, switchOrderToCod } from "@/lib/orders/service";
import { handleWebhookPayment } from "@/lib/payments/flow";
import type { RazorpayPayment } from "@/lib/payments/razorpay";
import { checkout, ctx, randomPhone, testPack } from "./helpers";

/**
 * Regression tests for the issues found by the independent review of the
 * admin panel (see docs/DECISIONS.md §17, "Review").
 */

beforeEach(() => {
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function unpaidOnline(overrides: Partial<Record<string, unknown>> = {}) {
  const { order } = await placeOrder(checkout({ paymentMethod: "prepaid", ...overrides }), ctx);
  const rzp = `order_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  await attachRazorpayOrder(order.id, rzp);
  return { order: (await getOrderById(order.id))!, rzp };
}

describe("a stale page can't change an order that moved on", () => {
  it("refuses to cancel a checkout that was paid while the Cancel form was open", async () => {
    const pack = await testPack({ trackInventory: true, stock: 5 });
    const { order } = await unpaidOnline({ lines: [{ packId: pack.id, qty: 2 }] });
    await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_stale",
      amountPaise: order.total,
      actor: "razorpay",
    });
    await expect(
      updateOrderStatus(order.id, "cancelled", "staff@test", {
        from: "pending_payment",
        reason: "Payment not completed",
      }),
    ).rejects.toThrow(/changed while you were looking/);
    expect((await getOrderById(order.id))?.status).toBe("confirmed");

    const bulk = await bulkOrderAction([order.id], "cancel_unpaid", "staff@test");
    expect(bulk.done).toBe(0);
  });
});

describe("discount limits hold when an unpaid order goes through later", () => {
  it("re-checks a once-per-customer code on the switch to COD, and alerts when an online payment exceeds it", async () => {
    const code = `ONCE${randomUUID().slice(0, 6).toUpperCase()}`;
    await createDiscount(
      {
        code,
        description: "Once",
        type: "flat",
        value: 5000,
        minOrder: 0,
        maxDiscount: null,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        oncePerCustomer: true,
        active: true,
      },
      "owner@test",
    );
    const phone = randomPhone();
    // Two open online checkouts with the same code: neither counts as a use yet.
    const a = await unpaidOnline({ phone, couponCode: code });
    const b = await unpaidOnline({ phone, couponCode: code });
    const c = await unpaidOnline({ phone, couponCode: code });

    expect((await switchOrderToCod(a.order.id, "customer")).switched).toBe(true);
    await expect(switchOrderToCod(b.order.id, "customer")).rejects.toThrow(/can't switch to Cash on Delivery/);
    expect((await getOrderById(b.order.id))?.status).toBe("pending_payment");

    const paid = await markOrderPaid({
      orderId: c.order.id,
      razorpayPaymentId: "pay_over",
      amountPaise: c.order.total,
      actor: "razorpay",
    });
    expect(paid?.order.status).toBe("confirmed"); // the money is in: the order stands…
    expect(paid?.stock.alerts.join()).toMatch(/over its limit/); // …and the owner is told
  });
});

describe("a refunded order stays refunded", () => {
  it("ignores a replayed payment and flags a new one as a duplicate", async () => {
    const { order, rzp } = await unpaidOnline();
    await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_first",
      amountPaise: order.total,
      actor: "customer",
    });
    await recordRefund(order.id, { amount: order.total, reason: "Customer returned it" }, "owner@test");
    const refunded = (await getOrderById(order.id))!;
    expect(refunded.paymentStatus).toBe("refunded");

    // Razorpay retries the original captured webhook.
    expect(
      await markOrderPaid({
        orderId: order.id,
        razorpayPaymentId: "pay_first",
        amountPaise: order.total,
        actor: "razorpay",
      }),
    ).toBeNull();
    expect((await getOrderById(order.id))?.paymentStatus).toBe("refunded");

    // A brand-new payment on the refunded order is a duplicate to refund, not a new sale.
    const second: RazorpayPayment = {
      id: "pay_second",
      order_id: rzp,
      amount: order.total,
      currency: "INR",
      status: "captured",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(second)),
    );
    const { paid, alert } = await handleWebhookPayment(refunded, second);
    expect(paid).toBeNull();
    expect(alert).toMatch(/Refund it/);
  });
});

describe("abandoned checkouts", () => {
  it("leave out customers who went on to place an order", async () => {
    const phone = randomPhone();
    const { order: abandoned } = await unpaidOnline({ phone });
    const db = await getDb();
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(orders.id, abandoned.id));
    expect((await listAbandonedCheckouts()).rows.map((r) => r.id)).toContain(abandoned.id);

    const { order: later } = await placeOrder(checkout({ phone }), ctx); // COD, goes through
    expect((await listAbandonedCheckouts()).rows.map((r) => r.id)).not.toContain(abandoned.id);
    expect((await getOrderDetail(abandoned.id))?.laterOrder?.orderNumber).toBe(later.orderNumber);
  });
});
