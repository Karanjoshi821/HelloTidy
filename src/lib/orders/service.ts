import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { deductStock, assertInStock, lockPacks, noStockEffect, type StockEffect } from "../catalog/inventory";
import { readCheckoutSettings, toPublicPack } from "../catalog/service";
import { assertCodAllowed, upsertCustomer } from "../customers/service";
import { getDb, type Tx } from "../db";
import { isUniqueViolation } from "../db/errors";
import { orderEvents, orderItems, orders, packs, type Order, type PackRow } from "../db/schema";
import { discountOveruse, reserveDiscount } from "../discounts/service";
import { formatPaise } from "../money";
import { isRazorpayEnabled } from "../payments/razorpay";
import { quote, QuoteError, type Coupon, type PaymentMethod, type Quote, type QuoteLimits } from "../pricing";
import { generateOrderNumber, randomToken } from "../security/crypto";
import type { CheckoutData } from "../validation";
import type { OrderWithItems } from "../notify/types";
import { OrderError, PriceChangedError } from "./errors";

export { OrderError, PriceChangedError } from "./errors";

export type OrderRequestContext = {
  ip: string;
  userAgent: string;
  fbp?: string;
  fbc?: string;
};

async function withItems(order: Order | undefined): Promise<OrderWithItems | null> {
  if (!order) return null;
  const db = await getDb();
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return withItems(order);
}

export async function getOrderByToken(token: string): Promise<OrderWithItems | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.publicToken, token)).limit(1);
  return withItems(order);
}

async function getOrderByIdempotencyKey(key: string): Promise<OrderWithItems | null> {
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.idempotencyKey, key)).limit(1);
  return withItems(order);
}

/** Prices lines against locked pack rows. Hidden packs count as "no longer available". */
export function priceLocked(
  locked: PackRow[],
  settings: { codFee: number; codMaxOrderValue: number },
  input: {
    lines: { packId: string; qty: number }[];
    paymentMethod: PaymentMethod;
    coupon: Coupon | null;
    limits?: QuoteLimits;
    manualDiscount?: number;
    waiveCodFee?: boolean;
    includeHidden?: boolean;
  },
): Quote {
  const visible = input.includeHidden ? locked : locked.filter((r) => r.status === "active");
  const catalog = {
    packs: visible.map((r) => ({ ...toPublicPack(r), available: !r.trackInventory || r.stock > 0 })),
    ...settings,
  };
  try {
    return quote({ ...input, catalog });
  } catch (error) {
    if (error instanceof QuoteError) throw new OrderError(error.message);
    throw error;
  }
}

