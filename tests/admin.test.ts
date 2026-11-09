import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { adminSearch } from "@/lib/admin-search";
import { getSalesReport } from "@/lib/analytics/reports";
import { listAudit } from "@/lib/audit";
import { createStaff, generateTempPassword, listStaff, resetStaffPassword, updateStaff } from "@/lib/auth/staff";
import type { SessionUser } from "@/lib/auth/session";
import { loadStorefront } from "@/lib/catalog/service";
import { getCustomerDetail, listCustomers, updateCustomer } from "@/lib/customers/admin";
import { startOfIndianDay, addDays } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { adminSessions, adminUsers, customers, orders } from "@/lib/db/schema";
import {
  createDiscount,
  deleteDiscount,
  describeDiscount,
  getDiscountAdmin,
  listDiscountsAdmin,
  setDiscountActive,
  updateDiscount,
  type DiscountInput,
} from "@/lib/discounts/admin";
import { findDiscountForPreview } from "@/lib/discounts/service";
import {
  addOrderComment,
  bulkOrderAction,
  getOrderDetail,
  listAbandonedCheckouts,
  listOrders,
  recordRefund,
  setOrderTags,
  updateOrderContact,
  updateOrderStatus,
  verifyCod,
} from "@/lib/orders/admin";
import { createManualOrder, type ManualOrderInput } from "@/lib/orders/manual";
import { placeOrder, PriceChangedError } from "@/lib/orders/service";
import { verifyPassword } from "@/lib/security/password";
import { updateCheckoutSettings } from "@/lib/settings";
import { parseTags } from "@/lib/tags";
import { checkout, ctx, getPackRow, randomPhone, SEED, testPack } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

