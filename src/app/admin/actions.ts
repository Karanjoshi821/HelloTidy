"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { failure } from "@/lib/admin-actions";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { createSession, destroyAllSessions, destroyOtherSessions, destroySession } from "@/lib/auth/session";
import { updateOwnName } from "@/lib/auth/staff";
import { setContactMessageStatus } from "@/lib/contact/service";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { textField } from "@/lib/form";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/security/password";
import { isRateLimited, rateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";
import { sha256Hex } from "@/lib/security/crypto";
import { loginSchema, passwordSchema } from "@/lib/validation";

export type { ActionResult } from "@/lib/action-result";

const uuidSchema = z.uuid();

function safeNext(next: string | undefined): string {
  // Only same-site admin paths: blocks open redirects like //evil.com or /\evil.com.
  return next && /^\/admin(\/[A-Za-z0-9/_?=&.-]*)?$/.test(next) && !next.startsWith("/admin/login") ? next : "/admin";
}

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: "Enter your email and password." };

  const { email, password, next } = parsed.data;
  const ctx = await getRequestContext();
  // Failures are counted per email+IP, so a stranger guessing your email can't lock you out;
  // the per-email cap (50) only slows a distributed attack.
  const emailKey = sha256Hex(email).slice(0, 32);
  const pairKey = `login-fail:${emailKey}:${ctx.ipHash}`;
  const globalKey = `login-fail:${emailKey}`;
  const [byIp, pairBlocked, globalBlocked] = await Promise.all([
    rateLimit(`login-ip:${ctx.ipHash}`, 20, 900),
    isRateLimited(pairKey, 5, 900),
    isRateLimited(globalKey, 50, 900),
  ]);
  if (!byIp.ok || pairBlocked || globalBlocked) {
    return { ok: false, message: "Too many sign-in attempts. Please wait 15 minutes and try again." };
  }

  const db = await getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  // Always run a hash comparison so response time doesn't reveal which emails exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid || !user.active) {
    await Promise.all([rateLimit(pairKey, 5, 900), rateLimit(globalKey, 50, 900)]);
    return { ok: false, message: "Incorrect email or password." };
  }

  await createSession(user.id, ctx.userAgent);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await recordAudit(db, {
    actor: user.email,
    action: "session.signed_in",
    entityType: "session",
    entityId: user.id,
    summary: `Signed in (${ctx.userAgent.slice(0, 120) || "unknown device"})`,
  });
  redirect(user.mustChangePassword ? "/admin/account?setup=1" : safeNext(next));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

export async function setMessageStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = uuidSchema.safeParse(formData.get("id"));
  const status = z.enum(["new", "handled"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return;
  await setContactMessageStatus(id.data, status.data);
  refresh();
}

export async function changePasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // Also the way out of a one-time password, so it's allowed during setup.
  const user = await requireAdmin({ allowPasswordSetup: true });
  const current = String(formData.get("current") ?? "");
  const next = passwordSchema.safeParse(formData.get("password"));
  if (!next.success) return { ok: false, message: next.error.issues[0]?.message ?? "Invalid password." };
  if (next.data !== formData.get("confirm")) return { ok: false, message: "The new passwords don't match." };
  if (next.data === current) return { ok: false, message: "Choose a new password, different from the current one." };

  const ctx = await getRequestContext();
  const limit = await rateLimit(`pwchange:${user.id}`, 5, 900);
  if (!limit.ok) return { ok: false, message: "Too many attempts. Try again later." };

  const db = await getDb();
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return { ok: false, message: "Your current password is incorrect." };
  }
  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(next.data), mustChangePassword: false })
    .where(eq(adminUsers.id, user.id));
  await recordAudit(db, {
    actor: user.email,
    action: "session.password_changed",
    entityType: "session",
    entityId: user.id,
    summary: user.mustChangePassword ? "Replaced the one-time password" : "Changed password",
  });
  // Sign out every other device, then keep this one signed in.
  await destroyAllSessions(user.id);
  await createSession(user.id, ctx.userAgent);
  if (user.mustChangePassword) redirect("/admin");
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

export async function updateProfileAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const name = textField("Name", 2, 60).safeParse(formData.get("name") ?? "");
  if (!name.success) return { ok: false, message: name.error.issues[0].message };
  try {
    await updateOwnName(user, name.data);
  } catch (error) {
    return failure(error, "Couldn't save your name.");
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function signOutOthersAction(): Promise<ActionResult> {
  const user = await requireAdmin();
  const removed = await destroyOtherSessions(user.id);
  refresh();
  return {
    ok: true,
    message: removed
      ? `Signed out ${removed} other device${removed === 1 ? "" : "s"}.`
      : "No other devices were signed in.",
  };
}

export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireAdmin({ allowPasswordSetup: true });
  await destroyAllSessions(user.id);
  await destroySession();
  redirect("/admin/login");
}
