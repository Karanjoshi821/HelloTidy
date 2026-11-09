import "server-only";
import { recoveryConfig } from "../env";
import { safeEqual } from "../security/crypto";
import type { RecoveryConfig } from "./service";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Bearer-key check for the automation API (n8n and the voice agent):
 *   Authorization: Bearer <RECOVERY_API_KEY>
 * Answers 404 while the feature is off, so the routes look absent.
 */
export function authorizeRecovery(request: Request): { cfg: RecoveryConfig } | { response: Response } {
  const cfg = recoveryConfig();
  if (!cfg) return { response: json({ error: "not configured" }, 404) };
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !safeEqual(token, cfg.apiKey)) return { response: json({ error: "unauthorized" }, 401) };
  return { cfg };
}

/** Parses a small JSON body; null if it isn't one. */
export async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > 10_000) return null;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
