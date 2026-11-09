import "server-only";
import { absoluteUrl } from "@/config/site";
import { telegramConfig } from "../env";
import { formatPaise } from "../money";
import type { OrderWithItems } from "./types";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(html: string): Promise<void> {
  const cfg = telegramConfig();
  if (!cfg) return;
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cfg.chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram responded ${res.status}`);
}

export function newOrderTelegramMessage(order: OrderWithItems): string {
  const items = order.items.map((i) => `• ${i.qty} × ${escapeHtml(i.name)} (${i.packCount} pcs)`).join("\n");
  const method = order.paymentMethod === "cod" ? "💵 COD" : "✅ Prepaid";
  return [
    `🛒 <b>New order ${escapeHtml(order.orderNumber)}</b>`,
    `<b>${formatPaise(order.total)}</b> · ${method}`,
    "",
    items,
    "",
    `${escapeHtml(order.customerName)} · ${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.pincode)}`,
    `<a href="${absoluteUrl(`/admin/orders/${order.id}`)}">Open in admin</a>`,
  ].join("\n");
}

export function alertTelegramMessage(text: string, orderId?: string): string {
  return [
    "⚠️ <b>Needs your attention</b>",
    escapeHtml(text),
    ...(orderId ? [`<a href="${absoluteUrl(`/admin/orders/${orderId}`)}">Open order</a>`] : []),
  ].join("\n");
}

export function newMessageTelegramMessage(input: { name: string; topic: string; message: string }): string {
  return [
    `✉️ <b>New ${escapeHtml(input.topic)} message</b> from ${escapeHtml(input.name)}`,
    escapeHtml(input.message.slice(0, 500)),
    `<a href="${absoluteUrl("/admin/messages")}">Open messages</a>`,
  ].join("\n");
}
