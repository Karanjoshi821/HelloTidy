/**
 * Business details shown across the site, in policies and in structured data.
 *
 * Every value starting with "TODO" must be replaced before launch.
 * `npm run check:launch` lists the ones still left.
 */

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");

export const siteConfig = {
  name: "Hello Tidy",
  /** Registered business name exactly as on your GST / PAN / bank account. */
  legalName: "TODO: Registered business name",
  /** Brand line: general, so it fits every future product. */
  tagline: "Say hello to a tidier home.",
  shortDescription:
    "Magic cleaning sponges that erase tough stains with just water. Free delivery across India, Cash on Delivery available.",
  url: siteUrl,
  locale: "en_IN",
  themeColor: "#0f7a3c",

  contact: {
    /** Shown as-is on the site. */
    phoneDisplay: "TODO: +91 98765 43210",
    /** Digits only with country code, used for tel: links. */
    phone: "TODO",
    /** Digits only with country code (e.g. 919876543210), used for wa.me links. */
    whatsapp: "TODO",
    email: "TODO: support@hellotidy.in",
    hours: "Mon–Sat, 10:00 am – 7:00 pm",
    responseTime: "We reply within a few hours on working days.",
  },

  /** Registered / pickup address. Required on the Contact page by the E-Commerce Rules, 2020. */
  address: {
    line1: "TODO: Building, street",
    line2: "TODO: Area, locality",
    city: "TODO: City",
    state: "TODO: State",
    pincode: "TODO",
    country: "India",
  },

  /** Required by Consumer Protection (E-Commerce) Rules, 2020. */
  grievanceOfficer: {
    name: "TODO: Full name",
    designation: "Grievance Officer",
    email: "TODO: grievance@hellotidy.in",
    phone: "TODO: +91 98765 43210",
  },

  /** Leave empty until registered; it is hidden when empty. */
  gstin: "",

  social: {
    instagram: "",
    facebook: "",
    youtube: "",
  },

  shipping: {
    dispatch: "24–48 hours",
    delivery: "3–7 working days",
    /** The same range as numbers, for the "arrives between" dates on the product page. Keep both in step. */
    deliveryDays: { min: 3, max: 7 },
    /** Days after delivery to report a damaged, defective or wrong item. */
    claimWindowDays: 7,
    refundDays: "5–7 working days",
  },

  /** Date the policy pages were last reviewed. Update when you change them. */
  policiesUpdated: "2026-10-30",
} as const;

export type SiteConfig = typeof siteConfig;

export function isPlaceholder(value: string | undefined | null): boolean {
  return !value || value.startsWith("TODO");
}

export function absoluteUrl(path = "/"): string {
  return `${siteConfig.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export function whatsappLink(message?: string): string | null {
  if (isPlaceholder(siteConfig.contact.whatsapp)) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${siteConfig.contact.whatsapp}${text}`;
}

export function formattedAddress(): string {
  const a = siteConfig.address;
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`, a.country].join(", ");
}
