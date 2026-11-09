import { z } from "zod";
import { INDIAN_STATES } from "./india";
import { phoneSchema } from "./validation";
import { parseTags } from "./tags";

/**
 * Field parsers for admin forms (FormData values are strings). Money is typed
 * in rupees ("549" or "549.50") and stored as integer paise.
 */

export function rupeesField(label: string, opts: { min?: number; max?: number } = {}) {
  const min = opts.min ?? 0;
  const max = opts.max ?? 1_000_000;
  return z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, `${label}: enter an amount in rupees, like 549 or 549.50`)
    .transform((v) => Math.round(Number(v) * 100))
    .refine(
      (paise) => paise >= min * 100 && paise <= max * 100,
      `${label} must be between ₹${min} and ₹${max.toLocaleString("en-IN")}`,
    );
}

/** Optional rupee amount: empty means null. */
export function optionalRupeesField(label: string, opts: { min?: number; max?: number } = {}) {
  return z.union([z.literal("").transform(() => null), rupeesField(label, opts)]);
}

export function intField(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .regex(/^-?\d{1,9}$/, `${label}: enter a whole number`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}`);
}

export function optionalIntField(label: string, min: number, max: number) {
  return z.union([z.literal("").transform(() => null), intField(label, min, max)]);
}

export function textField(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} is too short`)
    .max(max, `${label} is too long (max ${max} characters)`);
}

/** Optional text: empty becomes null. */
export function optionalTextField(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters)`)
    .transform((v) => (v ? v : null));
}

/** An unchecked checkbox is missing from FormData. */
export const checkboxField = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true" || v === "1");

/** A datetime-local value, read as India time. Empty means null. */
export const istDateTimeField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time" });
      return z.NEVER;
    }
    const date = new Date(`${v}:00+05:30`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time" });
      return z.NEVER;
    }
    return date;
  });

/** Formats a Date for a datetime-local input, in India time. */
export function toIstInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 16);
}

export const tagsField = z.string().transform((v, ctx) => {
  const parsed = parseTags(v);
  if (parsed.error !== null) {
    ctx.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  }
  return parsed.tags;
});

export const formPhoneField = phoneSchema;

export const optionalEmailField = z
  .string()
  .trim()
  .max(120)
  .transform((v) => (v ? v.toLowerCase() : null))
  .pipe(z.email("Enter a valid email address").nullable());

export const stateField = z.enum(INDIAN_STATES, "Select the state");

export const pincodeField = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode");

export const uuidField = z.uuid("Invalid request");

/** Reads FormData into a plain object; repeated keys (checkbox lists) become arrays when asked for. */
export function formObject(formData: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (arrays.includes(key)) out[key] = formData.getAll(key).map(String);
    else out[key] = String(formData.get(key));
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}

/** First validation message, for the form's status line. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form.";
}
