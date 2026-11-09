import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { recordAudit } from "../audit";
import { getDb, type Tx } from "../db";
import { isUniqueViolation } from "../db/errors";
import { adminSessions, adminUsers } from "../db/schema";
import { UserError } from "../orders/errors";
import { hashPassword } from "../security/password";
import type { SessionUser } from "./session";

/**
 * Staff accounts (Settings → Staff, owner only). New accounts and resets get a
 * one-time password shown once to the owner; the person must replace it with
 * their own at first sign-in. There must always be one active owner.
 */

export type StaffRole = "owner" | "staff";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** e.g. "k7mq-3xtr-9wbp-c4hz": 80 bits, no look-alike characters, easy to read out on a call. */
export function generateTempPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return [group(), group(), group(), group()].join("-");
}

export async function listStaff() {
  const db = await getDb();
  return db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
      mustChangePassword: adminUsers.mustChangePassword,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt));
}

export async function getStaff(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
      mustChangePassword: adminUsers.mustChangePassword,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);
  if (!row) return null;
  const [{ sessions }] = await db.select({ sessions: count() }).from(adminSessions).where(eq(adminSessions.userId, id));
  return { ...row, sessions: Number(sessions) };
}

/**
 * Locks every active owner row (in id order, so concurrent changes queue
 * instead of deadlocking) and returns their ids. Two owners demoting each
 * other at the same moment can't both succeed and leave the store ownerless.
 */
async function lockActiveOwners(tx: Tx): Promise<string[]> {
  const rows = await tx
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(eq(adminUsers.role, "owner"), eq(adminUsers.active, true)))
    .orderBy(asc(adminUsers.id))
    .for("update");
  return rows.map((r) => r.id);
}

export async function createStaff(
  input: { name: string; email: string; role: StaffRole },
  actor: SessionUser,
): Promise<{ id: string; tempPassword: string }> {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(adminUsers)
        .values({ ...input, passwordHash, mustChangePassword: true })
        .returning({ id: adminUsers.id });
      await recordAudit(tx, {
        actor: actor.email,
        action: "staff.created",
        entityType: "staff",
        entityId: row.id,
        summary: `Added ${input.name} <${input.email}> as ${input.role}`,
      });
      return { id: row.id, tempPassword };
    });
  } catch (error) {
    if (isUniqueViolation(error, "admin_users_email_idx")) throw new UserError("Someone already has this email.");
    throw error;
  }
}

export async function updateStaff(
  id: string,
  input: { name: string; role: StaffRole; active: boolean },
  actor: SessionUser,
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Owners first, then the person being changed: the same lock order for every staff change.
    const owners = await lockActiveOwners(tx);
    const [before] = await tx.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1).for("update");
    if (!before) throw new UserError("Staff member not found.");
    if (id === actor.id && (input.role !== before.role || !input.active)) {
      throw new UserError("You can't change your own role or deactivate yourself. Ask another owner.");
    }
    const losesOwner = before.role === "owner" && before.active && (input.role !== "owner" || !input.active);
    if (losesOwner && owners.filter((ownerId) => ownerId !== id).length === 0) {
      throw new UserError("The store needs at least one active owner.");
    }

    const changes: string[] = [];
    if (before.name !== input.name) changes.push(`name → ${input.name}`);
    if (before.role !== input.role) changes.push(`role → ${input.role}`);
    if (before.active !== input.active) changes.push(input.active ? "reactivated" : "deactivated");
    if (!changes.length) return;

    await tx.update(adminUsers).set(input).where(eq(adminUsers.id, id));
    // A role change or deactivation applies right away: their sessions end.
    if (before.role !== input.role || !input.active) {
      await tx.delete(adminSessions).where(eq(adminSessions.userId, id));
    }
    await recordAudit(tx, {
      actor: actor.email,
      action: "staff.updated",
      entityType: "staff",
      entityId: id,
      summary: `${before.email}: ${changes.join(", ")}`,
    });
  });
}

/** Issues a one-time password and signs the person out everywhere. */
export async function resetStaffPassword(id: string, actor: SessionUser): Promise<{ tempPassword: string }> {
  if (id === actor.id) throw new UserError("Change your own password from Account.");
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(adminUsers)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(adminUsers.id, id))
      .returning({ email: adminUsers.email });
    if (!row) throw new UserError("Staff member not found.");
    await tx.delete(adminSessions).where(eq(adminSessions.userId, id));
    await recordAudit(tx, {
      actor: actor.email,
      action: "staff.password_reset",
      entityType: "staff",
      entityId: id,
      summary: `Reset the password for ${row.email}`,
    });
  });
  return { tempPassword };
}

export async function updateOwnName(user: SessionUser, name: string): Promise<void> {
  const db = await getDb();
  await db.update(adminUsers).set({ name }).where(eq(adminUsers.id, user.id));
}
