import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { adjustStock, createPack, deletePack, getPackAdmin, updatePack } from "@/lib/catalog/admin";
import { loadStorefront } from "@/lib/catalog/service";
import { listAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { inventoryMovements, orderItems, packs } from "@/lib/db/schema";
import { updateOrderStatus } from "@/lib/orders/admin";
import {
  attachRazorpayOrder,
  checkOrderStock,
  markOrderPaid,
  placeOrder,
  switchOrderToCod,
} from "@/lib/orders/service";
import { checkout, ctx, getPackRow, testPack } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

function enableRazorpay() {
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
}

describe("stock on COD orders", () => {
  it("takes tracked stock at placement and records the movement", async () => {
    const pack = await testPack({ trackInventory: true, stock: 12, lowStockThreshold: 10 });
    const { order, stock } = await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 3 }] }), ctx);
    expect((await getPackRow(pack.id)).stock).toBe(9);
    expect(order.items[0].stockDeducted).toBe(3);
    expect(stock.availabilityChanged).toBe(false);
    expect(stock.alerts.join()).toMatch(/Low stock.*9 left/);

    const db = await getDb();
    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.packId, pack.id));
    expect(moves).toEqual([expect.objectContaining({ delta: -3, stockAfter: 9, reason: "order", orderId: order.id })]);
  });

  it("refuses more than is in stock and reports when the last unit sells", async () => {
    const pack = await testPack({ trackInventory: true, stock: 2 });
    await expect(placeOrder(checkout({ lines: [{ packId: pack.id, qty: 3 }] }), ctx)).rejects.toThrow(/Only 2/);
    const { stock } = await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 2 }] }), ctx);
    expect(stock.availabilityChanged).toBe(true);
    expect(stock.alerts.join()).toMatch(/Out of stock/);
    await expect(placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx)).rejects.toThrow(/out of stock/);
  });

  it("never sells the last unit twice, even to simultaneous orders", async () => {
    const pack = await testPack({ trackInventory: true, stock: 1 });
    const results = await Promise.allSettled([
      placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx),
      placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getPackRow(pack.id)).stock).toBe(0);
  });

  it("leaves untracked packs alone", async () => {
    const pack = await testPack({ trackInventory: false, stock: 0 });
    const { order } = await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 4 }] }), ctx);
    expect(order.items[0].stockDeducted).toBe(0);
    expect((await getPackRow(pack.id)).stock).toBe(0);
  });

  it("treats hidden packs as no longer available", async () => {
    const pack = await testPack({ status: "hidden" });
    await expect(placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx)).rejects.toThrow(
      /no longer available/,
    );
  });
});

describe("restocking", () => {
  it("returns stock on cancel, exactly once", async () => {
    const pack = await testPack({ trackInventory: true, stock: 1 });
    const { order } = await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx);
    const effect = await updateOrderStatus(order.id, "cancelled", "owner@test", { reason: "Out of stock" });
    expect(effect.availabilityChanged).toBe(true);
    expect((await getPackRow(pack.id)).stock).toBe(1);
    const db = await getDb();
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(item.stockDeducted).toBe(0);
    await expect(updateOrderStatus(order.id, "cancelled", "owner@test")).rejects.toThrow();
    expect((await getPackRow(pack.id)).stock).toBe(1);
  });

  it("can cancel without restocking (e.g. stock already gone)", async () => {
    const pack = await testPack({ trackInventory: true, stock: 5 });
    const { order } = await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 2 }] }), ctx);
    await updateOrderStatus(order.id, "cancelled", "owner@test", { restock: false });
    expect((await getPackRow(pack.id)).stock).toBe(3);
  });

  it("returns stock when a shipment comes back (RTO)", async () => {
    const pack = await testPack({ trackInventory: true, stock: 5 });
    const { order } = await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 2 }] }), ctx);
    await updateOrderStatus(order.id, "shipped", "owner@test");
    await updateOrderStatus(order.id, "rto", "owner@test");
    expect((await getPackRow(pack.id)).stock).toBe(5);
    const db = await getDb();
    const back = await db
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.packId, pack.id), eq(inventoryMovements.reason, "returned")));
    expect(back).toHaveLength(1);
  });
});

