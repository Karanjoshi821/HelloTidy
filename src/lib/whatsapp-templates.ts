import { siteConfig } from "@/config/site";
import { formatPaise } from "./money";

/**
 * Ready-to-send WhatsApp messages for staff (opened with wa.me, sent from the
 * store's own WhatsApp). Plain text, short, in the customer's interest.
 */

type OrderLike = {
  orderNumber: string;
  customerName: string;
  phone: string;
  total: number;
  city: string;
  courierName?: string | null;
  awbCode?: string | null;
  trackingUrl?: string | null;
};

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function waLink(phone: string, text: string): string {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}

export function codVerificationText(o: OrderLike): string {
  return `Hi ${first(o.customerName)}, this is ${siteConfig.name}. Thank you for your order ${o.orderNumber} (${formatPaise(o.total)}, Cash on Delivery, delivering to ${o.city}). Please reply YES to confirm, and we'll ship it right away.`;
}

export function shippedText(o: OrderLike, trackPage: string): string {
  const courier = [o.courierName, o.awbCode ? `AWB ${o.awbCode}` : null].filter(Boolean).join(", ");
  const track = o.trackingUrl && /^https:\/\//.test(o.trackingUrl) ? o.trackingUrl : trackPage;
  return `Hi ${first(o.customerName)}, your ${siteConfig.name} order ${o.orderNumber} has shipped${courier ? ` (${courier})` : ""}. Track it here: ${track}`;
}

export function paymentReminderText(o: OrderLike, orderLink: string): string {
  return `Hi ${first(o.customerName)}, your ${siteConfig.name} order ${o.orderNumber} (${formatPaise(o.total)}) is saved but not paid yet. You can finish paying, or switch to Cash on Delivery, here: ${orderLink}`;
}

export function generalText(o: OrderLike): string {
  return `Hi ${first(o.customerName)}, this is ${siteConfig.name} about your order ${o.orderNumber}.`;
}
