import "server-only";
import type { ActionResult } from "../action-result";
import { authRedirectError, navigationTarget } from "./http";

/**
 * Runs an existing admin Server Action (src/app/admin/*-actions.ts) for the app,
 * so phone and web share one implementation: the same validation, audit log,
 * stock handling, Shiprocket sync and customer emails.
 *
 * JSON → FormData: strings and numbers as text, `true` as a ticked checkbox
 * ("true"), `false`/null/undefined omitted (an unticked checkbox), arrays of
 * plain values as repeated keys (e.g. bulk `ids`), objects and arrays of
 * objects as JSON text (e.g. order `lines`).
 */
export type AdminAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult | void>;

export type MobileActionResult = {
  ok: boolean;
  message: string;
  /** One-time passwords for new or reset staff. Shown once, never stored. */
  secret?: string;
  /** Set when the web action would have navigated, e.g. to the order it created. */
  created?: { type: "order" | "product" | "discount"; id: string };
  deleted?: boolean;
};

export function toFormData(fields: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === false) continue;
    if (Array.isArray(value) && value.some((item) => item !== null && typeof item === "object")) {
      fd.append(key, JSON.stringify(value));
    } else if (Array.isArray(value)) {
      for (const item of value) if (item !== undefined && item !== null) fd.append(key, String(item));
    } else if (typeof value === "object") {
      fd.append(key, JSON.stringify(value));
    } else {
      fd.append(key, String(value));
    }
  }
  return fd;
}

const CREATED = /^\/admin\/(orders|products|discounts)\/([^/?#]+)\?created=1/;

export async function runAction(action: AdminAction, fields: Record<string, unknown>): Promise<MobileActionResult> {
  try {
    const result = await action(null, toFormData(fields));
    if (!result) return { ok: true, message: "Done." };
    return { ok: result.ok, message: result.message, ...(result.secret ? { secret: result.secret } : {}) };
  } catch (error) {
    const nav = navigationTarget(error);
    if (nav?.kind !== "redirect") throw error;
    const authError = authRedirectError(nav.to);
    if (authError) throw authError;
    const created = nav.to.match(CREATED);
    if (created) {
      const type = ({ orders: "order", products: "product", discounts: "discount" } as const)[created[1] as "orders"];
      return { ok: true, message: "Created.", created: { type, id: decodeURIComponent(created[2]) } };
    }
    if (nav.to.includes("deleted=1")) return { ok: true, message: "Deleted.", deleted: true };
    return { ok: true, message: "Done." };
  }
}