/** Inserts an order with its lines and first timeline event. Returns the stored lines. */
export async function insertOrder(
  tx: Tx,
  values: typeof orders.$inferInsert,
  q: Quote,
  event: { message: string; actor: string },
): Promise<OrderWithItems> {
  const [created] = await tx.insert(orders).values(values).returning();
  const items = await tx
    .insert(orderItems)
    .values(
      q.lines.map((line) => ({
        orderId: created.id,
        packId: line.packId,
        sku: line.sku,
        name: line.name,
        packCount: line.count,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    )
    .returning();
  await tx.insert(orderEvents).values({ orderId: created.id, type: "created", ...event });
  return { ...created, items };
}

export type PlaceOrderResult = { order: OrderWithItems; created: boolean; stock: StockEffect };

/**
 * Creates an order from validated checkout data. Prices come from the
 * database, never from the client. Re-submitting the same checkoutId returns
 * the existing order instead of creating a duplicate.
 */
export async function placeOrder(data: CheckoutData, ctx: OrderRequestContext): Promise<PlaceOrderResult> {
  const existing = await getOrderByIdempotencyKey(data.checkoutId);
  if (existing) return { order: existing, created: false, stock: noStockEffect() };

  const isCod = data.paymentMethod === "cod";
  if (!isCod && !isRazorpayEnabled()) {
    throw new OrderError("Online payment is not available right now. Please choose Cash on Delivery.");
  }
  const db = await getDb();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // Lock order: packs, then the discount row (the same everywhere, so no deadlocks).
        const locked = await lockPacks(
          tx,
          data.lines.map((l) => l.packId),
        );
        const settings = await readCheckoutSettings(tx);
        const coupon = data.couponCode ? await reserveDiscount(tx, data.couponCode, data.phone) : null;
        const q = priceLocked(locked, settings, { lines: data.lines, paymentMethod: data.paymentMethod, coupon });
        if (q.couponError) throw new OrderError(q.couponError);
        if (isCod && !q.codAvailable) {
          throw new OrderError(
            `Cash on Delivery is available on orders up to ${formatPaise(settings.codMaxOrderValue)}. Please pay online.`,
          );
        }
        // The customer must be charged exactly what the checkout showed them.
        if (data.expectedTotal !== undefined && data.expectedTotal !== q.total) throw new PriceChangedError();
        if (isCod) await assertCodAllowed(tx, data.phone);
        else assertInStock(locked, q.lines);

        const customer = await upsertCustomer(tx, { phone: data.phone, name: data.name, email: data.email });
        const order = await insertOrder(
          tx,
          {
            orderNumber: generateOrderNumber(),
            publicToken: randomToken(24),
            idempotencyKey: data.checkoutId,
            status: isCod ? "confirmed" : "pending_payment",
            paymentMethod: data.paymentMethod,
            paymentStatus: "unpaid",
            customerName: data.name,
            phone: data.phone,
            email: data.email ?? null,
            address1: data.address1,
            address2: data.address2 ?? null,
            landmark: data.landmark ?? null,
            city: data.city,
            state: data.state,
            pincode: data.pincode,
            subtotal: q.subtotal,
            discount: q.discount,
            shippingFee: q.shippingFee,
            codFee: q.codFee,
            total: q.total,
            couponCode: q.coupon?.code ?? null,
            customerId: customer.id,
            source: "web",
            clientIp: ctx.ip,
            userAgent: ctx.userAgent,
            fbp: ctx.fbp?.slice(0, 200) ?? null,
            fbc: ctx.fbc?.slice(0, 300) ?? null,
            attribution: data.attribution ?? null,
            confirmedAt: isCod ? new Date() : null,
          },
          q,
          {
            message: isCod ? "Order placed with Cash on Delivery" : "Order created, waiting for online payment",
            actor: "customer",
          },
        );

        if (!isCod) return { order, created: true, stock: noStockEffect() };
        const stock = await deductStock(tx, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          items: order.items,
          actor: "customer",
          allowOversell: false,
          locked,
        });
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        return { order: { ...order, items }, created: true, stock };
      });
    } catch (error) {
      if (isUniqueViolation(error, "orders_idempotency_key_idx")) {
        const again = await getOrderByIdempotencyKey(data.checkoutId);
        if (again) return { order: again, created: false, stock: noStockEffect() };
      }
      // Astronomically rare order-number / token collision: try again.
      if (isUniqueViolation(error, "orders_order_number_idx") || isUniqueViolation(error, "orders_public_token_idx")) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate an order number");
}

/** Before (re)opening online payment: refuses if tracked stock can no longer cover the order. */
export async function checkOrderStock(order: OrderWithItems): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(packs)
    .where(
      inArray(
        packs.id,
        order.items.map((i) => i.packId),
      ),
    );
  assertInStock(rows, order.items);
}

/** What an order costs when paid online: everything except the COD fee. */
export function prepaidAmount(order: Pick<Order, "subtotal" | "discount" | "shippingFee">): number {
  return order.subtotal - order.discount + order.shippingFee;
}

/**
 * Links a Razorpay order to our order, only if none is linked yet. Returns the
 * Razorpay order id actually stored, so two concurrent "Pay" clicks share one.
 */
