import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signOutOthersAction, updateProfileAction } from "@/app/admin/actions";
import { recordAudit } from "../../audit";
import { checkAdminCredentials } from "../../auth/login";
import {
  createMobileSession,
  destroyAllSessions,
  destroySessionById,
  listSessions,
  MOBILE_SESSION_PREFIX,
  type SessionUser,
} from "../../auth/session";
import { getDb } from "../../db";
import { adminUsers } from "../../db/schema";
import { firebaseConfig } from "../../env";
import { sendPush } from "../../notify/push";
import { hashPassword, verifyPassword } from "../../security/password";
import { rateLimit } from "../../security/rate-limit";
import { getRequestContext } from "../../security/request";
import { loginSchema, passwordSchema } from "../../validation";
import { runAction } from "../actions";
import { getDevice, registerDevice, unregisterDevice, updateDevicePrefs } from "../devices";
import { ApiError, invalid } from "../http";
import type { Route } from "../router";

const deviceName = z.string().trim().min(1).max(80).catch("Android phone");

function publicUser(u: Pick<SessionUser, "id" | "email" | "name" | "role" | "mustChangePassword">) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword };
}

const fcmToken = z.string().trim().min(20, "Invalid push token").max(4096);
const prefs = z.object({
  notifyOrders: z.boolean().optional(),
  notifyAlerts: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
});

export const accountRoutes: Route[] = [
  {
    method: "POST",
    path: "auth/login",
    access: "public",
    handler: async ({ body }) => {
      const parsed = loginSchema.safeParse({ email: body.email, password: body.password });
      if (!parsed.success) throw invalid("Enter your email and password.");
      const ctx = await getRequestContext();
      const check = await checkAdminCredentials(parsed.data.email, parsed.data.password, ctx);
      if (!check.ok) {
        throw check.reason === "rate_limited" ? new ApiError(429, "rate_limited", check.message) : new ApiError(401, "unauthorized", check.message);
      }
      const { user } = check;
      const name = deviceName.parse(body.deviceName);
      const session = await createMobileSession(user.id, name);
      const db = await getDb();
      await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
      await recordAudit(db, {
        actor: user.email,
        action: "session.signed_in",
        entityType: "session",
        entityId: user.id,
        summary: `Signed in (${MOBILE_SESSION_PREFIX} · ${name})`,
      });
      return { token: session.token, expiresAt: session.expiresAt, user: publicUser(user) };
    },
  },
  {
    method: "POST",
    path: "auth/logout",
    access: "setup",
    handler: async ({ auth }) => {
      await destroySessionById(auth.sessionId);
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "me",
    access: "setup",
    handler: async ({ auth }) => ({ user: publicUser(auth.user), push: { configured: Boolean(firebaseConfig()) } }),
  },
  {
    // Same rules as the web form. Signs out every device, then returns a fresh token for this phone.
    method: "POST",
    path: "account/password",
    access: "setup",
    handler: async ({ auth, body }) => {
      const { user } = auth;
      const current = typeof body.current === "string" ? body.current : "";
      const next = passwordSchema.safeParse(body.password);
      if (!next.success) throw invalid(next.error.issues[0]?.message ?? "Invalid password.");
      if (next.data !== body.confirm) throw invalid("The new passwords don't match.");
      if (next.data === current) throw invalid("Choose a new password, different from the current one.");
      const limit = await rateLimit(`pwchange:${user.id}`, 5, 900);
      if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many attempts. Try again later.");
      const db = await getDb();
      const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, user.id)).limit(1);
      if (!row || !(await verifyPassword(current, row.passwordHash))) throw invalid("Your current password is incorrect.");
      await db
        .update(adminUsers)
        .set({ passwordHash: await hashPassword(next.data), mustChangePassword: false })
        .where(eq(adminUsers.id, user.id));
      await recordAudit(db, {
        actor: user.email,
        action: "session.password_changed",
        entityType: "session",
        entityId: user.id,
        summary: user.mustChangePassword ? "Replaced the one-time password (app)" : "Changed password (app)",
      });
      await destroyAllSessions(user.id);
      const session = await createMobileSession(user.id, deviceName.parse(body.deviceName));
      return {
        message: "Password changed. Other devices have been signed out.",
        token: session.token,
        expiresAt: session.expiresAt,
        user: publicUser({ ...user, mustChangePassword: false }),
      };
    },
  },
  {
    method: "POST",
    path: "account/profile",
    access: "user",
    handler: ({ body }) => runAction(updateProfileAction, { name: body.name }),
  },
  {
    method: "GET",
    path: "account/sessions",
    access: "user",
    handler: async ({ auth }) => ({ sessions: await listSessions(auth.user.id) }),
  },
  {
    method: "POST",
    path: "account/sign-out-others",
    access: "user",
    handler: () => runAction(signOutOthersAction as never, {}),
  },
  {
    method: "POST",
    path: "account/sign-out-everywhere",
    access: "setup",
    handler: async ({ auth }) => {
      await destroyAllSessions(auth.user.id);
      return { ok: true };
    },
  },
  // ─── Push devices ──────────────────────────────────────────────────────────
  {
    method: "POST",
    path: "devices",
    access: "user",
    handler: async ({ auth, body }) => {
      const token = fcmToken.parse(body.token);
      const p = prefs.parse(body);
      const existing = await getDevice(token, auth.user.id);
      await registerDevice({
        userId: auth.user.id,
        sessionId: auth.sessionId,
        token,
        platform: z.enum(["android", "ios"]).catch("android").parse(body.platform),
        deviceName: deviceName.parse(body.deviceName),
        prefs: {
          notifyOrders: p.notifyOrders ?? existing?.notifyOrders ?? true,
          notifyAlerts: p.notifyAlerts ?? existing?.notifyAlerts ?? true,
          notifyMessages: p.notifyMessages ?? existing?.notifyMessages ?? true,
        },
      });
      const device = await getDevice(token, auth.user.id);
      return { device, push: { configured: Boolean(firebaseConfig()) } };
    },
  },
  {
    method: "PATCH",
    path: "devices",
    access: "user",
    handler: async ({ auth, body }) => {
      const token = fcmToken.parse(body.token);
      const ok = await updateDevicePrefs(token, auth.user.id, prefs.parse(body));
      if (!ok) throw new ApiError(404, "not_found", "This phone isn't registered for notifications yet.");
      return { device: await getDevice(token, auth.user.id) };
    },
  },
  {
    method: "DELETE",
    path: "devices",
    access: "setup",
    handler: async ({ auth, body }) => {
      await unregisterDevice(fcmToken.parse(body.token), auth.user.id);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "devices/test",
    access: "user",
    handler: async ({ auth, body }) => {
      if (!firebaseConfig()) {
        throw new ApiError(503, "unavailable", "Push isn't set up on the server yet (FIREBASE_* variables are missing).");
      }
      const token = fcmToken.parse(body.token);
      if (!(await getDevice(token, auth.user.id))) throw new ApiError(404, "not_found", "Register this phone first.");
      const result = await sendPush([token], {
        kind: "orders",
        title: "New order · ₹549",
        body: "TEST · This is how a new order sounds on DulyPaid",
        data: { type: "test" },
        tag: "test",
      });
      return { ok: result.sent > 0, message: result.sent ? "Test notification sent." : "FCM didn't accept the notification." };
    },
  },
];
