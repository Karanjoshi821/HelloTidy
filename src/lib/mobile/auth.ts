import "server-only";
import { after } from "next/server";
import { getAdmin } from "../auth/dal";
import { bearerSessionId, renewMobileSession, type SessionUser } from "../auth/session";
import { ApiError, forbidden, unauthorized } from "./http";

export type MobileAuth = { user: SessionUser; sessionId: string };

/**
 * The admin signed in on this phone. Uses the same admin_sessions check as the
 * web admin (see validateSession), so a deactivated user or a revoked session
 * is refused at once. Someone on a one-time password must set their own first.
 */
export async function requireMobileUser(opts: { owner?: boolean; allowPasswordSetup?: boolean } = {}): Promise<MobileAuth> {
  const sessionId = await bearerSessionId();
  if (!sessionId) throw unauthorized();
  const user = await getAdmin();
  if (!user) throw unauthorized();
  if (user.mustChangePassword && !opts.allowPasswordSetup) {
    throw new ApiError(403, "password_change_required", "Choose your own password before continuing.");
  }
  if (opts.owner && user.role !== "owner") throw forbidden();
  after(() => renewMobileSession(sessionId).catch((error) => console.error("[mobile-api] renew session", error)));
  return { user, sessionId };
}
