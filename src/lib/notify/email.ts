import "server-only";
import { absoluteUrl, siteConfig } from "@/config/site";
import { emailConfig } from "../env";
import { formatPaise } from "../money";
import type { OrderWithItems } from "./types";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const cfg = emailConfig();
  if (!cfg) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

function orderLines(order: OrderWithItems) {
  return order.items.map((i) => ({
    label: `${i.qty} × ${i.name} (${i.packCount} sponges)`,
    amount: formatPaise(i.lineTotal),
  }));
}

export async function sendOrderConfirmationEmail(order: OrderWithItems): Promise<void> {
  if (!order.email) return;
  const lines = orderLines(order);
  const trackUrl = absoluteUrl("/track");
  const payment =
    order.paymentMethod === "cod"
      ? `Cash on Delivery. Please keep ${formatPaise(order.total)} ready.`
      : "Paid online. Thank you!";

  const text = [
    `Hi ${order.customerName},`,
    "",
    `Thank you for your order ${order.orderNumber}. We'll dispatch it within ${siteConfig.shipping.dispatch}.`,
    "",
    ...lines.map((l) => `${l.label}: ${l.amount}`),
    `Total: ${formatPaise(order.total)}`,
    payment,
    "",
    `Track your order: ${trackUrl}`,
    "",
    `Team ${siteConfig.name}`,
  ].join("\n");

  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0">${escapeHtml(l.label)}</td><td style="padding:6px 0;text-align:right">${escapeHtml(l.amount)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f1b2d">
<div style="max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 4px">Order confirmed 🎉</h1>
<p style="margin:0 0 16px;color:#5b6b7f">Order <b>${escapeHtml(order.orderNumber)}</b></p>
<p>Hi ${escapeHtml(order.customerName)}, thank you for your order. We'll dispatch it within ${escapeHtml(siteConfig.shipping.dispatch)}.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e3e8ef;border-bottom:1px solid #e3e8ef;margin:16px 0">${rows}
<tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${escapeHtml(formatPaise(order.total))}</td></tr></table>
<p>${escapeHtml(payment)}</p>
<p><a href="${trackUrl}" style="display:inline-block;background:#0f7a3c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px">Track your order</a></p>
<p style="color:#5b6b7f;font-size:13px">Questions? Reply to this email or write to ${escapeHtml(siteConfig.contact.email)}.</p>
</div></body></html>`;

  await sendEmail({
    to: order.email,
    subject: `Order ${order.orderNumber} confirmed | ${siteConfig.name}`,
    html,
    text,
  });
}

export async function sendOwnerAlertEmail(subject: string, text: string): Promise<void> {
  const owner = emailConfig()?.ownerEmail;
  if (!owner) return;
  await sendEmail({
    to: owner,
    subject,
    html: `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    text,
  });
}

export async function sendOwnerOrderEmail(order: OrderWithItems): Promise<void> {
  const owner = emailConfig()?.ownerEmail;
  if (!owner) return;
  const lines = orderLines(order);
  const text = [
    `New order ${order.orderNumber}: ${formatPaise(order.total)} (${order.paymentMethod.toUpperCase()})`,
    ...lines.map((l) => `${l.label}: ${l.amount}`),
    `${order.customerName}, ${order.city}, ${order.state} ${order.pincode}`,
    absoluteUrl(`/admin/orders/${order.id}`),
  ].join("\n");
  await sendEmail({
    to: owner,
    subject: `🛒 New order ${order.orderNumber}: ${formatPaise(order.total)}`,
    html: `<pre style="font-family:Arial,Helvetica,sans-serif">${escapeHtml(text)}</pre>`,
    text,
  });
}

/** Tells the customer their order is on the way, with the courier and tracking link if known. */
export async function sendShippedEmail(order: OrderWithItems): Promise<void> {
  if (!order.email) return;
  const trackUrl = absoluteUrl("/track");
  const courierLine = [order.courierName, order.awbCode ? `tracking number ${order.awbCode}` : null]
    .filter(Boolean)
    .join(", ");
  const courierTrack = order.trackingUrl && /^https:\/\//.test(order.trackingUrl) ? order.trackingUrl : null;
  const cod = order.paymentMethod === "cod" && order.paymentStatus !== "paid";

  const text = [
    `Hi ${order.customerName},`,
    "",
    `Good news: your order ${order.orderNumber} has been shipped${courierLine ? ` (${courierLine})` : ""}.`,
    `It usually arrives in ${siteConfig.shipping.delivery}.`,
    cod ? `Please keep ${formatPaise(order.total)} ready for the delivery partner (Cash on Delivery).` : "",
    "",
    courierTrack ? `Track with the courier: ${courierTrack}` : `Track your order: ${trackUrl}`,
    "",
    `Team ${siteConfig.name}`,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f1b2d">
<div style="max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 4px">Your order is on the way 🚚</h1>
<p style="margin:0 0 16px;color:#5b6b7f">Order <b>${escapeHtml(order.orderNumber)}</b></p>
<p>Hi ${escapeHtml(order.customerName)}, your order has been shipped${courierLine ? ` (${escapeHtml(courierLine)})` : ""}. It usually arrives in ${escapeHtml(siteConfig.shipping.delivery)}.</p>
${cod ? `<p><b>Cash on Delivery:</b> please keep ${escapeHtml(formatPaise(order.total))} ready for the delivery partner.</p>` : ""}
<p><a href="${escapeHtml(courierTrack ?? trackUrl)}" style="display:inline-block;background:#0f7a3c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px">Track your order</a></p>
<p style="color:#5b6b7f;font-size:13px">Questions? Reply to this email or write to ${escapeHtml(siteConfig.contact.email)}.</p>
</div></body></html>`;

  await sendEmail({
    to: order.email,
    subject: `Order ${order.orderNumber} has shipped | ${siteConfig.name}`,
    html,
    text,
  });
}
