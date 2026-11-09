import "server-only";
import { and, count, desc, eq, notInArray, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { getDb } from "../db";
import { isUniqueViolation } from "../db/errors";
import { discounts, orders, type Discount } from "../db/schema";
import { formatPaise } from "../money";
import { UserError } from "../orders/errors";
import { formatDateTime } from "../utils";
import { discountState, normalizeCode } from "./service";

export type DiscountInput = {
  code: string;
  description: string;
  type: "percent" | "flat";
  /** Whole percent for percent codes, paise for flat codes. */
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  oncePerCustomer: boolean;
  active: boolean;
};

/** Plain-English summary, e.g. "10% off, up to ₹100, on orders above ₹500". */
export function describeDiscount(d: Pick<Discount, "type" | "value" | "minOrder" | "maxDiscount">): string {
  const off = d.type === "percent" ? `${d.value}% off` : `${formatPaise(d.value)} off`;
  const cap = d.type === "percent" && d.maxDiscount !== null ? `, up to ${formatPaise(d.maxDiscount)}` : "";
  const min = d.minOrder > 0 ? `${cap ? "," : ""} on orders of ${formatPaise(d.minOrder)} or more` : "";
  return `${off}${cap}${min}`;
}

const counted = notInArray(orders.status, ["cancelled", "pending_payment"]);

export async function listDiscountsAdmin() {
  const db = await getDb();
  const rows = await db
    .select({
      discount: discounts,
      uses: sql<number>`count(${orders.id}) filter (where ${counted})`.mapWith(Number),
      revenue:
        sql<number>`coalesce(sum(${orders.total} - ${orders.refundedAmount}) filter (where ${counted}), 0)`.mapWith(
          Number,
        ),
      discounted: sql<number>`coalesce(sum(${orders.discount}) filter (where ${counted}), 0)`.mapWith(Number),
    })
    .from(discounts)
    .leftJoin(orders, eq(orders.couponCode, discounts.code))
    .groupBy(discounts.id)
    .orderBy(desc(discounts.createdAt));
  return rows.map((r) => ({ ...r, state: discountState(r.discount, r.uses) }));
}

export async function getDiscountAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [discount] = await db.select().from(discounts).where(eq(discounts.id, id)).limit(1);
  if (!discount) return null;
  const [[usage], recent] = await Promise.all([
    db
      .select({
        uses: count(),
        revenue: sql<number>`coalesce(sum(${orders.total} - ${orders.refundedAmount}), 0)`.mapWith(Number),
        discounted: sql<number>`coalesce(sum(${orders.discount}), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(and(eq(orders.couponCode, discount.code), counted)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        total: orders.total,
        discount: orders.discount,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.couponCode, discount.code))
      .orderBy(desc(orders.createdAt))
      .limit(20),
  ]);
  const uses = Number(usage?.uses ?? 0);
  return {
    discount,
    uses,
    revenue: usage?.revenue ?? 0,
    discounted: usage?.discounted ?? 0,
    recent,
    state: discountState(discount, uses),
  };
}

function validate(input: DiscountInput): DiscountInput {
  const code = normalizeCode(input.code);
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new UserError("The end date must be after the start date.");
  }
  if (input.type === "flat" && input.minOrder > 0 && input.value > input.minOrder) {
    throw new UserError("A flat discount can't be bigger than its minimum order value.");
  }
  return { ...input, code, maxDiscount: input.type === "percent" ? input.maxDiscount : null };
}

function summary(d: DiscountInput): string {
  const parts = [describeDiscount(d)];
  if (d.usageLimit !== null) parts.push(`limit ${d.usageLimit} uses`);
  if (d.oncePerCustomer) parts.push("once per customer");
  if (d.startsAt) parts.push(`from ${formatDateTime(d.startsAt)}`);
  if (d.endsAt) parts.push(`until ${formatDateTime(d.endsAt)}`);
  if (!d.active) parts.push("disabled");
  return parts.join(", ");
}

export async function createDiscount(input: DiscountInput, actor: string): Promise<string> {
  const data = validate(input);
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(discounts).values(data).returning({ id: discounts.id });
      await recordAudit(tx, {
        actor,
        action: "discount.created",
        entityType: "discount",
        entityId: row.id,
        summary: `Created ${data.code}: ${summary(data)}`,
      });
      return row.id;
    });
  } catch (error) {
    if (isUniqueViolation(error, "discounts_code_idx")) throw new UserError(`The code ${data.code} already exists.`);
    throw error;
  }
}

export async function updateDiscount(id: string, input: DiscountInput, actor: string): Promise<void> {
  const data = validate(input);
  const db = await getDb();
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(discounts).where(eq(discounts.id, id)).limit(1).for("update");
      if (!before) throw new UserError("Discount not found.");
      if (before.code !== data.code) {
        const [{ n }] = await tx.select({ n: count() }).from(orders).where(eq(orders.couponCode, before.code));
        if (Number(n) > 0) {
          throw new UserError(
            `${before.code} is on existing orders, so it can't be renamed. Disable it and create a new code instead.`,
          );
        }
      }
      await tx.update(discounts).set(data).where(eq(discounts.id, id));
      await recordAudit(tx, {
        actor,
        action: "discount.updated",
        entityType: "discount",
        entityId: id,
        summary: `Updated ${data.code}: ${summary(data)}`,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "discounts_code_idx")) throw new UserError(`The code ${data.code} already exists.`);
    throw error;
  }
}

export async function setDiscountActive(id: string, active: boolean, actor: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.update(discounts).set({ active }).where(eq(discounts.id, id)).returning();
    if (!row) throw new UserError("Discount not found.");
    await recordAudit(tx, {
      actor,
      action: active ? "discount.enabled" : "discount.disabled",
      entityType: "discount",
      entityId: id,
      summary: `${active ? "Enabled" : "Disabled"} ${row.code}`,
    });
  });
}

/** Deletes a code that was never used. Used codes are kept (orders refer to them): disable those instead. */
export async function deleteDiscount(id: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(discounts).where(eq(discounts.id, id)).limit(1).for("update");
    if (!row) throw new UserError("Discount not found.");
    const [{ n }] = await tx.select({ n: count() }).from(orders).where(eq(orders.couponCode, row.code));
    if (Number(n) > 0)
      throw new UserError(`${row.code} is on existing orders, so it can't be deleted. Disable it instead.`);
    await tx.delete(discounts).where(eq(discounts.id, id));
    await recordAudit(tx, {
      actor,
      action: "discount.deleted",
      entityType: "discount",
      entityId: id,
      summary: `Deleted ${row.code}`,
    });
  });
}
