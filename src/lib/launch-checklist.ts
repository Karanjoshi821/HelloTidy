import "server-only";
import { product } from "@/config/products";
import { reviews } from "@/config/reviews";
import { isPlaceholder, siteConfig } from "@/config/site";
import { publishedVideoReviews, videoReviews } from "@/config/video-reviews";
import { emailConfig, metaCapiConfig, razorpayConfig, telegramConfig } from "./env";

/**
 * The admin's setup guide: what's still missing before running ads. Mirrors
 * `npm run check:launch`, plus the things only the database knows.
 */

export type ChecklistItem = { id: string; label: string; done: boolean; help: string; required: boolean };

function hasTodo(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("TODO");
  if (value && typeof value === "object") return Object.values(value).some(hasTodo);
  return false;
}

export function getLaunchChecklist(opts: { stockTracked: boolean }): ChecklistItem[] {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const razorpay = razorpayConfig();
  return [
    {
      id: "business",
      label: "Business details",
      done: !hasTodo(siteConfig),
      required: true,
      help: "Registered name, phone, WhatsApp, email, address and grievance officer in src/config/site.ts (required by the E-Commerce Rules).",
    },
    {
      id: "declarations",
      label: "Packaging declarations",
      done: !hasTodo(product.declarations),
      required: true,
      help: "Manufacturer/importer and country of origin in src/config/products.ts, exactly as printed on the pack.",
    },
    {
      id: "reviews",
      label: "Real customer reviews",
      done: !reviews.some((r) => r.sample),
      required: true,
      help: "Replace the sample reviews in src/config/reviews.ts with genuine ones before running ads.",
    },
    {
      id: "video-reviews",
      label: "Customer video reviews",
      done: publishedVideoReviews.length > 0 && !videoReviews.some((v) => v.placeholder),
      required: false,
      help: "Add customers' clips to src/config/video-reviews.ts and set consent: true once each customer agrees. Placeholders and clips without consent never show on the live site.",
    },
    {
      id: "domain",
      label: "Your domain",
      done: Boolean(siteUrl) && !siteUrl.includes("localhost") && !isPlaceholder(siteUrl),
      required: true,
      help: "Set NEXT_PUBLIC_SITE_URL in Vercel to your live domain.",
    },
    {
      id: "payments",
      label: "Online payments (Razorpay)",
      done: Boolean(razorpay?.webhookSecret),
      required: false,
      help: razorpay
        ? "Keys are set. Add the webhook secret so paid orders confirm even if the customer closes the tab."
        : "Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. Until then the store takes COD only.",
    },
    {
      id: "stock",
      label: "Stock tracking",
      done: opts.stockTracked,
      required: false,
      help: "When your stock arrives, open Products, switch on “Track stock” and enter the quantity.",
    },
    {
      id: "alerts",
      label: "New-order alerts",
      done: Boolean(telegramConfig()),
      required: false,
      help: "Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to get a ping on every order (see README).",
    },
    {
      id: "ads",
      label: "Meta Pixel + Conversions API",
      done: Boolean(metaCapiConfig()),
      required: false,
      help: "Add NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_ACCESS_TOKEN before running Meta ads.",
    },
    {
      id: "email",
      label: "Order emails",
      done: Boolean(emailConfig()),
      required: false,
      help: "Add RESEND_API_KEY and EMAIL_FROM so customers get confirmation and shipping emails.",
    },
  ];
}
