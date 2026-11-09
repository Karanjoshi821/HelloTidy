import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import { getDb } from "../db";
import { adminSessions, adminUsers } from "../db/schema";
import { isProduction } from "../env";
import { randomToken, sha256Hex } from "../security/crypto";

/** "__Host-" pins the cookie to this exact host, HTTPS and path "/". */
export const SESSION_COOKIE = isProduction ? "__Host-hellotidy_admin" : "hellotidy_admin";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  /** A one-time password is in use: the user must set their own before anything else. */
  mustChangePassword: boolean;
};

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, userAgent: string): Promise<void> {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(adminSessions).values({
    id: sha256Hex(token),
    userId,
    expiresAt,
    userAgent: userAgent.slice(0, 300),
  });
  // Housekeeping: drop this user's expired sessions.
  await db.delete(adminSessions).where(and(eq(adminSessions.userId, userId), lt(adminSessions.expiresAt, new Date())));
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/** Returns the signed-in admin, or null. Every call hits the database. */
export async function validateSession(): Promise<SessionUser | null> {
  // Admin data is per request and must never be part of a prerender.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const db = await getDb();
  const [row] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
      mustChangePassword: adminUsers.mustChangePassword,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
    .where(
      and(eq(adminSessions.id, sha256Hex(token)), gt(adminSessions.expiresAt, new Date()), eq(adminUsers.active, true)),
    )
    .limit(1);

  return row ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(adminSessions).where(eq(adminSessions.id, sha256Hex(token)));
  }
  // Overwrite rather than delete so the Secure attribute required by "__Host-" is kept.
  store.set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token && token.length <= 100 ? sha256Hex(token) : null;
}

/** The user's signed-in devices, newest first, with the current one marked. */
export async function listSessions(userId: string) {
  const db = await getDb();
  const current = await currentSessionId();
  const rows = await db
    .select({
      id: adminSessions.id,
      userAgent: adminSessions.userAgent,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .where(and(eq(adminSessions.userId, userId), gt(adminSessions.expiresAt, new Date())))
    .orderBy(desc(adminSessions.createdAt));
  return rows.map(({ id, ...row }) => ({ ...row, current: id === current }));
}

/** Signs out every device except this one. */
export async function destroyOtherSessions(userId: string): Promise<number> {
  const current = await currentSessionId();
  const db = await getDb();
  const removed = await db
    .delete(adminSessions)
    .where(and(eq(adminSessions.userId, userId), current ? ne(adminSessions.id, current) : undefined))
    .returning({ id: adminSessions.id });
  return removed.length;
}

/** Signs a user out everywhere, e.g. after a password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
}
