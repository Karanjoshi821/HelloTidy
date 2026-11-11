import "server-only";
import { absoluteUrl } from "@/config/site";
import { metaCapiConfig } from "../env";
import { paiseToRupees } from "../money";
import { sha256Hex } from "../security/crypto";
import type { OrderWithItems } from "../notify/types";

/**
 * Meta Conversions API. Sends the same Purchase the browser pixel sends, with
 * event_id = order number, so Meta de-duplicates the pair and still counts the
 * sale when the pixel is blocked (iOS, ad blockers).
 */

const hash = (value: string | null | undefined) => (value ? sha256Hex(value.trim().toLowerCase()) : undefined);
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function sendPurchaseEvent(order: OrderWithItems): Promise<void> {
  const cfg = metaCapiConfig();
  if (!cfg) return;
  // Shared with Meta only for buyers who accepted cookies, as the privacy policy says.
  if (order.attribution?.consent !== "granted") return;

  const [firstName, ...rest] = order.customerName.trim().split(/\s+/);
  const lastName = rest.join(" ");

  const userData: Record<string, unknown> = {
    ph: [hash(`91${order.phone}`)],
    external_id: [hash(order.phone)],
    fn: [hash(firstName)],
    ct: [hash(compact(order.city))],
    st: [hash(compact(order.state))],
    zp: [hash(order.pincode)],
    country: [hash("in")],
  };
  if (lastName) userData.ln = [hash(lastName)];
  if (order.email) userData.em = [hash(order.email)];
  if (order.clientIp && order.clientIp !== "0.0.0.0") userData.client_ip_address = order.clientIp;
  if (order.userAgent) userData.client_user_agent = order.userAgent;
  if (order.fbp) userData.fbp = order.fbp;
  if (order.fbc) userData.fbc = order.fbc;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor((order.confirmedAt ?? order.createdAt).getTime() / 1000),
        event_id: order.orderNumber,
        action_source: "website",
        event_source_url: absoluteUrl("/checkout"),
        user_data: userData,
        custom_data: {
          currency: "INR",
          value: paiseToRupees(order.total),
          order_id: order.orderNumber,
          content_type: "product",
          content_ids: order.items.map((i) => i.sku),
          contents: order.items.map((i) => ({ id: i.sku, quantity: i.qty, item_price: paiseToRupees(i.unitPrice) })),
          num_items: order.items.reduce((sum, i) => sum + i.qty, 0),
        },
      },
    ],
  };
  if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;

  const res = await fetch(
    `https://graph.facebook.com/${cfg.apiVersion}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Meta CAPI responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}
