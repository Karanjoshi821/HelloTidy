import "server-only";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { getDb, type Executor } from "./db";
import { auditLog } from "./db/schema";

/**
 * Admin activity log: who changed the catalogue, discounts, settings, staff
 * and customers, and who signed in. Order changes live on each order's timeline.
 */

export type AuditEntity = "pack" | "discount" | "settings" | "staff" | "customer" | "session";

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  pack: "Products",
  discount: "Discounts",
  settings: "Settings",
  staff: "Staff",
  customer: "Customers",
  session: "Sign-ins",
};

export async function recordAudit(
  db: Executor,
  entry: { actor: string; action: string; entityType: AuditEntity; entityId?: string | null; summary: string },
): Promise<void> {
  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary.slice(0, 500),
  });
}

const PAGE_SIZE = 50;

export async function listAudit(params: { page?: number; entityType?: string; entityId?: string }) {
  const db = await getDb();
  const filters: SQL[] = [];
  if (params.entityType && params.entityType in AUDIT_ENTITY_LABELS) {
    filters.push(eq(auditLog.entityType, params.entityType));
  }
  if (params.entityId) filters.push(eq(auditLog.entityId, params.entityId));
  const where = filters.length ? and(...filters) : undefined;
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}