export async function attachRazorpayOrder(orderId: string, razorpayOrderId: string): Promise<string> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({ razorpayOrderId })
      .where(and(eq(orders.id, orderId), isNull(orders.razorpayOrderId)))
      .returning({ id: orders.id });
    if (!row) {
      const [current] = await tx
        .select({ razorpayOrderId: orders.razorpayOrderId })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!current?.razorpayOrderId) throw new OrderError("Order not found.");
      return current.razorpayOrderId;
    }
    await tx.insert(orderEvents).values({
      orderId,
      type: "payment_initiated",
      message: `Razorpay order ${razorpayOrderId} created`,
      actor: "system",
    });
    return razorpayOrderId;
  });
}

export async function getOrderByRazorpayOrderId(razorpayOrderId: string): Promise<OrderWithItems | null> {
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpayOrderId)).limit(1);
  return withItems(order);
}

/**
 * - confirmed: a normal prepaid order was paid.
 * - reverted_from_cod: the customer had switched to COD, but the online payment
 *   went through anyway; the order is prepaid again and no cash must be collected.
 * - paid_after_cancel: money arrived for a cancelled order; the owner must refund.
 */
export type PaidOutcome = "confirmed" | "reverted_from_cod" | "paid_after_cancel";

/** Payment statuses an online payment may still be applied to. */
const PAYABLE: Order["paymentStatus"][] = ["unpaid", "failed"];
export type PaidResult = { order: OrderWithItems; outcome: PaidOutcome; stock: StockEffect };

/**
 * Records a verified online payment. The caller must already have checked the
 * payment belongs to this order's Razorpay order and that amountPaise equals
 * prepaidAmount(order). Idempotent: returns null if the order was already paid,
 * so notifications fire exactly once. Takes the order's stock when it moves
 * out of "awaiting payment" (the money is in, so it may oversell; the owner is alerted).
 */
export async function markOrderPaid(input: {
  orderId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  actor: "customer" | "razorpay";
}): Promise<PaidResult | null> {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1).for("update");
    // Only an unpaid order can become paid: a paid or refunded one (e.g. a webhook retry) is left alone.
    if (!current || !PAYABLE.includes(current.paymentStatus)) return undefined;

    const outcome: PaidOutcome =
      current.status === "cancelled"
        ? "paid_after_cancel"
        : current.paymentMethod === "cod"
          ? "reverted_from_cod"
          : "confirmed";
    const now = new Date();
    const [row] = await tx
      .update(orders)
      .set({
        paymentStatus: "paid",
        paymentMethod: "prepaid",
        razorpayPaymentId: input.razorpayPaymentId,
        codFee: 0,
        total: input.amountPaise,
        paidAt: now,
        status: current.status === "pending_payment" ? "confirmed" : current.status,
        confirmedAt: current.confirmedAt ?? now,
      })
      .where(and(eq(orders.id, input.orderId), inArray(orders.paymentStatus, PAYABLE)))
      .returning();
    if (!row) return undefined;

    const messages: Record<PaidOutcome, string> = {
      confirmed: `Payment ${input.razorpayPaymentId} received`,
      reverted_from_cod: `Online payment ${input.razorpayPaymentId} completed after the customer chose COD. Order is PREPAID now, so do not collect cash.`,
      paid_after_cancel: `Payment ${input.razorpayPaymentId} received for a CANCELLED order: refund it in Razorpay or reinstate the order`,
    };
    await tx
      .insert(orderEvents)
      .values({ orderId: row.id, type: "paid", message: messages[outcome], actor: input.actor });

    const stock =
      current.status === "pending_payment"
        ? await deductStock(tx, {
            orderId: row.id,
            orderNumber: row.orderNumber,
            items: await tx.select().from(orderItems).where(eq(orderItems.orderId, row.id)),
            actor: input.actor,
            allowOversell: true,
          })
        : noStockEffect();
    // The money is in, so the order stands even if its code was over its limit: tell the owner.
    if (current.status === "pending_payment" && row.couponCode) {
      const overuse = await discountOveruse(tx, row.couponCode, row.phone, { lock: false });
      if (overuse) {
        stock.alerts.push(
          `Order ${row.orderNumber} was paid online with a discount code that's over its limit (${overuse}). Decide whether to honour it.`,
        );
      }
    }
    return { row, outcome, stock };
  });
  if (!result) return null;
  return { order: (await withItems(result.row))!, outcome: result.outcome, stock: result.stock };
}

