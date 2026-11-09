import "server-only";
import type { ActionResult } from "./action-result";
import { UserError } from "./orders/errors";

/** Turns an error into a form message: ours are safe to show, anything else is logged and hidden. */
export function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof UserError) return { ok: false, message: error.message };
  console.error("[admin]", error);
  return { ok: false, message: fallback };
}
