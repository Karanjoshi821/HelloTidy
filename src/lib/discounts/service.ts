import "server-only";
import { and, count, eq, notInArray } from "drizzle-orm";
import { getDb, type Executor, type Tx } from "../db";
import { discounts, orders, type Discount } from "../db/schema";
import { formatDate } from "../utils";
import { OrderError } from "../orders/errors";
import type { Coupon } from "../pricing";

/**
 * Discount codes. A use counts once the order goes through: orders awaiting
 * online payment don't hold a use (a customer retrying payment isn't blocked
 * by their own abandoned attempt), and cancelling an order gives its use back.
 */

export type DiscountState = "active" | "scheduled" | "expired" | "disabled" | "used_up";

/** Order statuses that don't consume a use. */
const UNCOUNTED = ["cancelled", "pending_payment"] as const;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function toCoupon(d: Discount): Coupon {
  return {
    code: d.code,
    type: d.type,
    value: d.value,
    minOrder: d.minOrder,
    maxDiscount: d.type === "percent" ? d.maxDiscount : null,
    description: d.description,
  };
}

export function discountState(d: Discount, uses: number, now = new Date()): DiscountState {
  if (!d.active) return "disabled";
  if (d.startsAt && d.startsAt > now) return "scheduled";
  if (d.endsAt && d.endsAt <= now) return "expired";
  if (d.usageLimit !== null && uses >= d.usageLimit) return "used_up";
  return "active";
}

export async function countDiscountUses(db: Executor, code: string, phone?: string): Promise<number> {
  const filters = [eq(orders.couponCode, code), notInArray(orders.status, [...UNCOUNTED])];
  if (phone) filters.push(eq(orders.phone, phone));
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(...filters));
  return Number(row?.n ?? 0);
}

function stateError(state: DiscountState, d: Discount): string {
  switch (state) {
    case "scheduled":
      return `This code starts on ${formatDate(d.startsAt!)}.`;
    case "expired":
      return "This code has expired.";
    case "used_up":
      return "This code has been fully used.";
    default:
      return "This coupon code is not valid.";
  }
}

/**
 * Re-checks a code's use limits for an order placed unpaid that is now going
 * through (switched to COD, or paid online). Unpaid orders don't hold a use,
 * so two open checkouts could otherwise both use a "once per customer" code.
 * Call after the order itself counts (status updated). Returns the problem, or null.
 */
export async function discountOveruse(
  tx: Tx,
  code: string,
  phone: string,
  opts: { lock: boolean },
): Promise<string | null> {
  const query = tx.select().from(discounts).where(eq(discounts.code, code)).limit(1);
  const [d] = opts.lock ? await query.for("update") : await query;
  if (!d) return null;
  if (d.usageLimit !== null && (await countDiscountUses(tx, d.code)) > d.usageLimit) {
    return `${d.code} is already fully used`;
  }
  if (d.oncePerCustomer && (await countDiscountUses(tx, d.code, phone)) > 1) {
    return `${d.code} was already used by this mobile number`;
  }
  return null;
}

/** Checks a code typed at checkout, before the customer's phone is known. */
export async function findDiscountForPreview(
  code: string,
): Promise<{ ok: true; coupon: Coupon } | { ok: false; error: string }> {
  const db = await getDb();
  const [d] = await db
    .select()
    .from(discounts)
    .where(eq(discounts.code, normalizeCode(code)))
    .limit(1);
  if (!d || !d.active) return { ok: false, error: "This coupon code is not valid." };
  const uses = d.usageLimit === null ? 0 : await countDiscountUses(db, d.code);
  const state = discountState(d, uses);
  return state === "active" ? { ok: true, coupon: toCoupon(d) } : { ok: false, error: stateError(state, d) };
}

/**
 * Validates a code for an order being placed, inside its transaction. The row
 * lock makes concurrent orders with the same limited code take turns.
 */
export async function reserveDiscount(tx: Tx, code: string, phone: string): Promise<Coupon> {
  const [d] = await tx
    .select()
    .from(discounts)
    .where(eq(discounts.code, normalizeCode(code)))
    .limit(1)
    .for("update");
  if (!d || !d.active) throw new OrderError("This coupon code is not valid.");
  const uses = d.usageLimit === null ? 0 : await countDiscountUses(tx, d.code);
  const state = discountState(d, uses);
  if (state !== "active") throw new OrderError(stateError(state, d));
  if (d.customerPhone && d.customerPhone !== phone) {
    throw new OrderError("This code was made for a different mobile number.");
  }
  if (d.oncePerCustomer && (await countDiscountUses(tx, d.code, phone)) > 0) {
    throw new OrderError("You've already used this code on an earlier order.");
  }
  return toCoupon(d);
}