export async function recordOrderEvent(orderId: string, type: string, message: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.insert(orderEvents).values({ orderId, type, message: message.slice(0, 500), actor });
}

export async function recordPaymentFailure(orderId: string, detail: string): Promise<void> {
  await recordOrderEvent(orderId, "payment_failed", detail, "razorpay");
}

/**
 * Converts an unpaid online-payment order to Cash on Delivery, keeping the
 * original prices and adding the current COD fee, and takes its stock. Callers
 * must first make sure no online payment is in flight (see switchToCodSafely
 * in payments/flow.ts).
 */
export async function switchOrderToCod(
  orderId: string,
  actor: string,
): Promise<{ order: OrderWithItems; switched: boolean; stock: StockEffect }> {
  const order = await getOrderById(orderId);
  if (!order) throw new OrderError("Order not found.");
  if (!PAYABLE.includes(order.paymentStatus) || order.status !== "pending_payment") {
    return { order, switched: false, stock: noStockEffect() };
  }

  const db = await getDb();
  const updated = await db.transaction(async (tx) => {
    const settings = await readCheckoutSettings(tx);
    const total = prepaidAmount(order) + settings.codFee;
    if (total > settings.codMaxOrderValue) {
      throw new OrderError(`Cash on Delivery is available on orders up to ${formatPaise(settings.codMaxOrderValue)}.`);
    }
    await assertCodAllowed(tx, order.phone);

    const [row] = await tx
      .update(orders)
      .set({ paymentMethod: "cod", codFee: settings.codFee, total, status: "confirmed", confirmedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment"), inArray(orders.paymentStatus, PAYABLE)))
      .returning();
    if (!row) return undefined;
    await tx.insert(orderEvents).values({
      orderId: row.id,
      type: "switched_to_cod",
      message: "Switched to Cash on Delivery after online payment did not complete",
      actor,
    });
    const stock = await deductStock(tx, {
      orderId: row.id,
      orderNumber: row.orderNumber,
      items: order.items,
      actor,
      allowOversell: false,
    });
    // Nothing is paid yet, so a code that's over its limit can still be refused (lock order: order, packs, discount).
    if (row.couponCode) {
      const overuse = await discountOveruse(tx, row.couponCode, row.phone, { lock: true });
      if (overuse) {
        throw new OrderError(
          `This order can't switch to Cash on Delivery: its discount code ${overuse}. Please pay online, or place a new order without the code.`,
        );
      }
    }
    return { row, stock };
  });

  const result = await withItems(updated?.row);
  if (result && updated) return { order: result, switched: true, stock: updated.stock };
  return { order: (await getOrderById(orderId))!, switched: false, stock: noStockEffect() };
}

export type TrackedOrder = {
  orderNumber: string;
  status: Order["status"];
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  total: number;
  createdAt: Date;
  city: string;
  courierName: string | null;
  awbCode: string | null;
  trackingUrl: string | null;
  items: { name: string; qty: number; packCount: number }[];
};

/** Public tracking: needs both the order number and the phone on the order. */
export async function trackOrder(orderNumber: string, phone: string): Promise<TrackedOrder | null> {
  const db = await getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.phone, phone)))
    .limit(1);
  const full = await withItems(order);
  if (!full) return null;
  return {
    orderNumber: full.orderNumber,
    status: full.status,
    paymentMethod: full.paymentMethod,
    paymentStatus: full.paymentStatus,
    total: full.total,
    createdAt: full.createdAt,
    city: full.city,
    courierName: full.courierName,
    awbCode: full.awbCode,
    trackingUrl: full.trackingUrl,
    items: full.items.map((i) => ({ name: i.name, qty: i.qty, packCount: i.packCount })),
  };
}
