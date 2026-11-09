"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { applyStockEffect, expireStorefront } from "@/lib/catalog/invalidate";
import { findDiscountForPreview } from "@/lib/discounts/service";
import { notifyOrderConfirmed, notifyPaid } from "@/lib/notify";
import { checkOrderStock, getOrderByToken, OrderError, placeOrder, PriceChangedError } from "@/lib/orders/service";
import {
  ensureRazorpayOrder,
  switchToCodSafely,
  verifyCheckoutPayment,
  type CheckoutPaymentOptions,
} from "@/lib/payments/flow";
import { RazorpayError } from "@/lib/payments/razorpay";
import type { Coupon } from "@/lib/pricing";
import { isRecoveryEnabled } from "@/lib/env";
import { saveCartLead, sendCartLeadWebhook, withdrawCartLead } from "@/lib/recovery/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";
import { cartLeadSchema, checkoutSchema, fieldErrors, type CartLeadInput, type CheckoutInput } from "@/lib/validation";

type OrderRef = { orderToken: string; orderNumber: string; total: number };

export type PlaceOrderResult =
  | ({ ok: true; payment: CheckoutPaymentOptions | null } & OrderRef)
  /**
   * `order` is set when the order was saved but online payment couldn't start.
   * `priceChanged` means the catalogue changed under the customer: reload prices and ask again.
   */
  | { ok: false; error: string; fieldErrors?: Record<string, string>; order?: OrderRef; priceChanged?: boolean };

const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";
const PAYMENT_START_ERROR = "We couldn't start the online payment. Please try again, or choose Cash on Delivery.";

