import "server-only";
import { razorpayConfig } from "../env";
import { hmacSha256Hex, safeEqual } from "../security/crypto";

/**
 * Razorpay over its REST API (https://razorpay.com/docs/api/).
 * Flow: create an order server-side → Checkout.js collects payment →
 * verify the signature → re-fetch the payment to confirm amount and status.
 * The webhook is a backup for customers who close the tab after paying.
 */

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {}

function config() {
  const cfg = razorpayConfig();
  if (!cfg) throw new RazorpayError("Online payments are not configured.");
  return cfg;
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const { keyId, keySecret } = config();
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) {
    throw new RazorpayError(data.error?.description ?? `Razorpay request failed (${res.status})`);
  }
  return data;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

export type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
};

export function isRazorpayEnabled(): boolean {
  return razorpayConfig() !== null;
}

export function publicKeyId(): string | null {
  return razorpayConfig()?.keyId ?? null;
}

export function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("/orders", {
    method: "POST",
    body: { amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes },
  });
}

export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new RazorpayError("Invalid payment id");
  return call<RazorpayPayment>(`/payments/${paymentId}`, { method: "GET" });
}

/** All payment attempts made against one Razorpay order. */
export async function fetchOrderPayments(razorpayOrderId: string): Promise<RazorpayPayment[]> {
  if (!/^order_[A-Za-z0-9]+$/.test(razorpayOrderId)) throw new RazorpayError("Invalid order id");
  const data = await call<{ items?: RazorpayPayment[] }>(`/orders/${razorpayOrderId}/payments`, { method: "GET" });
  return data.items ?? [];
}

export function capturePayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  return call<RazorpayPayment>(`/payments/${paymentId}/capture`, {
    method: "POST",
    body: { amount: amountPaise, currency: "INR" },
  });
}

/** Checkout.js handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
  const { keySecret } = config();
  const expected = hmacSha256Hex(keySecret, `${input.orderId}|${input.paymentId}`);
  return safeEqual(expected, input.signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = config().webhookSecret;
  if (!secret || !signature) return false;
  return safeEqual(hmacSha256Hex(secret, rawBody), signature);
}
