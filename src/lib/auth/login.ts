import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminUsers } from "../db/schema";
import { sha256Hex } from "../security/crypto";
import { getDummyHash, verifyPassword } from "../security/password";
import { isRateLimited, rateLimit } from "../security/rate-limit";
import type { RequestContext } from "../security/request";

export type AdminUserRow = typeof adminUsers.$inferSelect;

export type CredentialCheck =
  | { ok: true; user: AdminUserRow }
  | { ok: false; reason: "rate_limited" | "invalid"; message: string };

/**
 * Email + password check shared by the web login form and the DulyPaid app.
 * Failures are counted per email+IP, so a stranger guessing your email can't
 * lock you out; the per-email cap (50) only slows a distributed attack.
 */
export async function checkAdminCredentials(email: string, password: string, ctx: RequestContext): Promise<CredentialCheck> {
  const emailKey = sha256Hex(email).slice(0, 32);
  const pairKey = `login-fail:${emailKey}:${ctx.ipHash}`;
  const globalKey = `login-fail:${emailKey}`;
  const [byIp, pairBlocked, globalBlocked] = await Promise.all([
    rateLimit(`login-ip:${ctx.ipHash}`, 20, 900),
    isRateLimited(pairKey, 5, 900),
    isRateLimited(globalKey, 50, 900),
  ]);
  if (!byIp.ok || pairBlocked || globalBlocked) {
    return { ok: false, reason: "rate_limited", message: "Too many sign-in attempts. Please wait 15 minutes and try again." };
  }

  const db = await getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  // Always run a hash comparison so response time doesn't reveal which emails exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid || !user.active) {
    await Promise.all([rateLimit(pairKey, 5, 900), rateLimit(globalKey, 50, 900)]);
    return { ok: false, reason: "invalid", message: "Incorrect email or password." };
  }
  return { ok: true, user };
}