describe("stock on online orders", () => {
  async function pendingOrder(packId: string, qty: number) {
    enableRazorpay();
    const { order } = await placeOrder(checkout({ paymentMethod: "prepaid", lines: [{ packId, qty }] }), ctx);
    await attachRazorpayOrder(order.id, `order_${randomUUID().replace(/-/g, "").slice(0, 14)}`);
    return order;
  }

  it("doesn't hold stock for an unpaid checkout, takes it on payment", async () => {
    const pack = await testPack({ trackInventory: true, stock: 4 });
    const order = await pendingOrder(pack.id, 3);
    expect((await getPackRow(pack.id)).stock).toBe(4);
    const paid = await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_1",
      amountPaise: order.total,
      actor: "razorpay",
    });
    expect(paid?.stock.alerts).toEqual([]);
    expect((await getPackRow(pack.id)).stock).toBe(1);
  });

  it("refuses an online order bigger than the stock", async () => {
    const pack = await testPack({ trackInventory: true, stock: 1 });
    enableRazorpay();
    await expect(
      placeOrder(checkout({ paymentMethod: "prepaid", lines: [{ packId: pack.id, qty: 2 }] }), ctx),
    ).rejects.toThrow(/Only 1/);
  });

  it("honours a payment that lands after the stock ran out, and alerts the owner", async () => {
    const pack = await testPack({ trackInventory: true, stock: 1 });
    const order = await pendingOrder(pack.id, 1);
    await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx); // a COD order takes the last unit
    await expect(checkOrderStock(order)).rejects.toThrow(/out of stock/); // a retry would be refused…
    const paid = await markOrderPaid({
      orderId: order.id,
      razorpayPaymentId: "pay_2",
      amountPaise: order.total,
      actor: "razorpay",
    });
    expect(paid?.order.status).toBe("confirmed"); // …but money already taken must stand
    expect(paid?.stock.alerts.join()).toMatch(/Oversold/);
    expect((await getPackRow(pack.id)).stock).toBe(-1);
  });

  it("takes stock when an unpaid order switches to COD, and refuses if it sold out", async () => {
    const pack = await testPack({ trackInventory: true, stock: 2 });
    const a = await pendingOrder(pack.id, 1);
    const switched = await switchOrderToCod(a.id, "customer");
    expect(switched.switched).toBe(true);
    expect((await getPackRow(pack.id)).stock).toBe(1);

    const b = await pendingOrder(pack.id, 1);
    await placeOrder(checkout({ lines: [{ packId: pack.id, qty: 1 }] }), ctx);
    await expect(switchOrderToCod(b.id, "customer")).rejects.toThrow(/out of stock/);
  });
});

