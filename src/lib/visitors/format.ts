/** Display helpers for Admin → Visitors. Safe in the browser. */

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${String(sec % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)} days`;
}

/** "3 min ago", "2 h ago", "4 days ago". */
export function ago(date: Date | string, now = new Date()): string {
  const sec = Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/$/, "Home"],
  [/^\/products\/[^/]+$/, "Product page"],
  [/^\/checkout$/, "Checkout"],
  [/^\/guides$/, "Cleaning guides"],
  [/^\/faq$/, "FAQ"],
  [/^\/about$/, "About us"],
  [/^\/contact$/, "Contact"],
  [/^\/track$/, "Track order"],
];

/** A friendly name for a stored path, e.g. "/products/magic-eraser-sponge?pack=pack-50" → "Product page (pack-50)". */
export function pageName(path: string | null | undefined): string {
  if (!path) return "Unknown";
  const [pathname, query = ""] = path.split("?");
  const pack = new URLSearchParams(query).get("pack");
  const named = PAGE_NAMES.find(([re]) => re.test(pathname ?? ""))?.[1];
  const guide = pathname?.match(/^\/guides\/([^/]+)$/)?.[1];
  const policy = pathname?.match(/^\/policies\/([^/]+)$/)?.[1];
  const base = named ?? (guide ? `Guide: ${guide.replace(/-/g, " ")}` : policy ? `Policy: ${policy}` : pathname || "/");
  return pack ? `${base} (${pack})` : base;
}

export function sourceLabel(source: string | null | undefined, medium?: string | null): string {
  const src = source || "direct";
  return medium ? `${src} / ${medium}` : src;
}

export const EVENT_LABELS: Record<string, string> = {
  view: "Viewed",
  pack_select: "Picked a pack",
  add_to_cart: "Added to cart",
  begin_checkout: "Started checkout",
  payment_method: "Chose how to pay",
  pin_check: "Checked a PIN code",
  video_play: "Played a video review",
  whatsapp_click: "Tapped WhatsApp",
  order_placed: "Placed an order",
  consent: "Accepted cookies",
};

type EventData = Record<string, string | number | boolean | null> | null | undefined;

/** One line for a timeline entry, e.g. "Checked a PIN code: 201001, delivers, COD available". */
export function describeEvent(type: string, data: EventData, path?: string | null): string {
  const label = EVENT_LABELS[type] ?? type;
  const d = data ?? {};
  switch (type) {
    case "view":
      return `${label} ${pageName(path)}`;
    case "pack_select":
      return `${label}: ${d.pack ?? "?"}`;
    case "add_to_cart":
      return `${label}: ${d.pack ?? "?"} × ${d.qty ?? 1}${d.via === "buy_now" ? " (Buy now)" : ""}`;
    case "begin_checkout":
      return `${label}${typeof d.value === "number" ? `, ₹${d.value}` : ""}`;
    case "payment_method":
      return `${label}: ${d.method === "cod" ? "Cash on Delivery" : "online"}`;
    case "pin_check": {
      const reach = d.serviceable === true ? "delivers" : d.serviceable === false ? "doesn't deliver" : "not sure";
      const cod = d.cod === true ? ", COD available" : d.cod === false ? ", no COD" : "";
      return `${label}: ${d.pin ?? "?"}, ${reach}${cod}`;
    }
    case "video_play":
      return `${label} (${d.video ?? "?"})`;
    case "whatsapp_click":
      return `${label} (${d.where ?? "?"})`;
    case "order_placed":
      return d.order ? `${label}: ${d.order}` : label;
    default:
      return label;
  }
}
