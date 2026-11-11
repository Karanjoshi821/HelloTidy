import type { OrderWithItems } from "../notify/types";
import { paiseToRupees } from "../money";

/**
 * Builds Shiprocket's "create custom order" body from one of our orders.
 * Pure, so it can be tested without the network.
 *
 * Money: Shiprocket adds shipping and transaction charges to `sub_total` and
 * takes off `total_discount`, so the order total it shows (and, for COD, the
 * cash the courier collects) equals our `order.total`.
 */

/** Packed box size, used only for courier rates if a parcel is ever booked through Shiprocket. */
export const SHIPPING_BOX_CM = { length: 20, breadth: 15, height: 8 } as const;
/** Used when a pack's weight isn't known. */
const FALLBACK_PACK_GRAMS = 500;

/** "YYYY-MM-DD HH:mm" in India time. */
export function shiprocketDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function splitName(full: string): { first: string; last: string } {
  const words = full.trim().split(/\s+/);
  return { first: words[0] ?? full, last: words.slice(1).join(" ") };
}

export function shiprocketOrderPayload(
  order: OrderWithItems,
  opts: { pickupLocation: string; weightGramsByPack: Map<string, number>; fallbackEmail: string },
) {
  const { first, last } = splitName(order.customerName);
  const grams = order.items.reduce(
    (sum, i) => sum + (opts.weightGramsByPack.get(i.packId) ?? FALLBACK_PACK_GRAMS) * i.qty,
    0,
  );
  const address2 = [order.address2, order.landmark ? `Near ${order.landmark}` : null].filter(Boolean).join(", ");

  return {
    order_id: order.orderNumber,
    order_date: shiprocketDate(order.confirmedAt ?? order.createdAt),
    pickup_location: opts.pickupLocation,
    comment: "Hello Tidy website order",
    billing_customer_name: first,
    billing_last_name: last,
    billing_address: order.address1,
    billing_address_2: address2,
    billing_city: order.city,
    billing_pincode: order.pincode,
    billing_state: order.state,
    billing_country: "India",
    // Shiprocket requires an email; customers may skip it at checkout.
    billing_email: order.email || opts.fallbackEmail,
    billing_phone: order.phone,
    shipping_is_billing: true,
    order_items: order.items.map((i) => ({
      name: `${i.name} (${i.packCount} sponges)`,
      sku: i.sku,
      units: i.qty,
      selling_price: paiseToRupees(i.unitPrice),
      discount: 0,
      tax: 0,
    })),
    payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
    shipping_charges: paiseToRupees(order.shippingFee),
    transaction_charges: paiseToRupees(order.codFee),
    total_discount: paiseToRupees(order.discount),
    sub_total: paiseToRupees(order.subtotal),
    length: SHIPPING_BOX_CM.length,
    breadth: SHIPPING_BOX_CM.breadth,
    height: SHIPPING_BOX_CM.height,
    weight: Math.max(0.1, Math.round(grams / 10) / 100),
  };
}
