import "server-only";
import { randomUUID } from "node:crypto";
import { absoluteUrl } from "@/config/site";
import { orderWebhookConfig } from "../env";
import { paiseToRupees } from "../money";
import { hmacSha256Hex } from "../security/crypto";
import type { OrderWithItems } from "./types";

/**
 * Outgoing "order.confirmed" webhook, the hook for a future order-notification
 * app. Receivers verify:
 *   X-HelloTidy-Signature: t=<unix seconds>,v1=<hex HMAC_SHA256(secret, `${t}.${rawBody}`)>
 * and should reject timestamps older than 5 minutes (replay protection).
 * The payload carries no phone number or street address.
 */
export async function sendOrderWebhook(order: OrderWithItems): Promise<void> {
  const cfg = orderWebhookConfig();
  if (!cfg) return;

  const body = JSON.stringify({
    id: randomUUID(),
    type: "order.confirmed",
    createdAt: new Date().toISOString(),
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: paiseToRupees(order.total),
      currency: "INR",
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      items: order.items.map((i) => ({ sku: i.sku, name: i.name, qty: i.qty, packCount: i.packCount })),
      customer: { name: order.customerName, city: order.city, state: order.state, pincode: order.pincode },
      adminUrl: absoluteUrl(`/admin/orders/${order.id}`),
    },
  });

  const t = Math.floor(Date.now() / 1000);
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "HelloTidy-Webhooks/1.0",
      "X-HelloTidy-Signature": `t=${t},v1=${hmacSha256Hex(cfg.secret, `${t}.${body}`)}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Order webhook responded ${res.status}`);
}