describe("products admin", () => {
  it("adds a pack with an id from its size and opening stock", async () => {
    const id = await createPack(
      {
        name: "Jumbo",
        sku: `HT-T-${randomUUID().slice(0, 6)}`,
        count: 137,
        price: 150000,
        mrp: 300000,
        badge: null,
        blurb: "",
        weightGrams: 2000,
        position: 9,
        status: "hidden",
        trackInventory: true,
        lowStockThreshold: 5,
        stock: 40,
      },
      "owner@test",
    );
    expect(id).toBe("pack-137");
    const again = await createPack(
      {
        name: "Jumbo 2",
        sku: `HT-T-${randomUUID().slice(0, 6)}`,
        count: 137,
        price: 150000,
        mrp: 300000,
        badge: null,
        blurb: "",
        weightGrams: 2000,
        position: 10,
        status: "hidden",
        trackInventory: false,
        lowStockThreshold: 5,
        stock: 0,
      },
      "owner@test",
    );
    expect(again).toBe("pack-137-2");
    const detail = await getPackAdmin(id);
    expect(detail?.pack.stock).toBe(40);
    expect(detail?.movements[0]).toMatchObject({ delta: 40, reason: "received" });
  });

  it("refuses a duplicate SKU with a clear message", async () => {
    const pack = await testPack();
    await expect(
      createPack(
        {
          name: "Dup",
          sku: pack.sku,
          count: 999,
          price: 100,
          mrp: 100,
          badge: null,
          blurb: "",
          weightGrams: 1,
          position: 1,
          status: "hidden",
          trackInventory: false,
          lowStockThreshold: 1,
          stock: 0,
        },
        "owner@test",
      ),
    ).rejects.toThrow(/already uses this SKU/);
  });

  it("saves edits with an audit trail and guards against a stale stock count", async () => {
    const pack = await testPack({ trackInventory: true, stock: 10 });
    const base = {
      name: pack.name,
      sku: pack.sku,
      count: pack.count,
      price: 32000,
      mrp: pack.mrp,
      badge: "Best value",
      blurb: pack.blurb,
      weightGrams: pack.weightGrams,
      position: pack.position,
      status: pack.status,
      trackInventory: true,
      lowStockThreshold: pack.lowStockThreshold,
    };
    await updatePack(pack.id, { ...base, stock: { expected: 10, value: 25 } }, "owner@test");
    const after = await getPackRow(pack.id);
    expect(after).toMatchObject({ price: 32000, badge: "Best value", stock: 25 });
    const audit = await listAudit({ entityType: "pack", entityId: pack.id });
    expect(audit.rows[0].summary).toMatch(/price ₹300 → ₹320.*stock 10 → 25/);

    // Someone else's order changed the count after the form loaded.
    await expect(updatePack(pack.id, { ...base, stock: { expected: 10, value: 30 } }, "owner@test")).rejects.toThrow(
      /Stock changed to 25/,
    );
  });

  it("has the database refuse a selling price above MRP", async () => {
    const pack = await testPack();
    const db = await getDb();
    await expect(
      db
        .update(packs)
        .set({ price: pack.mrp + 1 })
        .where(eq(packs.id, pack.id)),
    ).rejects.toThrow();
  });

  it("adjusts stock with a reason", async () => {
    const pack = await testPack({ trackInventory: true, stock: 3 });
    expect((await adjustStock(pack.id, { delta: 50, reason: "received", note: "Batch 2" }, "staff@test")).stock).toBe(
      53,
    );
    expect((await adjustStock(pack.id, { delta: -2, reason: "damaged", note: null }, "staff@test")).stock).toBe(51);
    await expect(adjustStock(pack.id, { delta: 0, reason: "correction", note: null }, "staff@test")).rejects.toThrow();
    const detail = await getPackAdmin(pack.id);
    expect(detail?.movements.map((m) => m.reason)).toEqual(["damaged", "received"]);
  });

  it("only deletes packs that were never ordered", async () => {
    const used = await testPack();
    await placeOrder(checkout({ lines: [{ packId: used.id, qty: 1 }] }), ctx);
    await expect(deletePack(used.id, "owner@test")).rejects.toThrow(/Hide it instead/);
    const unused = await testPack();
    await deletePack(unused.id, "owner@test");
    expect(await getPackRow(unused.id)).toBeUndefined();
  });
});

describe("storefront catalogue", () => {
  it("lists visible packs of the product in order, with availability and a sensible default", async () => {
    const db = await getDb();
    const before = await loadStorefront();
    expect(before.packs.map((p) => p.id)).toEqual(["pack-10", "pack-25", "pack-50"]);
    expect(before.defaultPackId).toBe("pack-25");
    expect(before.codFee).toBe(4900);
    expect(JSON.stringify(before)).not.toMatch(/stock|lowStock|weight/);

    // The preferred pack sells out → the next available pack is pre-selected.
    await db.update(packs).set({ trackInventory: true, stock: 0 }).where(eq(packs.id, "pack-25"));
    try {
      const soldOut = await loadStorefront();
      expect(soldOut.packs.find((p) => p.id === "pack-25")?.available).toBe(false);
      expect(soldOut.defaultPackId).toBe("pack-10");
      await db.update(packs).set({ status: "hidden" }).where(eq(packs.id, "pack-10"));
      expect((await loadStorefront()).packs.map((p) => p.id)).toEqual(["pack-25", "pack-50"]);
    } finally {
      await db.update(packs).set({ trackInventory: false, status: "active" }).where(eq(packs.id, "pack-25"));
      await db.update(packs).set({ status: "active" }).where(eq(packs.id, "pack-10"));
    }
  });
});
