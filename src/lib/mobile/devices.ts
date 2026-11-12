import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { adminDevices, adminSessions, adminUsers } from "../db/schema";

export type PushKind = "orders" | "alerts" | "messages";

export type DevicePrefs = { notifyOrders: boolean; notifyAlerts: boolean; notifyMessages: boolean };

/**
 * Saves this phone's FCM token against the app session. A token that moved to
 * another account (someone signed in as a different user) is re-pointed, so a
 * phone only ever receives one account's notifications.
 */
export async function registerDevice(input: {
  userId: string;
  sessionId: string;
  token: string;
  platform: string;
  deviceName: string | null;
  prefs: DevicePrefs;
}): Promise<void> {
  const db = await getDb();
  const values = {
    token: input.token,
    userId: input.userId,
    sessionId: input.sessionId,
    platform: input.platform,
    deviceName: input.deviceName,
    ...input.prefs,
    lastSeenAt: new Date(),
  };
  await db
    .insert(adminDevices)
    .values(values)
    .onConflictDoUpdate({ target: adminDevices.token, set: values });
}

export async function updateDevicePrefs(token: string, userId: string, prefs: Partial<DevicePrefs>): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(adminDevices)
    .set({ ...prefs, lastSeenAt: new Date() })
    .where(and(eq(adminDevices.token, token), eq(adminDevices.userId, userId)))
    .returning({ id: adminDevices.id });
  return rows.length > 0;
}

export async function getDevice(token: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(adminDevices)
    .where(and(eq(adminDevices.token, token), eq(adminDevices.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function unregisterDevice(token: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(adminDevices).where(and(eq(adminDevices.token, token), eq(adminDevices.userId, userId)));
}

/** FCM tokens that should get this kind of push: live session, active user, preference on. */
export async function pushTargets(kind: PushKind): Promise<string[]> {
  const db = await getDb();
  const pref = { orders: adminDevices.notifyOrders, alerts: adminDevices.notifyAlerts, messages: adminDevices.notifyMessages }[kind];
  const rows = await db
    .select({ token: adminDevices.token })
    .from(adminDevices)
    .innerJoin(adminSessions, eq(adminDevices.sessionId, adminSessions.id))
    .innerJoin(adminUsers, eq(adminDevices.userId, adminUsers.id))
    .where(and(eq(pref, true), eq(adminUsers.active, true), gt(adminSessions.expiresAt, new Date())));
  return rows.map((r) => r.token);
}

/** FCM said these tokens are dead (app uninstalled, data cleared): forget them. */
export async function forgetTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  const db = await getDb();
  await db.delete(adminDevices).where(inArray(adminDevices.token, tokens));
}
