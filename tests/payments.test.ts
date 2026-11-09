import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED } from "./helpers";
import { attachRazorpayOrder, getOrderById, placeOrder, switchOrderToCod } from "@/lib/orders/service";
import { handleWebhookPayment, switchToCodSafely, verifyCheckoutPayment } from "@/lib/payments/flow";
import type { RazorpayPayment } from "@/lib/payments/razorpay";
import { hmacSha256Hex } from "@/lib/security/crypto";
import { isRateLimited, rateLimit } from "@/lib/security/rate-limit";
import { checkoutSchema } from "@/lib/validation";

/** A fake Razorpay API: payments keyed by id, listed per Razorpay order. */
const payments = new Map<string, RazorpayPayment>();

function fakeRazorpay(url: string, init?: RequestInit): Response {
  const path = new URL(url).pathname.replace("/v1", "");
  const capture = path.match(/^\/payments\/(pay_\w+)\/capture$/);
  if (capture && init?.method === "POST") {
    const p = payments.get(capture[1])!;
    p.status = "captured";
    return Response.json(p);
  }
  const one = path.match(/^\/payments\/(pay_\w+)$/);
  if (one) return Response.json(payments.get(one[1]));
  const list = path.match(/^\/orders\/(order_\w+)\/payments$/);
  if (list) return Response.json({ items: [...payments.values()].filter((p) => p.order_id === list[1]) });
  return Response.json({ error: { description: `unexpected ${path}` } }, { status: 404 });
}

async function unpaidOnlineOrder() {
  const data = checkoutSchema.parse({
    checkoutId: randomUUID(),
    lines: [{ packId: "pack-25", qty: 1 }],
    paymentMethod: "prepaid",
    name: "Asha Rao",
    phone: "9811122233",
    address1: "12 Lake View Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
  });
  const { order } = await placeOrder(data, { ip: "203.0.113.9", userAgent: "vitest" });
  const rzpOrderId = `order_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  await attachRazorpayOrder(order.id, rzpOrderId);
  return { order: (await getOrderById(order.id))!, rzpOrderId };
}

function addPayment(orderId: string, amount: number, status: RazorpayPayment["status"]): RazorpayPayment {
  const p: RazorpayPayment = {
    id: `pay_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    order_id: orderId,
    amount,
    currency: "INR",
    status,
  };
  payments.set(p.id, p);
  return p;
}

beforeEach(() => {
  payments.clear();
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => fakeRazorpay(url, init)),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("switching to COD safely", () => {
  it("switches when no payment is in flight", async () => {
    const { order } = await unpaidOnlineOrder();
    const result = await switchToCodSafely(order, "customer");
    expect(result.outcome).toBe("switched");
    expect(result.order.paymentMethod).toBe("cod");
  });

  it("confirms as prepaid instead when the UPI payment already went through", async () => {
    const { order, rzpOrderId } = await unpaidOnlineOrder();
    addPayment(rzpOrderId, order.total, "authorized");
    const result = await switchToCodSafely(order, "customer");
    expect(result.outcome).toBe("paid_online");
    const after = await getOrderById(order.id);
    expect(after?.paymentMethod).toBe("prepaid");
    expect(after?.paymentStatus).toBe("paid");
    expect(after?.codFee).toBe(0);
  });
});

describe("webhook payments", () => {
  it("reverts a late payment on a COD-switched order to prepaid (no double charge)", async () => {
    const { order, rzpOrderId } = await unpaidOnlineOrder();
    await switchOrderToCod(order.id, "customer");
    const switched = (await getOrderById(order.id))!;
    expect(switched.total).toBe(order.total + SEED.codFee);

    const late = addPayment(rzpOrderId, order.total, "captured");
    const { paid, alert } = await handleWebhookPayment(switched, late);
    expect(alert).toBeNull();
    expect(paid?.outcome).toBe("reverted_from_cod");
    expect(paid?.order.total).toBe(order.total);
    expect(paid?.order.paymentMethod).toBe("prepaid");
  });

  it("alerts the owner about a second payment on a paid order", async () => {
    const { order, rzpOrderId } = await unpaidOnlineOrder();
    const first = addPayment(rzpOrderId, order.total, "captured");
    await handleWebhookPayment(order, first);
    const paidOrder = (await getOrderById(order.id))!;

    const second = addPayment(rzpOrderId, order.total, "captured");
    const { paid, alert } = await handleWebhookPayment(paidOrder, second);
    expect(paid).toBeNull();
    expect(alert).toMatch(/Refund it/);
  });

  it("refuses a payment whose amount doesn't match", async () => {
    const { order, rzpOrderId } = await unpaidOnlineOrder();
    const odd = addPayment(rzpOrderId, 100, "captured");
    const { paid, alert } = await handleWebhookPayment(order, odd);
    expect(paid).toBeNull();
    expect(alert).toMatch(/doesn't match/);
    expect((await getOrderById(order.id))?.paymentStatus).toBe("unpaid");
  });
});

describe("checkout callback", () => {
  it("captures and confirms a verified payment", async () => {
    const { order, rzpOrderId } = await unpaidOnlineOrder();
    const p = addPayment(rzpOrderId, order.total, "authorized");
    const result = await verifyCheckoutPayment(order, {
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: p.id,
      razorpaySignature: hmacSha256Hex("secret_abc", `${rzpOrderId}|${p.id}`),
    });
    expect(result.ok && result.paid?.outcome).toBe("confirmed");
    expect(payments.get(p.id)?.status).toBe("captured");
  });

  it("rejects a forged signature", async () => {
    const { order, rzpOrderId } = await unpaidOnlineOrder();
    const p = addPayment(rzpOrderId, order.total, "captured");
    const result = await verifyCheckoutPayment(order, {
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: p.id,
      razorpaySignature: "0".repeat(64),
    });
    expect(result.ok).toBe(false);
  });
});

describe("login lockout protection", () => {
  it("only blocks once failures reach the limit", async () => {
    const key = `login-fail:${randomUUID()}`;
    expect(await isRateLimited(key, 2, 900)).toBe(false);
    await rateLimit(key, 2, 900);
    expect(await isRateLimited(key, 2, 900)).toBe(false);
    await rateLimit(key, 2, 900);
    expect(await isRateLimited(key, 2, 900)).toBe(true);
  });
});
