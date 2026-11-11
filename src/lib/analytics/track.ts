import { product } from "@/config/products";
import { reportVisitEvent } from "../visitors/tracker";
import { gtagEvent } from "./gtag";
import { trackPixel } from "./pixel";

/**
 * One call per shopper action, sent to every analytics tool that is switched
 * on and allowed: our own admin (always, anonymously without consent), Google
 * Analytics 4 and the Meta Pixel (only after Accept; they aren't loaded
 * otherwise, so their calls do nothing). Browser only.
 */

type PackLike = { id: string; sku: string; name: string; price: number; count?: number };
type LineLike = { sku: string; name: string; qty: number; unitPrice: number };

const rupees = (paise: number) => Math.round(paise) / 100;

function gaItem(p: { sku: string; name: string; price: number }, quantity = 1) {
  return { item_id: p.sku, item_name: product.name, item_variant: p.name, price: rupees(p.price), quantity };
}

export function trackViewItem(packs: PackLike[], main: PackLike | undefined): void {
  gtagEvent("view_item", {
    currency: "INR",
    ...(main ? { value: rupees(main.price) } : {}),
    items: packs.map((p) => gaItem(p)),
  });
  trackPixel("ViewContent", {
    content_ids: packs.map((p) => p.sku),
    content_type: "product",
    currency: "INR",
    ...(main ? { value: rupees(main.price) } : {}),
  });
}

export function trackPackSelect(pack: PackLike): void {
  reportVisitEvent("pack_select", { pack: pack.id });
  gtagEvent("select_item", { items: [gaItem(pack)] });
}

export function trackAddToCart(pack: PackLike, qty: number, via: "buy_now" | "cart"): void {
  reportVisitEvent("add_to_cart", { pack: pack.id, qty, via });
  gtagEvent("add_to_cart", { currency: "INR", value: rupees(pack.price * qty), items: [gaItem(pack, qty)] });
  trackPixel("AddToCart", {
    content_ids: [pack.sku],
    content_type: "product",
    currency: "INR",
    value: rupees(pack.price * qty),
  });
}

export function trackBeginCheckout(lines: LineLike[], subtotal: number, itemCount: number): void {
  reportVisitEvent("begin_checkout", { value: rupees(subtotal), items: itemCount });
  gtagEvent("begin_checkout", {
    currency: "INR",
    value: rupees(subtotal),
    items: lines.map((l) => gaItem({ sku: l.sku, name: l.name, price: l.unitPrice }, l.qty)),
  });
  trackPixel("InitiateCheckout", {
    content_ids: lines.map((l) => l.sku),
    content_type: "product",
    currency: "INR",
    value: rupees(subtotal),
    num_items: itemCount,
  });
}

/** When the order is submitted. GA4's purchase itself is sent by the server (Measurement Protocol). */
export function trackPaymentChoice(method: "cod" | "prepaid", lines: LineLike[], total: number): void {
  reportVisitEvent("payment_method", { method });
  gtagEvent("add_payment_info", {
    currency: "INR",
    value: rupees(total),
    payment_type: method === "cod" ? "Cash on Delivery" : "Online",
    items: lines.map((l) => gaItem({ sku: l.sku, name: l.name, price: l.unitPrice }, l.qty)),
  });
}

/** Browser half of the Meta purchase; the Conversions API sends the same event id from the server. */
export function trackPurchasePixel(orderNumber: string, total: number, lines: LineLike[], itemCount: number): void {
  trackPixel(
    "Purchase",
    {
      currency: "INR",
      value: rupees(total),
      content_ids: lines.map((l) => l.sku),
      content_type: "product",
      num_items: itemCount,
    },
    orderNumber,
  );
}

export function trackPinCheck(pin: string, serviceable: boolean | null, cod: boolean | null, where: string): void {
  reportVisitEvent("pin_check", { pin, serviceable, cod, where });
  gtagEvent("check_delivery", {
    serviceable: serviceable === null ? "unknown" : String(serviceable),
    cod: cod === null ? "unknown" : String(cod),
    location: where,
  });
}

export function trackVideoPlay(video: string): void {
  reportVisitEvent("video_play", { video });
  gtagEvent("play_review_video", { video_id: video });
}

export function trackWhatsAppClick(where: string): void {
  reportVisitEvent("whatsapp_click", { where });
  gtagEvent("contact_whatsapp", { location: where });
  trackPixel("Contact");
}

/**
 * Order pages hold a private token in the URL, and Google Analytics and
 * Clarity record page URLs. When either is running, leave with a full page
 * load (they don't load on order pages); otherwise keep the fast in-app
 * navigation. The short wait lets the purchase pixel go out first.
 */
export function goToOrderPage(push: (url: string) => void, url: string): void {
  if (typeof window !== "undefined" && (window.gtag || window.clarity)) {
    window.setTimeout(() => window.location.assign(url), 300);
    return;
  }
  push(url);
}

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}
