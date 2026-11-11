import "server-only";
import { ga4Config } from "../env";
import { paiseToRupees } from "../money";
import type { OrderWithItems } from "../notify/types";
import { product } from "@/config/products";

/**
 * Sends the purchase to Google Analytics 4 from the server (Measurement
 * Protocol), so ad blockers can't hide sales. Only for buyers who accepted
 * cookies: it needs their GA client id, read from the _ga cookie at checkout.
 * The browser never sends a purchase, so it's counted once.
 */
export async function sendGa4Purchase(order: OrderWithItems): Promise<void> {
  const cfg = ga4Config();
  const attribution = order.attribution ?? {};
  if (!cfg?.apiSecret || attribution.consent !== "granted" || !attribution.gaClientId) return;

  const sessionId = Number(attribution.gaSessionId);
  const payload = {
    client_id: attribution.gaClientId,
    timestamp_micros: (order.confirmedAt ?? order.createdAt).getTime() * 1000,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: order.orderNumber,
          currency: "INR",
          value: paiseToRupees(order.total),
          shipping: paiseToRupees(order.shippingFee + order.codFee),
          ...(order.discount ? { discount: paiseToRupees(order.discount) } : {}),
          ...(order.couponCode ? { coupon: order.couponCode } : {}),
          payment_type: order.paymentMethod === "cod" ? "Cash on Delivery" : "Online",
          ...(Number.isFinite(sessionId) && sessionId > 0 ? { session_id: sessionId } : {}),
          engagement_time_msec: 1,
          items: order.items.map((i) => ({
            item_id: i.sku,
            item_name: product.name,
            item_variant: i.name,
            price: paiseToRupees(i.unitPrice),
            quantity: i.qty,
          })),
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  // The collect endpoint answers 204 even for bad payloads; anything else is a real failure.
  if (!res.ok) throw new Error(`GA4 Measurement Protocol responded ${res.status}`);
}
