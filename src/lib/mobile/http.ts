import "server-only";
import { ZodError } from "zod";

/**
 * JSON plumbing for the DulyPaid app API (/api/mobile/v1). Every error has the
 * shape { error: { code, message } } so the app can branch on `code`.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "password_change_required"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "rate_limited"
  | "unavailable"
  | "server_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = () => new ApiError(401, "unauthorized", "Please sign in again.");
export const forbidden = () => new ApiError(403, "forbidden", "Only the store owner can do this.");
export const notFound = (what = "That") => new ApiError(404, "not_found", `${what} was not found.`);
export const invalid = (message: string) => new ApiError(422, "invalid", message);

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

/** Next.js navigation "errors" (redirect / notFound) carry a digest; read the target. */
export function navigationTarget(error: unknown): { kind: "redirect"; to: string } | { kind: "notFound" } | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string") return null;
  if (digest.startsWith("NEXT_REDIRECT")) return { kind: "redirect", to: digest.split(";")[2] || "/admin" };
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return { kind: "notFound" };
  return null;
}

/** Maps a redirect issued by requireAdmin()/requireOwner() to the matching API error. */
export function authRedirectError(to: string): ApiError | null {
  if (to.startsWith("/admin/login")) return unauthorized();
  if (to.startsWith("/admin/account?setup")) {
    return new ApiError(403, "password_change_required", "Choose your own password before continuing.");
  }
  if (to.includes("denied=1")) return forbidden();
  return null;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof ZodError) {
    return json({ error: { code: "invalid", message: error.issues[0]?.message ?? "Invalid request." } }, 422);
  }
  const nav = navigationTarget(error);
  if (nav?.kind === "notFound") return errorResponse(notFound());
  if (nav?.kind === "redirect") {
    const mapped = authRedirectError(nav.to);
    if (mapped) return errorResponse(mapped);
  }
  console.error("[mobile-api]", error);
  return json({ error: { code: "server_error", message: "Something went wrong. Please try again." } }, 500);
}

/** Request body as a plain object (empty for no body). Rejects anything that isn't a JSON object. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 100_000) throw invalid("Request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw invalid("Request body must be JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Request body must be a JSON object.");
  return body as Record<string, unknown>;
}
