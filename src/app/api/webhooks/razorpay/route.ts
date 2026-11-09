import { after } from "next/server";
import { eq } from "drizzle-orm";
import { applyStockEffect } from "@/lib/catalog/invalidate";
import { getDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { notifyOwnerAlert, notifyPaid } from "@/lib/notify";
import { getOrderByRazorpayOrderId, recordPaymentFailure } from "@/lib/orders/service";
import { handleWebhookPayment } from "@/lib/payments/flow";
import { isRazorpayEnabled, verifyWebhookSignature, type RazorpayPayment } from "@/lib/payments/razorpay";

/**
 * Razorpay webhook (Dashboard → Settings → Webhooks).
 * URL: https://<your-domain>/api/webhooks/razorpay
 * Events: payment.authorized, payment.captured, payment.failed, order.paid
 *
 * Backup path: confirms orders when the customer paid but closed the tab
 * before the browser could report back, and catches late or duplicate payments.
 */

type WebhookBody = {
  event: string;
  payload?: { payment?: { entity?: RazorpayPayment & { error_description?: string } } };
};

const PAID_EVENTS = new Set(["payment.authorized", "payment.captured", "order.paid"]);

export async function POST(request: Request) {
  if (!isRazorpayEnabled()) return Response.json({ error: "not configured" }, { status: 404 });

  const raw = await request.text();
  if (raw.length > 100_000) return Response.json({ error: "payload too large" }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const db = await getDb();
  const eventId = request.headers.get("x-razorpay-event-id");
  if (eventId) {
    const [seen] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1);
    if (seen) return Response.json({ ok: true, duplicate: true });
  }

  const payment = body.payload?.payment?.entity;
  if (payment?.order_id) {
    const order = await getOrderByRazorpayOrderId(payment.order_id);
    if (!order) {
      // Not one of ours (e.g. a payment link). Acknowledge so Razorpay stops retrying.
      return Response.json({ ok: true, ignored: true });
    }

    if (body.event === "payment.failed") {
      await recordPaymentFailure(order.id, `Payment failed: ${payment.error_description ?? "unknown reason"}`);
    } else if (PAID_EVENTS.has(body.event)) {
      const { paid, alert } = await handleWebhookPayment(order, payment);
      if (paid) {
        applyStockEffect(paid.stock);
        after(() => notifyPaid(paid));
      }
      if (alert) after(() => notifyOwnerAlert(alert, order.id));
    }
  }

  // Recorded only after successful processing, so a failed attempt is retried by Razorpay.
  if (eventId) {
    await db
      .insert(webhookEvents)
      .values({ id: eventId, provider: "razorpay", type: body.event })
      .onConflictDoNothing();
  }
  return Response.json({ ok: true });
}
