import "server-only";
import { siteConfig } from "@/config/site";
import {
  attachRazorpayOrder,
  markOrderPaid,
  OrderError,
  prepaidAmount,
  recordOrderEvent,
  switchOrderToCod,
  type PaidResult,
} from "../orders/service";
import type { StockEffect } from "../catalog/inventory";
import type { OrderWithItems } from "../notify/types";
import {
  capturePayment,
  createRazorpayOrder,
  fetchOrderPayments,
  fetchPayment,
  isRazorpayEnabled,
  publicKeyId,
  RazorpayError,
  verifyCheckoutSignature,
  type RazorpayPayment,
} from "./razorpay";

/** Everything the browser needs to open Razorpay Checkout. No secrets. */
export type CheckoutPaymentOptions = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  prefill: { name: string; contact: string; email?: string };
};

export async function ensureRazorpayOrder(order: OrderWithItems): Promise<CheckoutPaymentOptions> {
  const keyId = publicKeyId();
  if (!keyId) throw new RazorpayError("Online payments are not configured.");
  const amount = prepaidAmount(order);

  let razorpayOrderId = order.razorpayOrderId;
  if (!razorpayOrderId) {
    const created = await createRazorpayOrder({
      amountPaise: amount,
      receipt: order.orderNumber,
      notes: { order_number: order.orderNumber, order_id: order.id },
    });
    if (created.amount !== amount) throw new RazorpayError("Amount mismatch creating payment.");
    // If another tab created one first, use the stored one so both pay the same order.
    razorpayOrderId = await attachRazorpayOrder(order.id, created.id);
  }

  return {
    keyId,
    razorpayOrderId,
    amount,
    currency: "INR",
    name: siteConfig.name,
    description: `Order ${order.orderNumber}`,
    prefill: { name: order.customerName, contact: `+91${order.phone}`, ...(order.email ? { email: order.email } : {}) },
  };
}

/** Captures an authorized payment, tolerating a concurrent capture by the webhook or checkout. */
async function ensureCaptured(payment: RazorpayPayment): Promise<RazorpayPayment> {
  if (payment.status !== "authorized") return payment;
  try {
    return await capturePayment(payment.id, payment.amount);
  } catch (error) {
    const fresh = await fetchPayment(payment.id);
    if (fresh.status !== "captured") throw error;
    return fresh;
  }
}

/** True if this payment is for this order's Razorpay order and the expected online amount. */
function paymentMatches(order: OrderWithItems, payment: RazorpayPayment): boolean {
  return (
    payment.order_id === order.razorpayOrderId && payment.amount === prepaidAmount(order) && payment.currency === "INR"
  );
}

export type VerifyResult = { ok: true; paid: PaidResult | null } | { ok: false; error: string };

/**
 * Verifies a Checkout.js success callback, then confirms with Razorpay's API
 * that the payment really is for this order and amount before marking it paid.
 */
export async function verifyCheckoutPayment(
  order: OrderWithItems,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<VerifyResult> {
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") return { ok: true, paid: null };
  if (!order.razorpayOrderId || order.razorpayOrderId !== input.razorpayOrderId) {
    return { ok: false, error: "This payment does not belong to this order." };
  }
  if (
    !verifyCheckoutSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    })
  ) {
    return { ok: false, error: "We could not verify this payment." };
  }

  let payment = await fetchPayment(input.razorpayPaymentId);
  if (!paymentMatches(order, payment)) return { ok: false, error: "Payment details do not match this order." };
  payment = await ensureCaptured(payment);
  if (payment.status !== "captured") {
    return { ok: false, error: "Your payment is still processing. We'll confirm your order as soon as it completes." };
  }

  const paid = await markOrderPaid({
    orderId: order.id,
    razorpayPaymentId: payment.id,
    amountPaise: payment.amount,
    actor: "customer",
  });
  return { ok: true, paid };
}

/**
 * Handles one payment reported by Razorpay's webhook. Returns the paid result
 * when the order changed, plus an owner alert when something needs a human.
 */
export async function handleWebhookPayment(
  order: OrderWithItems,
  payment: RazorpayPayment,
): Promise<{ paid: PaidResult | null; alert: string | null }> {
  // A second, different payment on an order that is already paid (or refunded): someone paid twice.
  const settled = order.paymentStatus === "paid" || order.paymentStatus === "refunded";
  if (settled && order.razorpayPaymentId !== payment.id) {
    const message = `Extra payment ${payment.id} (₹${payment.amount / 100}) received for already-paid order ${order.orderNumber}. Refund it in Razorpay.`;
    await recordOrderEvent(order.id, "duplicate_payment", message, "razorpay");
    return { paid: null, alert: message };
  }
  if (!paymentMatches(order, payment)) {
    const message = `Payment ${payment.id} for order ${order.orderNumber} doesn't match (₹${payment.amount / 100}). Check it in Razorpay.`;
    await recordOrderEvent(order.id, "payment_mismatch", message, "razorpay");
    return { paid: null, alert: message };
  }

  const captured = await ensureCaptured(payment);
  if (captured.status !== "captured") return { paid: null, alert: null };
  const paid = await markOrderPaid({
    orderId: order.id,
    razorpayPaymentId: captured.id,
    amountPaise: captured.amount,
    actor: "razorpay",
  });
  return { paid, alert: null };
}

export type SwitchToCodResult =
  | { outcome: "switched"; order: OrderWithItems; stock: StockEffect }
  | { outcome: "paid_online"; paid: PaidResult | null; order: OrderWithItems }
  | { outcome: "unchanged"; order: OrderWithItems };

/**
 * Switches an unpaid order to Cash on Delivery, but first asks Razorpay whether
 * a payment for it already went through (UPI often completes after the window
 * closes). If money is on its way, the order is confirmed as prepaid instead,
 * so the customer is never charged twice.
 */
export async function switchToCodSafely(order: OrderWithItems, actor: string): Promise<SwitchToCodResult> {
  if (order.paymentStatus === "paid" || order.status !== "pending_payment") return { outcome: "unchanged", order };

  if (order.razorpayOrderId) {
    if (!isRazorpayEnabled()) throw new OrderError("Please try again in a minute.");
    const payments = await fetchOrderPayments(order.razorpayOrderId);
    const live = payments.find((p) => p.status === "captured" || p.status === "authorized");
    if (live) {
      if (!paymentMatches(order, live)) {
        await recordOrderEvent(
          order.id,
          "payment_mismatch",
          `Payment ${live.id} found with an unexpected amount`,
          actor,
        );
        throw new OrderError("We found a payment on this order that needs a check. Please contact us.");
      }
      const captured = await ensureCaptured(live);
      const paid = await markOrderPaid({
        orderId: order.id,
        razorpayPaymentId: captured.id,
        amountPaise: captured.amount,
        actor: "razorpay",
      });
      return { outcome: "paid_online", paid, order: paid?.order ?? order };
    }
  }

  const { order: updated, switched, stock } = await switchOrderToCod(order.id, actor);
  return switched ? { outcome: "switched", order: updated, stock } : { outcome: "unchanged", order: updated };
}