const code = () => `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

function discount(overrides: Partial<DiscountInput> = {}): DiscountInput {
  return {
    code: code(),
    description: "Test offer",
    type: "flat",
    value: 5000,
    minOrder: 0,
    maxDiscount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    oncePerCustomer: false,
    active: true,
    ...overrides,
  };
}

describe("discounts", () => {
  it("applies a database code at checkout, case-insensitively", async () => {
    const d = discount();
    await createDiscount({ ...d, code: d.code.toLowerCase() }, "owner@test");
    const preview = await findDiscountForPreview(d.code.toLowerCase());
    expect(preview.ok && preview.coupon.code).toBe(d.code);
    const { order } = await placeOrder(checkout({ couponCode: d.code.toLowerCase() }), ctx);
    expect(order.couponCode).toBe(d.code);
    expect(order.discount).toBe(5000);
    expect(order.total).toBe(SEED.pack25.price - 5000 + SEED.codFee);
  });

  it("explains why a code can't be used", async () => {
    const scheduled = discount({ startsAt: addDays(new Date(), 2) });
    const expired = discount({ endsAt: addDays(new Date(), -1) });
    const disabled = discount({ active: false });
    for (const d of [scheduled, expired, disabled]) await createDiscount(d, "owner@test");
    expect(await findDiscountForPreview(scheduled.code)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/starts on/),
    });
    expect(await findDiscountForPreview(expired.code)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/expired/),
    });
    expect(await findDiscountForPreview(disabled.code)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not valid/),
    });
    await expect(placeOrder(checkout({ couponCode: expired.code }), ctx)).rejects.toThrow(/expired/);
  });

  it("counts uses only for orders that went through, and frees a use on cancel", async () => {
    const d = discount({ usageLimit: 1 });
    await createDiscount(d, "owner@test");
    // An unpaid online checkout doesn't use it up.
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
    await placeOrder(checkout({ couponCode: d.code, paymentMethod: "prepaid" }), ctx);
    const first = await placeOrder(checkout({ couponCode: d.code }), ctx);
    expect((await findDiscountForPreview(d.code)).ok).toBe(false);
    await expect(placeOrder(checkout({ couponCode: d.code }), ctx)).rejects.toThrow(/fully used/);
    await updateOrderStatus(first.order.id, "cancelled", "owner@test", { reason: "Customer asked to cancel" });
    expect((await findDiscountForPreview(d.code)).ok).toBe(true);
  });

  it("limits a code to one order per phone number when asked", async () => {
    const d = discount({ oncePerCustomer: true });
    await createDiscount(d, "owner@test");
    const phone = randomPhone();
    await placeOrder(checkout({ couponCode: d.code, phone }), ctx);
    await expect(placeOrder(checkout({ couponCode: d.code, phone }), ctx)).rejects.toThrow(/already used/);
    await placeOrder(checkout({ couponCode: d.code }), ctx); // someone else can
  });

  it("caps percent codes and shows them in plain words", async () => {
    const d = discount({ type: "percent", value: 20, maxDiscount: 10000, minOrder: 50000 });
    expect(describeDiscount(d)).toBe("20% off, up to ₹100, on orders of ₹500 or more");
    await createDiscount(d, "owner@test");
    const { order } = await placeOrder(checkout({ couponCode: d.code, lines: [{ packId: "pack-50", qty: 1 }] }), ctx);
    expect(order.discount).toBe(10000); // 20% of ₹899 = ₹179.80, capped at ₹100
  });

  it("reports uses and revenue, and protects used codes", async () => {
    const d = discount();
    const id = await createDiscount(d, "owner@test");
    await expect(createDiscount(d, "owner@test")).rejects.toThrow(/already exists/);
    await placeOrder(checkout({ couponCode: d.code }), ctx);

    const detail = await getDiscountAdmin(id);
    expect(detail).toMatchObject({ uses: 1, state: "active", discounted: 5000 });
    const listed = (await listDiscountsAdmin()).find((r) => r.discount.id === id);
    expect(listed?.uses).toBe(1);

    await expect(updateDiscount(id, { ...d, code: code() }, "owner@test")).rejects.toThrow(/can't be renamed/);
    await expect(deleteDiscount(id, "owner@test")).rejects.toThrow(/Disable it instead/);
    await setDiscountActive(id, false, "owner@test");
    expect((await getDiscountAdmin(id))?.state).toBe("disabled");

    const unused = await createDiscount(discount(), "owner@test");
    await deleteDiscount(unused, "owner@test");
    expect(await getDiscountAdmin(unused)).toBeNull();
    const audit = await listAudit({ entityType: "discount" });
    expect(audit.rows.some((r) => r.action === "discount.deleted")).toBe(true);
  });

  it("refuses an end date before the start date", async () => {
    await expect(
      createDiscount(discount({ startsAt: new Date(), endsAt: addDays(new Date(), -1) }), "owner@test"),
    ).rejects.toThrow(/end date/);
  });
});

function manual(overrides: Partial<ManualOrderInput> = {}): ManualOrderInput {
  return {
    key: randomUUID(),
    lines: [{ packId: SEED.pack25.id, qty: 1 }],
    customerName: "Phone Customer",
    phone: randomPhone(),
    email: null,
    address1: "22 Market Road",
    address2: null,
    landmark: null,
    city: "Indore",
    state: "Madhya Pradesh",
    pincode: "452001",
    payment: "cod",
    paymentReference: null,
    manualDiscount: 0,
    waiveCodFee: false,
    note: null,
    tags: [],
    ...overrides,
  };
}

describe("manual orders (created by staff)", () => {
  it("creates a confirmed COD order once, even if the form is submitted twice", async () => {
    const input = manual({ tags: ["whatsapp"], note: "Called at 4pm" });
    const first = await createManualOrder(input, "staff@test");
    const second = await createManualOrder(input, "staff@test");
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(first.order).toMatchObject({
      status: "confirmed",
      source: "admin",
      paymentMethod: "cod",
      paymentStatus: "unpaid",
      total: SEED.pack25.price + SEED.codFee,
      tags: ["whatsapp"],
      adminNotes: "Called at 4pm",
    });
    expect(first.order.customerId).toBeTruthy();
  });

  it("allows bulk quantities, hidden packs, a manual discount and a waived COD fee", async () => {
    const hidden = await testPack({ status: "hidden", trackInventory: true, stock: 100, price: 20000, mrp: 20000 });
    const { order } = await createManualOrder(
      manual({ lines: [{ packId: hidden.id, qty: 40 }], manualDiscount: 50000, waiveCodFee: true }),
      "staff@test",
    );
    expect(order.subtotal).toBe(800000);
    expect(order.discount).toBe(50000);
    expect(order.codFee).toBe(0);
    expect(order.total).toBe(750000); // above the ₹3,000 COD cap: allowed for staff
    expect((await getPackRow(hidden.id)).stock).toBe(60);
  });

  it("records an order paid by UPI with its reference", async () => {
    const { order } = await createManualOrder(manual({ payment: "paid", paymentReference: "UPI 4471" }), "staff@test");
    expect(order).toMatchObject({
      paymentMethod: "prepaid",
      paymentStatus: "paid",
      codFee: 0,
      paymentReference: "UPI 4471",
    });
    expect(order.paidAt).toBeInstanceOf(Date);
  });

  it("still enforces stock, COD blocks and the total the form showed", async () => {
    const pack = await testPack({ trackInventory: true, stock: 2 });
    await expect(createManualOrder(manual({ lines: [{ packId: pack.id, qty: 3 }] }), "staff@test")).rejects.toThrow(
      /Only 2/,
    );
    await expect(createManualOrder(manual({ expectedTotal: 1 }), "staff@test")).rejects.toBeInstanceOf(
      PriceChangedError,
    );

    const phone = randomPhone();
    await createManualOrder(manual({ phone }), "staff@test");
    const db = await getDb();
    await db.update(customers).set({ codBlocked: true }).where(eq(customers.phone, phone));
    await expect(createManualOrder(manual({ phone }), "staff@test")).rejects.toThrow(/isn't available/);
    await createManualOrder(manual({ phone, payment: "paid" }), "staff@test");
  });
});

describe("order operations", () => {
  it("verifies COD orders, adds comments and tags, and filters by them", async () => {
    const { order } = await placeOrder(checkout(), ctx);
    expect((await listOrders({ status: "to_verify" })).rows.map((r) => r.id)).toContain(order.id);
    await verifyCod(order.id, "staff@test", "Spoke to her husband");
    await verifyCod(order.id, "staff@test"); // idempotent
    expect((await listOrders({ status: "to_verify" })).rows.map((r) => r.id)).not.toContain(order.id);

    await addOrderComment(order.id, "Wants delivery after 6pm", "staff@test");
    const tags = parseTags("VIP,  repeat buyer, vip");
    expect(tags.tags).toEqual(["vip", "repeat buyer"]);
    await setOrderTags(order.id, tags.tags!, "staff@test");
    expect((await listOrders({ tag: "VIP" })).rows.map((r) => r.id)).toContain(order.id);

    const detail = await getOrderDetail(order.id);
    expect(detail?.events.map((e) => e.type)).toEqual(["created", "cod_verified", "comment", "tags"]);
    expect(detail?.customer?.orders).toBe(1);
  });

  it("rejects bad tags", () => {
    expect(parseTags("ok, <script>").error).toMatch(/letters/);
    expect(parseTags("a".repeat(31)).error).toMatch(/at most/);
  });

  it("edits the address and moves the order to the new phone's customer", async () => {
    const { order } = await placeOrder(checkout(), ctx);
    const phone = randomPhone();
    await updateOrderContact(
      order.id,
      {
        customerName: "Priya S",
        phone,
        email: "p@example.com",
        address1: "New flat 5",
        address2: null,
        landmark: "Near park",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
      "staff@test",
    );
    const detail = await getOrderDetail(order.id);
    expect(detail?.order).toMatchObject({ phone, city: "Mumbai", landmark: "Near park" });
    const db = await getDb();
    const [customer] = await db.select().from(customers).where(eq(customers.phone, phone));
    expect(detail?.order.customerId).toBe(customer.id);
    expect(detail?.events.at(-1)?.message).toMatch(/name, phone, email, address, landmark, city, pincode/);

    await updateOrderStatus(order.id, "shipped", "staff@test");
    await expect(updateOrderContact(order.id, { ...detail!.order, city: "Pune" }, "staff@test")).rejects.toThrow(
      /after the order has shipped/,
    );
  });

  it("records partial and full refunds and never more than was paid", async () => {
    const { order } = await createManualOrder(manual({ payment: "paid" }), "owner@test");
    await recordRefund(order.id, { amount: 10000, reason: "One sponge damaged", reference: "rfnd_1" }, "owner@test");
    let detail = await getOrderDetail(order.id);
    expect(detail?.order).toMatchObject({ refundedAmount: 10000, paymentStatus: "paid" });
    await expect(recordRefund(order.id, { amount: order.total, reason: "x" }, "owner@test")).rejects.toThrow(/at most/);
    const { fullyRefunded } = await recordRefund(
      order.id,
      { amount: order.total - 10000, reason: "Returned" },
      "owner@test",
    );
    expect(fullyRefunded).toBe(true);
    detail = await getOrderDetail(order.id);
    expect(detail?.order.paymentStatus).toBe("refunded");
    expect(detail?.refunds).toHaveLength(2);
    expect((await listOrders({ paymentStatus: "refunded" })).rows.map((r) => r.id)).toContain(order.id);
  });

  it("refunds a delivered COD order (paid in cash)", async () => {
    const { order } = await placeOrder(checkout(), ctx);
    await updateOrderStatus(order.id, "shipped", "owner@test");
    await updateOrderStatus(order.id, "delivered", "owner@test");
    await recordRefund(order.id, { amount: 5000, reason: "Goodwill", reference: null }, "owner@test");
    expect((await listOrders({ paymentStatus: "partially_refunded" })).rows.map((r) => r.id)).toContain(order.id);
  });

  it("applies bulk actions order by order, skipping ones that don't qualify", async () => {
    const a = await placeOrder(checkout(), ctx);
    const b = await placeOrder(checkout(), ctx);
    await updateOrderStatus(b.order.id, "shipped", "owner@test");
    const packed = await bulkOrderAction([a.order.id, b.order.id], "mark_packed", "staff@test");
    expect(packed.done).toBe(1);
    expect(packed.skipped).toEqual([{ orderNumber: b.order.orderNumber, reason: "is shipped" }]);

    const tagged = await bulkOrderAction([a.order.id, b.order.id], "add_tag", "staff@test", { tag: "batch-1" });
    expect(tagged.done).toBe(2);
    expect((await listOrders({ tag: "batch-1" })).total).toBeGreaterThanOrEqual(2);
    const untagged = await bulkOrderAction([a.order.id], "remove_tag", "staff@test", { tag: "batch-1" });
    expect(untagged.done).toBe(1);
  });

  it("lists abandoned checkouts and lets them be cancelled in bulk", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
    const { order } = await placeOrder(checkout({ paymentMethod: "prepaid" }), ctx);
    expect((await listAbandonedCheckouts()).rows.map((r) => r.id)).not.toContain(order.id); // may still be paying
    const db = await getDb();
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(orders.id, order.id));
    const listed = (await listAbandonedCheckouts()).rows.find((r) => r.id === order.id);
    expect(listed).toMatchObject({ items: 1, reminders: 0 });

    const result = await bulkOrderAction([order.id], "cancel_unpaid", "staff@test");
    expect(result.done).toBe(1);
    expect((await getOrderDetail(order.id))?.order).toMatchObject({
      status: "cancelled",
      cancelReason: "Payment not completed",
    });
  });

  it("filters by payment, source, date and sorts", async () => {
    const { order } = await createManualOrder(manual({ payment: "paid" }), "owner@test");
    const today = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
    const found = await listOrders({ source: "admin", payment: "prepaid", from: today, to: today, sort: "total_desc" });
    expect(found.rows.map((r) => r.id)).toContain(order.id);
    const totals = found.rows.map((r) => r.total);
    expect(totals).toEqual([...totals].sort((x, y) => y - x));
    expect((await listOrders({ source: "admin", from: "2000-01-01", to: "2000-01-02" })).total).toBe(0);
  });
});

describe("customers", () => {
  it("adds up lifetime numbers from orders and filters", async () => {
    const phone = randomPhone();
    const a = await placeOrder(checkout({ phone, name: "Lifetime Lata" }), ctx);
    const b = await placeOrder(checkout({ phone }), ctx);
    await updateOrderStatus(b.order.id, "shipped", "owner@test");
    await updateOrderStatus(b.order.id, "rto", "owner@test");

    const { rows } = await listCustomers({ q: phone });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Lifetime Lata", orders: 2, spent: a.order.total, rto: 1 });
    expect(rows[0].lastOrderAt).toBeInstanceOf(Date);
    expect((await listCustomers({ filter: "rto", q: phone })).rows).toHaveLength(1);
    expect((await listCustomers({ filter: "repeat", q: phone })).rows).toHaveLength(1);
    expect((await listCustomers({ filter: "checkout_only", q: phone })).rows).toHaveLength(0);

    const detail = await getCustomerDetail(rows[0].id);
    expect(detail?.stats).toMatchObject({ orders: 2, delivered: 0, rto: 1, rtoRate: 100, cod: 2 });
    expect(detail?.addresses).toHaveLength(1);
  });

  it("saves notes, tags and a COD block with an audit entry", async () => {
    const data = checkout();
    const { order } = await placeOrder(data, ctx);
    const id = order.customerId!;
    await updateCustomer(
      id,
      { name: "Ravi K", email: null, notes: "Refused twice", tags: ["risky"], codBlocked: true },
      "owner@test",
    );
    expect((await listCustomers({ filter: "cod_blocked", q: data.phone })).rows).toHaveLength(1);
    const audit = await listAudit({ entityType: "customer", entityId: id });
    expect(audit.rows[0].summary).toMatch(/name → Ravi K.*COD blocked/);
    expect((await listCustomers({ tag: "risky" })).rows.map((r) => r.id)).toContain(id);
  });

  it("paginates the total correctly with filters on aggregates", async () => {
    const result = await listCustomers({ filter: "repeat" });
    expect(result.total).toBeGreaterThanOrEqual(result.rows.length);
  });
});

describe("settings", () => {
  it("changes the COD charge for new orders and the storefront, within limits", async () => {
    try {
      await updateCheckoutSettings({ codFee: 2900, codMaxOrderValue: 250000 }, "owner@test");
      expect((await loadStorefront()).codFee).toBe(2900);
      const { order } = await placeOrder(checkout(), ctx);
      expect(order.codFee).toBe(2900);
      await expect(updateCheckoutSettings({ codFee: 60000, codMaxOrderValue: 250000 }, "owner@test")).rejects.toThrow(
        /between/,
      );
      expect((await listAudit({ entityType: "settings" })).rows[0].summary).toMatch(/COD charge ₹49 → ₹29/);
    } finally {
      await updateCheckoutSettings({ codFee: SEED.codFee, codMaxOrderValue: SEED.codMaxOrderValue }, "owner@test");
    }
  });
});

describe("staff", () => {
  async function owner(): Promise<SessionUser> {
    const db = await getDb();
    const [row] = await db
      .insert(adminUsers)
      .values({ email: `owner-${randomUUID()}@test.in`, name: "Owner", passwordHash: "x", role: "owner" })
      .returning();
    return { id: row.id, email: row.email, name: row.name, role: "owner", mustChangePassword: false };
  }

  it("makes readable one-time passwords", () => {
    expect(generateTempPassword()).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });

  it("adds staff with a one-time password they must change", async () => {
    const me = await owner();
    const email = `staff-${randomUUID()}@test.in`;
    const { id, tempPassword } = await createStaff({ name: "Packer", email, role: "staff" }, me);
    const db = await getDb();
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(tempPassword, row.passwordHash)).toBe(true);
    await expect(createStaff({ name: "Dup", email, role: "staff" }, me)).rejects.toThrow(/already has this email/);
    expect((await listStaff()).some((s) => s.id === id)).toBe(true);
  });

  it("never leaves the store without an active owner, and ends sessions on deactivation", async () => {
    const me = await owner();
    await expect(updateStaff(me.id, { name: "Owner", role: "staff", active: true }, me)).rejects.toThrow(
      /your own role/,
    );

    const other = await owner();
    const db = await getDb();
    await db.insert(adminSessions).values({ id: randomUUID(), userId: other.id, expiresAt: addDays(new Date(), 1) });
    await updateStaff(other.id, { name: "Other", role: "owner", active: false }, me);
    expect(await db.select().from(adminSessions).where(eq(adminSessions.userId, other.id))).toHaveLength(0);

    // Deactivate every other owner, then try to remove the last one via someone else.
    const owners = await db.select().from(adminUsers).where(eq(adminUsers.role, "owner"));
    for (const o of owners)
      if (o.id !== me.id) await db.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, o.id));
    const helper = await owner();
    await expect(updateStaff(me.id, { name: "Owner", role: "staff", active: true }, helper)).resolves.toBeUndefined();
    await expect(
      updateStaff(helper.id, { name: "Owner", role: "staff", active: true }, { ...helper, id: randomUUID() }),
    ).rejects.toThrow(/at least one active owner/);
  });

  it("resets a password, signs the person out and audits it", async () => {
    const me = await owner();
    const { id } = await createStaff({ name: "Reset Me", email: `r-${randomUUID()}@test.in`, role: "staff" }, me);
    const { tempPassword } = await resetStaffPassword(id, me);
    const db = await getDb();
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    expect(await verifyPassword(tempPassword, row.passwordHash)).toBe(true);
    await expect(resetStaffPassword(me.id, me)).rejects.toThrow(/Account/);
    expect((await listAudit({ entityType: "staff", entityId: id })).rows.map((r) => r.action)).toContain(
      "staff.password_reset",
    );
  });
});

describe("reports and search", () => {
  it("reports sales, payment outcomes and new vs returning customers", async () => {
    const phone = randomPhone();
    const a = await placeOrder(
      checkout({ phone, attribution: { utmSource: "instagram", utmCampaign: "diwali" } }),
      ctx,
    );
    await updateOrderStatus(a.order.id, "shipped", "owner@test");
    await updateOrderStatus(a.order.id, "delivered", "owner@test");
    const range = { from: startOfIndianDay(6), to: addDays(startOfIndianDay(0), 1), days: 7 };
    const report = await getSalesReport(range);
    expect(report.series).toHaveLength(7);
    expect(report.current.orders).toBeGreaterThan(0);
    expect(report.current.net).toBe(report.series.reduce((s, d) => s + d.net, 0));
    expect(report.byPack.length).toBeGreaterThan(0);
    expect(report.outcomes.cod.delivered).toBeGreaterThan(0);
    expect(report.bySource.find((s) => s.source === "instagram")?.campaign).toBe("diwali");
    expect(report.customers.total).toBeGreaterThan(0);
    expect(report.customers.new + report.customers.returning).toBe(report.customers.total);
  });

  it("uses monthly buckets for long ranges", async () => {
    const report = await getSalesReport({
      from: startOfIndianDay(179),
      to: addDays(startOfIndianDay(0), 1),
      days: 180,
    });
    expect(report.monthly).toBe(true);
    expect(report.series.length).toBeGreaterThanOrEqual(6);
    expect(report.series.length).toBeLessThanOrEqual(7);
  });

  it("finds orders, customers, packs and codes from one box", async () => {
    const data = checkout({ name: "Zebediah Quill" });
    const { order } = await placeOrder(data, ctx);
    const d = discount();
    await createDiscount(d, "owner@test");
    expect((await adminSearch(order.orderNumber))?.orders.map((o) => o.id)).toContain(order.id);
    expect((await adminSearch("Zebediah"))?.customers.length).toBeGreaterThan(0);
    expect((await adminSearch(data.phone.slice(-6)))?.customers.length).toBeGreaterThan(0);
    expect((await adminSearch("HT-SPONGE-25"))?.packs.map((p) => p.id)).toContain("pack-25");
    expect((await adminSearch(d.code))?.discounts).toHaveLength(1);
    expect(await adminSearch("a")).toBeNull();
  });
});
