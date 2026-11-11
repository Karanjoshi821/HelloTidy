import { z } from "zod";

// Skip zod's eval()-based fast path: the site's CSP forbids eval, and probing for it logs a browser issue.
z.config({ jitless: true });
import { INDIAN_STATES, normalizeIndianMobile } from "./india";
import { commerce } from "@/config/products";

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is too short`).max(max, `${label} is too long`);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .transform((v, ctx) => {
    const normalized = normalizeIndianMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number" });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z.string().trim().toLowerCase().max(120).pipe(z.email("Enter a valid email address"));

const optionalEmail = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined))
  .pipe(z.email("Enter a valid email address").optional());

const nameSchema = trimmed(2, 80, "Name").regex(/^[\p{L}\p{M} .'-]+$/u, "Use letters only");

const attributionValue = z.string().trim().max(150).optional();

export const checkoutSchema = z.object({
  /** Client-generated id for this checkout attempt, makes double submits safe. */
  checkoutId: z.uuid(),
  lines: z
    .array(
      z.object({
        packId: z.string().max(40),
        qty: z.number().int().min(1).max(commerce.maxQtyPerPack),
      }),
    )
    .min(1)
    .max(10),
  paymentMethod: z.enum(["cod", "prepaid"]),
  /** The total (paise) the checkout showed. The server refuses the order if its own total differs. */
  expectedTotal: z.number().int().min(0).max(100_000_000).optional(),
  couponCode: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]*$/, "Invalid coupon code")
    .optional(),
  name: nameSchema,
  phone: phoneSchema,
  email: optionalEmail,
  address1: trimmed(5, 200, "Address"),
  address2: optionalTrimmed(200),
  landmark: optionalTrimmed(100),
  city: trimmed(2, 80, "City"),
  state: z.enum(INDIAN_STATES, "Select your state"),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
  /** Honeypot. Real users never see or fill this field. */
  company: z.string().max(0, "Invalid submission").optional(),
  attribution: z
    .object({
      utmSource: attributionValue,
      utmMedium: attributionValue,
      utmCampaign: attributionValue,
      utmContent: attributionValue,
      utmTerm: attributionValue,
      landingPath: z.string().trim().max(300).optional(),
      referrer: z.string().trim().max(300).optional(),
      /** The cookie choice when ordering: Meta and Google get the purchase only when "granted". */
      consent: z.enum(["granted", "denied"]).optional(),
      /** Set by the server from the _ga cookie; anything the browser sends is replaced. */
      gaClientId: attributionValue,
      gaSessionId: attributionValue,
    })
    .optional(),
  /** The browser's visit id (src/lib/visitors), to link the order to its visit. */
  visitId: z.uuid().optional(),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;

/** A cart saved from checkout for a recovery call, once the customer has agreed to one. */
export const cartLeadSchema = z.object({
  /** Random id kept in the browser, one per cart. */
  clientKey: z.uuid(),
  name: nameSchema,
  phone: phoneSchema,
  lines: checkoutSchema.shape.lines,
});

export type CartLeadInput = z.input<typeof cartLeadSchema>;
export type CartLeadData = z.output<typeof cartLeadSchema>;

export const contactSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: optionalEmail,
  topic: z.enum(["order", "bulk", "product", "other"]),
  orderNumber: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  message: trimmed(10, 2000, "Message"),
  company: z.string().max(0, "Invalid submission").optional(),
});

export type ContactData = z.output<typeof contactSchema>;

export const trackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(HT|MT)-[A-Z0-9]{6}$/, "Enter your order number, e.g. HT-7K3P9Q"),
  phone: phoneSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().max(200).optional(),
});

export const passwordSchema = z.string().min(12, "Use at least 12 characters").max(200, "Password is too long");

/** Flattens Zod issues into { field: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
