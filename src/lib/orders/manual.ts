import "server-only";
import { eq } from "drizzle-orm";
import { deductStock, lockPacks, noStockEffect, type StockEffect } from "../catalog/inventory";
import { readCheckoutSettings } from "../catalog/service";
import { assertCodAllowed, upsertCustomer } from "../customers/service";
import { getDb } from "../db";
import { isUniqueViolation } from "../db/errors";
import { orderItems, orders } from "../db/schema";
import { formatPaise } from "../money";
import type { OrderWithItems } from "../notify/types";
import { adminOrderLimits } from "../pricing";
import { generateOrderNumber, randomToken } from "../security/crypto";
import { OrderError, PriceChangedError } from "./errors";
import { insertOrder, priceLocked } from "./service";

/**
 * Orders created by staff in the admin ("Create order" in Shopify): phone and
 * WhatsApp orders, bulk orders, replacements. Same pricing, stock and COD-block
 * rules as the storefront, with three staff-only allowances: bigger quantities,
 * hidden packs, and a manual discount or waived COD fee. The COD order cap
 * doesn't apply, because staff have spoken to the customer.
 */

export type ManualOrderInput = {
  /** Generated when the form is opened, so a double submit creates one order. */
  key: string;
  lines: { packId: string; qty: number }[];
  customerName: string;
  phone: string;
  email: string | null;
  address1: string;
  address2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  payment: "cod" | "paid";
  paymentReference: string | null;
  manualDiscount: number;
  waiveCodFee: boolean;
  note: string | null;
  tags: string[];
  /** Total the form showed (paise); refused if prices changed meanwhile. */
  expectedTotal?: number;
};

export async function createManualOrder(
  input: ManualOrderInput,
  actor: string,
): Promise<{ order: OrderWithItems; created: boolean; stock: StockEffect }> {
  const db = await getDb();
  const idempotencyKey = `admin:${input.key}`;
  const findExisting = async () => {
    const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).limit(1);
    if (!existing) return null;
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
    return { ...existing, items };
  };
  const existing = await findExisting();
  if (existing) return { order: existing, created: false, stock: noStockEffect() };

  const isCod = input.payment === "cod";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const locked = await lockPacks(
          tx,
          input.lines.map((l) => l.packId),
        );
        const settings = await readCheckoutSettings(tx);
        const q = priceLocked(locked, settings, {
          lines: input.lines,
          paymentMethod: isCod ? "cod" : "prepaid",
          coupon: null,
          limits: adminOrderLimits,
          manualDiscount: input.manualDiscount,
          waiveCodFee: input.waiveCodFee,
          includeHidden: true,
        });
        if (input.expectedTotal !== undefined && input.expectedTotal !== q.total) throw new PriceChangedError();
        if (isCod) await assertCodAllowed(tx, input.phone);

        const customer = await upsertCustomer(tx, { phone: input.phone, name: input.customerName, email: input.email });
        const now = new Date();
        const order = await insertOrder(
          tx,
          {
            orderNumber: generateOrderNumber(),
            publicToken: randomToken(24),
            idempotencyKey,
            status: "confirmed",
            paymentMethod: isCod ? "cod" : "prepaid",
            paymentStatus: isCod ? "unpaid" : "paid",
            paymentReference: isCod ? null : input.paymentReference,
            customerName: input.customerName,
            phone: input.phone,
            email: input.email,
            address1: input.address1,
            address2: input.address2,
            landmark: input.landmark,
            city: input.city,
            state: input.state,
            pincode: input.pincode,
            subtotal: q.subtotal,
            discount: q.discount,
            shippingFee: q.shippingFee,
            codFee: q.codFee,
            total: q.total,
            customerId: customer.id,
            source: "admin",
            tags: input.tags,
            adminNotes: input.note,
            confirmedAt: now,
            paidAt: isCod ? null : now,
          },
          q,
          {
            message: isCod
              ? `Order created by staff · Cash on Delivery, ${formatPaise(q.total)} to collect`
              : `Order created by staff · paid ${formatPaise(q.total)}${input.paymentReference ? ` (ref ${input.paymentReference})` : ""}`,
            actor,
          },
        );
        const stock = await deductStock(tx, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          items: order.items,
          actor,
          allowOversell: false,
          locked,
        });
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        return { order: { ...order, items }, created: true, stock };
      });
    } catch (error) {
      if (isUniqueViolation(error, "orders_idempotency_key_idx")) {
        const again = await findExisting();
        if (again) return { order: again, created: false, stock: noStockEffect() };
      }
      if (isUniqueViolation(error, "orders_order_number_idx") || isUniqueViolation(error, "orders_public_token_idx")) {
        continue;
      }
      throw error;
    }
  }
  throw new OrderError("Could not allocate an order number. Please try again.");
}