export async function placeOrderAction(input: CheckoutInput): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  const ctx = await getRequestContext();
  const limit = await rateLimit(`checkout:${ctx.ipHash}`, 10, 600);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };

  let ref: OrderRef | undefined;
  try {
    const jar = await cookies();
    const { order, created, stock } = await placeOrder(parsed.data, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      fbp: jar.get("_fbp")?.value,
      fbc: jar.get("_fbc")?.value,
    });
    applyStockEffect(stock);
    ref = { orderToken: order.publicToken, orderNumber: order.orderNumber, total: order.total };

    if (order.paymentMethod === "cod") {
      if (created) after(() => notifyOrderConfirmed(order));
      return { ok: true, ...ref, payment: null };
    }
    if (order.paymentStatus === "paid" || order.status !== "pending_payment")
      return { ok: true, ...ref, payment: null };
    return { ok: true, ...ref, payment: await ensureRazorpayOrder(order) };
  } catch (error) {
    if (error instanceof PriceChangedError) {
      // The customer saw an old price, so the cached pages are stale: refresh them before the client reloads.
      expireStorefront();
      return { ok: false, error: error.message, priceChanged: true };
    }
    if (error instanceof OrderError) return { ok: false, error: error.message };
    if (error instanceof RazorpayError) {
      console.error("[checkout] Razorpay:", error.message);
      // The order is saved: hand it back so the customer can retry or switch to COD on it.
      return { ok: false, error: PAYMENT_START_ERROR, order: ref };
    }
    console.error("[checkout] placeOrder failed:", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

const confirmSchema = z.object({
  orderToken: tokenSchema,
  razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function confirmPaymentAction(
  input: z.input<typeof confirmSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment response." };

  const ctx = await getRequestContext();
  const limit = await rateLimit(`confirm:${ctx.ipHash}`, 20, 600);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  try {
    const order = await getOrderByToken(parsed.data.orderToken);
    if (!order) return { ok: false, error: "Order not found." };
    const result = await verifyCheckoutPayment(order, parsed.data);
    if (!result.ok) return result;
    const paid = result.paid;
    if (paid) {
      applyStockEffect(paid.stock);
      after(() => notifyPaid(paid));
    }
    return { ok: true };
  } catch (error) {
    console.error("[checkout] confirmPayment failed:", error);
    return {
      ok: false,
      error: "We couldn't confirm your payment yet. If money was debited, your order will be confirmed automatically.",
    };
  }
}

export async function retryPaymentAction(
  orderToken: string,
): Promise<{ ok: true; payment: CheckoutPaymentOptions } | { ok: false; error: string }> {
  if (!tokenSchema.safeParse(orderToken).success) return { ok: false, error: "Order not found." };
  const ctx = await getRequestContext();
  const limit = await rateLimit(`retry:${ctx.ipHash}`, 20, 600);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  try {
    const order = await getOrderByToken(orderToken);
    if (!order || order.status !== "pending_payment" || order.paymentStatus === "paid") {
      return { ok: false, error: "This order no longer needs payment." };
    }
    await checkOrderStock(order);
    return { ok: true, payment: await ensureRazorpayOrder(order) };
  } catch (error) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    console.error("[checkout] retryPayment failed:", error);
    return { ok: false, error: PAYMENT_START_ERROR };
  }
}

export async function switchToCodAction(
  orderToken: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  if (!tokenSchema.safeParse(orderToken).success) return { ok: false, error: "Order not found." };
  const ctx = await getRequestContext();
  const limit = await rateLimit(`cod:${ctx.ipHash}`, 10, 600);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  try {
    const order = await getOrderByToken(orderToken);
    if (!order) return { ok: false, error: "Order not found." };
    const result = await switchToCodSafely(order, "customer");
    if (result.outcome === "switched") {
      applyStockEffect(result.stock);
      after(() => notifyOrderConfirmed(result.order));
    }
    if (result.outcome === "paid_online" && result.paid) {
      const paid = result.paid;
      applyStockEffect(paid.stock);
      after(() => notifyPaid(paid));
    }
    return { ok: true, total: result.order.total };
  } catch (error) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    if (error instanceof RazorpayError) {
      console.error("[checkout] switchToCod payment check:", error.message);
      return { ok: false, error: "We couldn't check your payment status. Please try again in a minute." };
    }
    console.error("[checkout] switchToCod failed:", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Saves the cart for a recovery call once the customer has typed their name and
 * mobile number and ticked the call consent. Quiet by design: the checkout
 * never waits on it or shows its errors.
 */
export async function saveCartLeadAction(input: CartLeadInput): Promise<{ ok: boolean }> {
  if (!isRecoveryEnabled()) return { ok: false };
  const parsed = cartLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const ctx = await getRequestContext();
  const limit = await rateLimit(`cartlead:${ctx.ipHash}`, 30, 600);
  if (!limit.ok) return { ok: false };

  try {
    const { lead, shouldNotify } = await saveCartLead(parsed.data);
    if (lead && shouldNotify) {
      after(() => sendCartLeadWebhook(lead).catch((error) => console.error("[recovery] webhook failed:", error)));
    }
    return { ok: lead !== null };
  } catch (error) {
    console.error("[recovery] saveCartLead failed:", error);
    return { ok: false };
  }
}

/** The customer unticked the call consent. */
export async function withdrawCartLeadAction(clientKey: string): Promise<{ ok: boolean }> {
  if (!isRecoveryEnabled() || !z.uuid().safeParse(clientKey).success) return { ok: false };
  const ctx = await getRequestContext();
  const limit = await rateLimit(`cartlead:${ctx.ipHash}`, 30, 600);
  if (!limit.ok) return { ok: false };
  await withdrawCartLead(clientKey);
  return { ok: true };
}

export async function applyCouponAction(
  code: string,
): Promise<{ ok: true; coupon: Coupon } | { ok: false; error: string }> {
  const parsed = z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]+$/)
    .safeParse(code);
  if (!parsed.success) return { ok: false, error: "This coupon code is not valid." };

  const ctx = await getRequestContext();
  // Tight limit: stops anyone from guessing codes by brute force.
  const limit = await rateLimit(`coupon:${ctx.ipHash}`, 10, 600);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  return findDiscountForPreview(parsed.data);
}
