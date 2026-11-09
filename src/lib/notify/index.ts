import "server-only";
import { sendPurchaseEvent } from "../analytics/meta-capi";
import type { PaidResult } from "../orders/service";
import { sendOrderConfirmationEmail, sendOwnerAlertEmail, sendOwnerOrderEmail } from "./email";
import { alertTelegramMessage, newMessageTelegramMessage, newOrderTelegramMessage, sendTelegram } from "./telegram";
import type { OrderWithItems } from "./types";
import { sendOrderWebhook } from "./webhook";

/**
 * Fan-out when an order becomes confirmed (COD placed or prepaid paid).
 * Each channel is independent: one failing never blocks the others or the
 * customer. Call it from `after()` so it runs once the response has been sent.
 */
export async function notifyOrderConfirmed(order: OrderWithItems): Promise<void> {
  const results = await Promise.allSettled([
    sendTelegram(newOrderTelegramMessage(order)),
    sendOrderWebhook(order),
    sendOrderConfirmationEmail(order),
    sendOwnerOrderEmail(order),
    sendPurchaseEvent(order),
  ]);
  const channels = ["telegram", "webhook", "customer-email", "owner-email", "meta-capi"];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[notify] ${channels[i]} failed for ${order.orderNumber}:`, result.reason);
    }
  });
}

/** Something unusual that needs the owner (refunds, double payments, COD reversals). */
export async function notifyOwnerAlert(text: string, orderId?: string): Promise<void> {
  const results = await Promise.allSettled([
    sendTelegram(alertTelegramMessage(text, orderId)),
    sendOwnerAlertEmail(`⚠️ Store alert`, text),
  ]);
  results.forEach((r) => r.status === "rejected" && console.error("[notify] alert failed:", r.reason));
  console.warn(`[alert] ${text}`);
}

/** Notifications after an online payment, by outcome. */
export async function notifyPaid(result: PaidResult): Promise<void> {
  const { order, outcome } = result;
  if (outcome === "confirmed") return notifyOrderConfirmed(order);
  if (outcome === "reverted_from_cod") {
    // The COD switch already announced this order; only the payment mode changed.
    return notifyOwnerAlert(
      `Order ${order.orderNumber} was switched to Cash on Delivery, but the customer's online payment went through. It is now PREPAID — make sure the courier does not collect cash.`,
      order.id,
    );
  }
  return notifyOwnerAlert(
    `Payment received for CANCELLED order ${order.orderNumber}. Refund it in Razorpay, or reinstate the order.`,
    order.id,
  );
}

export async function notifyNewMessage(input: { name: string; topic: string; message: string }): Promise<void> {
  try {
    await sendTelegram(newMessageTelegramMessage(input));
  } catch (error) {
    console.error("[notify] telegram failed for contact message:", error);
  }
}
