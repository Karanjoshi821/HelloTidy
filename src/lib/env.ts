import "server-only";

/**
 * Server-side configuration. Integrations switch on when their variables are
 * present, so the store runs with COD only until keys are added.
 * See .env.example for every variable.
 */

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const isProduction = process.env.NODE_ENV === "production";

/** Used to hash IPs for rate limiting. Required in production. */
export function appSecret(): string {
  const secret = read("APP_SECRET");
  if (secret) return secret;
  if (isProduction) throw new Error("APP_SECRET is not set");
  return "dev-only-insecure-secret";
}

export function razorpayConfig() {
  const keyId = read("RAZORPAY_KEY_ID");
  const keySecret = read("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: read("RAZORPAY_WEBHOOK_SECRET") };
}

/**
 * Shiprocket API user (Shiprocket → Settings → API Users; a different email
 * from the main login). Delivery checks need the login and the pickup PIN.
 * Pushing orders also needs the pickup location's nickname, and runs only on
 * the live site unless SHIPROCKET_SYNC_ORDERS=1 (or =0 to stop it there).
 */
export function shiprocketConfig() {
  const email = read("SHIPROCKET_EMAIL");
  const password = read("SHIPROCKET_PASSWORD");
  const pickupPincode = read("SHIPROCKET_PICKUP_PINCODE");
  if (!email || !password || !pickupPincode || !/^[1-9]\d{5}$/.test(pickupPincode)) return null;
  const pickupLocation = read("SHIPROCKET_PICKUP_LOCATION");
  const sync = read("SHIPROCKET_SYNC_ORDERS");
  const syncOrders =
    Boolean(pickupLocation) && (sync === "1" || (sync !== "0" && process.env.VERCEL_ENV === "production"));
  return { email, password, pickupPincode, pickupLocation, syncOrders };
}

export function telegramConfig() {
  const botToken = read("TELEGRAM_BOT_TOKEN");
  const chatId = read("TELEGRAM_CHAT_ID");
  return botToken && chatId ? { botToken, chatId } : null;
}

export function orderWebhookConfig() {
  const url = read("ORDER_WEBHOOK_URL");
  const secret = read("ORDER_WEBHOOK_SECRET");
  return url && secret ? { url, secret } : null;
}

export function emailConfig() {
  const apiKey = read("RESEND_API_KEY");
  const from = read("EMAIL_FROM");
  return apiKey && from ? { apiKey, from, ownerEmail: read("OWNER_EMAIL") } : null;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(read(name) ?? "", 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}

/**
 * Cart-recovery calls (src/lib/recovery). Off until RECOVERY_API_KEY is set:
 * the checkout then shows no call consent and the automation API answers 404.
 */
export function recoveryConfig() {
  const apiKey = read("RECOVERY_API_KEY");
  if (!apiKey) return null;
  const [startHour, endHour] = (read("RECOVERY_CALL_HOURS") ?? "9-21").split("-").map((h) => Number.parseInt(h, 10));
  return {
    apiKey,
    /** n8n webhook that starts the call automation for each saved cart. */
    webhookUrl: read("RECOVERY_WEBHOOK_URL"),
    webhookToken: read("RECOVERY_WEBHOOK_TOKEN"),
    /** The most a call may offer; the agent picks a percent up to this. */
    maxDiscountPercent: readInt("RECOVERY_MAX_DISCOUNT_PERCENT", 10, 1, 50),
    couponHours: readInt("RECOVERY_COUPON_HOURS", 48, 1, 24 * 14),
    maxCallAttempts: readInt("RECOVERY_MAX_CALL_ATTEMPTS", 2, 1, 5),
    /** Calls are placed only between these hours, India time (TRAI permits 9 am to 9 pm). */
    callHours: {
      start: Number.isFinite(startHour) ? Math.min(Math.max(startHour, 0), 23) : 9,
      end: Number.isFinite(endHour) ? Math.min(Math.max(endHour, 1), 24) : 21,
    },
  };
}

export function isRecoveryEnabled(): boolean {
  return recoveryConfig() !== null;
}

/**
 * Google Analytics 4. The browser tag needs NEXT_PUBLIC_GA_MEASUREMENT_ID; the
 * server-side purchase (Measurement Protocol) also needs GA_API_SECRET
 * (GA4 → Admin → Data streams → the web stream → Measurement Protocol API secrets).
 */
export function ga4Config() {
  const measurementId = read("NEXT_PUBLIC_GA_MEASUREMENT_ID");
  if (!measurementId || !/^G-[A-Z0-9]{4,16}$/.test(measurementId)) return null;
  return { measurementId, apiSecret: read("GA_API_SECRET") };
}

/** Site verification meta tags, for owners who verify by tag instead of DNS. */
export function siteVerification() {
  return {
    google: read("GOOGLE_SITE_VERIFICATION"),
    bing: read("BING_SITE_VERIFICATION"),
    facebook: read("FACEBOOK_DOMAIN_VERIFICATION"),
  };
}

export function metaCapiConfig() {
  const pixelId = read("NEXT_PUBLIC_META_PIXEL_ID");
  const accessToken = read("META_CAPI_ACCESS_TOKEN");
  if (!pixelId || !accessToken) return null;
  return {
    pixelId,
    accessToken,
    apiVersion: read("META_GRAPH_API_VERSION") ?? "v25.0",
    testEventCode: read("META_CAPI_TEST_EVENT_CODE"),
  };
}
