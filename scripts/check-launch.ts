/**
 * Lists everything still missing before going live: TODO placeholders in the
 * config and unset environment variables.
 *
 *   npm run check:launch
 */
import "./load-env";
import { product } from "../src/config/products";
import { reviews } from "../src/config/reviews";
import { siteConfig } from "../src/config/site";
import { videoReviews } from "../src/config/video-reviews";

const problems: string[] = [];
const warnings: string[] = [];

function walk(value: unknown, path: string) {
  if (typeof value === "string") {
    if (value.startsWith("TODO")) problems.push(`${path}: ${value}`);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
  }
}

walk(siteConfig, "site");
walk(product.declarations, "product.declarations");
if (product.images.length === 0) warnings.push("product.images is empty: add real product photos.");
const samples = reviews.filter((r) => r.sample).length;
if (samples)
  problems.push(
    `${samples} sample (fake) review(s) in src/config/reviews.ts: replace with genuine reviews before running ads`,
  );

const placeholderVideos = videoReviews.filter((v) => v.placeholder).length;
if (placeholderVideos)
  warnings.push(`${placeholderVideos} placeholder video review(s) in src/config/video-reviews.ts (local preview only)`);
for (const v of videoReviews.filter((v) => !v.placeholder && !v.consent))
  warnings.push(`video review "${v.id}" is hidden on the live site until the customer's permission is recorded (consent: true)`);
if (process.env.NEXT_PUBLIC_PREVIEW_SAMPLES === "1")
  warnings.push("NEXT_PUBLIC_PREVIEW_SAMPLES=1: placeholders show in local builds (never on Vercel production)");

const requiredEnv = ["DATABASE_URL", "APP_SECRET", "NEXT_PUBLIC_SITE_URL"];
for (const name of requiredEnv) if (!process.env[name]) problems.push(`env ${name} is not set`);

const optionalEnv: Record<string, string> = {
  RAZORPAY_KEY_ID: "online payments are off (COD only)",
  RAZORPAY_WEBHOOK_SECRET: "Razorpay webhook backup is off",
  TELEGRAM_BOT_TOKEN: "no Telegram ping on new orders",
  NEXT_PUBLIC_META_PIXEL_ID: "Meta Pixel is off, so you can't optimise ads",
  META_CAPI_ACCESS_TOKEN: "Meta Conversions API is off",
  RESEND_API_KEY: "no order confirmation emails",
};
for (const [name, effect] of Object.entries(optionalEnv)) {
  if (!process.env[name]) warnings.push(`env ${name} not set: ${effect}`);
}

if (siteConfig.url.includes("localhost")) problems.push("NEXT_PUBLIC_SITE_URL points to localhost");

console.log(problems.length ? `\n✗ ${problems.length} thing(s) to fix before launch:\n` : "\n✓ No blocking issues.\n");
for (const p of problems) console.log(`  • ${p}`);
if (warnings.length) {
  console.log(`\n! ${warnings.length} optional item(s):\n`);
  for (const w of warnings) console.log(`  • ${w}`);
}
console.log("");
process.exit(problems.length ? 1 : 0);
