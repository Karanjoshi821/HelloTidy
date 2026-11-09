import "server-only";
import { eq } from "drizzle-orm";
import { recordAudit } from "./audit";
import { getDb } from "./db";
import { storeSettings } from "./db/schema";
import { formatPaise } from "./money";
import { UserError } from "./orders/errors";

/** Checkout settings editable in Admin → Settings. Amounts in paise. */

export const SETTINGS_LIMITS = {
  /** ₹0 – ₹500 */
  codFee: { min: 0, max: 50_000 },
  /** ₹100 – ₹1,00,000 */
  codMaxOrderValue: { min: 10_000, max: 10_000_000 },
};

export async function getStoreSettings() {
  const db = await getDb();
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1)).limit(1);
  if (!row) throw new Error("Store settings are missing. Run the database migrations (npm run db:migrate).");
  return row;
}

export async function updateCheckoutSettings(
  input: { codFee: number; codMaxOrderValue: number },
  actor: string,
): Promise<{ changed: boolean }> {
  const { codFee, codMaxOrderValue } = SETTINGS_LIMITS;
  if (input.codFee < codFee.min || input.codFee > codFee.max) {
    throw new UserError(`The COD charge must be between ${formatPaise(codFee.min)} and ${formatPaise(codFee.max)}.`);
  }
  if (input.codMaxOrderValue < codMaxOrderValue.min || input.codMaxOrderValue > codMaxOrderValue.max) {
    throw new UserError(
      `The COD limit must be between ${formatPaise(codMaxOrderValue.min)} and ${formatPaise(codMaxOrderValue.max)}.`,
    );
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1)).limit(1).for("update");
    if (!before) throw new Error("Store settings are missing.");
    const changes: string[] = [];
    if (before.codFee !== input.codFee) {
      changes.push(`COD charge ${formatPaise(before.codFee)} → ${formatPaise(input.codFee)}`);
    }
    if (before.codMaxOrderValue !== input.codMaxOrderValue) {
      changes.push(`COD limit ${formatPaise(before.codMaxOrderValue)} → ${formatPaise(input.codMaxOrderValue)}`);
    }
    if (!changes.length) return { changed: false };
    await tx
      .update(storeSettings)
      .set({ ...input, updatedBy: actor })
      .where(eq(storeSettings.id, 1));
    await recordAudit(tx, {
      actor,
      action: "settings.checkout",
      entityType: "settings",
      entityId: "checkout",
      summary: changes.join(", "),
    });
    return { changed: true };
  });
}
