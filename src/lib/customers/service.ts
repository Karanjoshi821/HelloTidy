import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "../db";
import { customers, type Customer } from "../db/schema";
import { OrderError } from "../orders/errors";

/** Shown when a number blocked from COD (repeat refusals) tries to order with COD. */
export const COD_BLOCKED_MESSAGE =
  "Cash on Delivery isn't available for this mobile number. Please pay online (UPI, cards or netbanking).";

/**
 * Finds or creates the customer for a phone number. The first checkout sets
 * the name; later orders keep it (the order has its own delivery name) and
 * only fill in an email if none is on file.
 */
export async function upsertCustomer(
  db: Executor,
  input: { phone: string; name: string; email?: string | null },
): Promise<Customer> {
  const [row] = await db
    .insert(customers)
    .values({ phone: input.phone, name: input.name, email: input.email ?? null })
    .onConflictDoUpdate({
      target: customers.phone,
      set: { email: sql`coalesce(${customers.email}, excluded.email)`, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function findCustomerByPhone(db: Executor, phone: string): Promise<Customer | undefined> {
  const [row] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  return row;
}

export async function assertCodAllowed(db: Executor, phone: string): Promise<void> {
  const customer = await findCustomerByPhone(db, phone);
  if (customer?.codBlocked) throw new OrderError(COD_BLOCKED_MESSAGE);
}
