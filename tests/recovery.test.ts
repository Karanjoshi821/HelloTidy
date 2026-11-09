import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cartLeads } from "@/lib/db/schema";
import { recoveryConfig } from "@/lib/env";
import { OrderError, placeOrder } from "@/lib/orders/service";
import { authorizeRecovery } from "@/lib/recovery/api";
import {
  claimLeadForCall,
  getLeadView,
  indiaHour,
  issueRecoveryCoupon,
  recordCallResult,
  recoveryCheckoutLink,
  saveCartLead,
  withdrawCartLead,
  type RecoveryConfig,
} from "@/lib/recovery/service";
import { cartLeadSchema } from "@/lib/validation";
import { checkout, ctx, randomPhone, SEED } from "./helpers";

function config(): RecoveryConfig {
  vi.stubEnv("RECOVERY_API_KEY", "test-recovery-key");
  vi.stubEnv("RECOVERY_MAX_DISCOUNT_PERCENT", "10");
  return recoveryConfig()!;
}

/** Today at the given hour and minute in India (UTC+5:30). */
function indiaTime(hour: number, minute = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute) - 330 * 60_000);
}

function lead(overrides: Partial<Record<string, unknown>> = {}) {
  return cartLeadSchema.parse({
    clientKey: randomUUID(),
    name: "Amit Kumar",
    phone: randomPhone(),
    lines: [{ packId: SEED.pack25.id, qty: 2 }],
    ...overrides,
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("saving carts from checkout", () => {
  it("prices the cart from the database and asks for the automation once", async () => {
    const data = lead();
    const first = await saveCartLead(data);
    expect(first.shouldNotify).toBe(true);
    expect(first.lead?.subtotal).toBe(SEED.pack25.price * 2);
    expect(first.lead?.itemsSummary).toBe("Home Pack (25 sponges) × 2");
    expect(first.lead?.status).toBe("open");

    // Typing a corrected number updates the same lead.
    const phone = randomPhone();
    const second = await saveCartLead({ ...data, phone });
    expect(second.lead?.id).toBe(first.lead?.id);
    expect(second.lead?.phone).toBe(phone);

    const db = await getDb();
    await db.update(cartLeads).set({ notifiedAt: new Date() }).where(eq(cartLeads.id, first.lead!.id));
    const third = await saveCartLead({ ...data, phone });
    expect(third.shouldNotify).toBe(false);
  });

  it("ignores carts that can't be priced", async () => {
    const result = await saveCartLead(lead({ lines: [{ packId: "pack-nope", qty: 1 }] }));
    expect(result.lead).toBeNull();
  });

  it("closes the lead when consent is withdrawn and reopens it when given again", async () => {
    const data = lead();
    const { lead: saved } = await saveCartLead(data);
    await withdrawCartLead(data.clientKey);
    const view = await getLeadView(saved!.id, config());
    expect(view?.status).toBe("closed");
    expect(view?.reason).toBe("closed");

    const again = await saveCartLead(data);
    expect(again.lead?.status).toBe("open");
    expect(again.shouldNotify).toBe(true);
  });

  it("never stores a number that asked not to be called", async () => {
    const cfg = config();
    const phone = randomPhone();
    const { lead: saved } = await saveCartLead(lead({ phone }));
    await recordCallResult(saved!.id, { outcome: "opted_out" }, cfg);
    const next = await saveCartLead(lead({ phone }));
    expect(next.lead).toBeNull();
  });
});

describe("deciding whether to call", () => {
  it("claims an open lead once, inside calling hours", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    const at = indiaTime(11, 30);
    expect(indiaHour(at)).toBe(11);

    const claim = await claimLeadForCall(saved!.id, cfg, at);
    expect(claim?.eligible).toBe(true);
    expect(claim?.callAttempts).toBe(1);
    expect(claim?.phoneE164).toBe(`+91${saved!.phone}`);
    expect(claim?.maxDiscountPercent).toBe(10);

    // A second claim while the first call may still be ringing is refused.
    const again = await claimLeadForCall(saved!.id, cfg, new Date(at.getTime() + 60_000));
    expect(again?.eligible).toBe(false);
    expect(again?.reason).toBe("call_in_progress");
    expect(again?.callAttempts).toBe(1);
  });

  it("never calls outside the allowed hours", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    const night = await claimLeadForCall(saved!.id, cfg, indiaTime(21, 15));
    expect(night?.reason).toBe("quiet_hours");
    const early = await claimLeadForCall(saved!.id, cfg, indiaTime(8, 59));
    expect(early?.reason).toBe("quiet_hours");
    expect(early?.callAttempts).toBe(0);
  });

  it("stops once the customer orders", async () => {
    const cfg = config();
    const phone = randomPhone();
    const { lead: saved } = await saveCartLead(lead({ phone }));
    await placeOrder(checkout({ phone }), ctx);
    const view = await getLeadView(saved!.id, cfg, indiaTime(12));
    expect(view?.status).toBe("converted");
    expect(view?.eligible).toBe(false);
    expect(view?.reason).toBe("converted");
  });

  it("allows another attempt after no answer, up to the limit", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    await claimLeadForCall(saved!.id, cfg, indiaTime(11));
    const afterFirst = await recordCallResult(saved!.id, { outcome: "no_answer" }, cfg);
    expect(afterFirst.status).toBe("open");
    expect(afterFirst.lastCallAt).toBeNull();

    await claimLeadForCall(saved!.id, cfg, indiaTime(13));
    const afterSecond = await recordCallResult(saved!.id, { outcome: "busy" }, cfg);
    expect(afterSecond.status).toBe("closed");
  });

  it("keeps the agent's promise to call back later, within the attempt limit", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    await claimLeadForCall(saved!.id, cfg, indiaTime(11));
    const result = await recordCallResult(saved!.id, { outcome: "callback_later", summary: "In a meeting." }, cfg);
    expect(result.status).toBe("open");
    expect(result.lastCallAt).toBeNull();
    const later = await claimLeadForCall(saved!.id, cfg, indiaTime(13));
    expect(later?.eligible).toBe(true);
    expect(later?.callAttempts).toBe(2);
  });

  it("marks a lead called after a conversation, and keeps the agent's summary", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    await claimLeadForCall(saved!.id, cfg, indiaTime(11));
    const result = await recordCallResult(
      saved!.id,
      { outcome: "will_order", summary: "Price felt high; took 10% and will order tonight." },
      cfg,
    );
    expect(result.status).toBe("called");
    const view = await getLeadView(saved!.id, cfg, indiaTime(11, 30));
    expect(view?.reason).toBe("already_called");
    expect(view?.callSummary).toContain("10%");
  });
});

describe("recovery discount codes", () => {
  it("caps the percent, reuses the code and links back to the cart", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    const coupon = await issueRecoveryCoupon(saved!.id, 30, cfg);
    expect(coupon.percent).toBe(10);
    expect(coupon.code).toMatch(/^HELLO\d{4}$/);
    expect(coupon.spoken).toBe(coupon.code.split("").join(" "));
    expect(coupon.checkoutLink).toContain(`coupon=${coupon.code}`);
    expect(coupon.checkoutLink).toContain(encodeURIComponent(`${SEED.pack25.id}:2`));

    const again = await issueRecoveryCoupon(saved!.id, 5, cfg);
    expect(again.code).toBe(coupon.code);
    expect(again.percent).toBe(10);
  });

  it("works only for the customer's own number, once", async () => {
    const cfg = config();
    const phone = randomPhone();
    const { lead: saved } = await saveCartLead(lead({ phone }));
    const { code } = await issueRecoveryCoupon(saved!.id, 10, cfg);

    await expect(placeOrder(checkout({ couponCode: code }), ctx)).rejects.toThrow(OrderError);

    const { order } = await placeOrder(checkout({ phone, couponCode: code }), ctx);
    expect(order.couponCode).toBe(code);
    expect(order.discount).toBe(Math.floor(SEED.pack25.price * 0.1));

    await expect(placeOrder(checkout({ phone, couponCode: code }), ctx)).rejects.toThrow(OrderError);
  });

  it("refuses a code for a cart that already ordered", async () => {
    const cfg = config();
    const phone = randomPhone();
    const { lead: saved } = await saveCartLead(lead({ phone }));
    await placeOrder(checkout({ phone }), ctx);
    await getLeadView(saved!.id, cfg);
    await expect(issueRecoveryCoupon(saved!.id, 10, cfg)).rejects.toThrow(/converted/);
  });

  it("notices an order placed since the lead was last read before issuing a code", async () => {
    const cfg = config();
    const phone = randomPhone();
    const { lead: saved } = await saveCartLead(lead({ phone }));
    await placeOrder(checkout({ phone }), ctx);
    // No getLeadView in between: issuing the code must check for the order itself.
    await expect(issueRecoveryCoupon(saved!.id, 10, cfg)).rejects.toThrow(/converted/);
  });
});

describe("a customer's no", () => {
  it("covers every saved cart for that number, e.g. from a second device", async () => {
    const cfg = config();
    const phone = randomPhone();
    const { lead: onPhone } = await saveCartLead(lead({ phone }));
    const { lead: onLaptop } = await saveCartLead(lead({ phone }));
    expect(onLaptop?.id).not.toBe(onPhone?.id);

    await claimLeadForCall(onPhone!.id, cfg, indiaTime(11));
    await recordCallResult(onPhone!.id, { outcome: "opted_out" }, cfg);

    const other = await claimLeadForCall(onLaptop!.id, cfg, indiaTime(12));
    expect(other?.eligible).toBe(false);
    expect(other?.reason).toBe("opted_out");
    expect(other?.callAttempts).toBe(0);
  });

  it("can't be undone by a late or repeated call report", async () => {
    const cfg = config();
    const { lead: saved } = await saveCartLead(lead());
    await claimLeadForCall(saved!.id, cfg, indiaTime(11));
    await recordCallResult(saved!.id, { outcome: "opted_out" }, cfg);
    const late = await recordCallResult(saved!.id, { outcome: "no_answer" }, cfg);
    expect(late.status).toBe("opted_out");
  });

  it("keeps a withdrawn consent closed, so ticking the box again still reopens it", async () => {
    const cfg = config();
    const data = lead();
    const { lead: saved } = await saveCartLead(data);
    await withdrawCartLead(data.clientKey);
    const late = await recordCallResult(saved!.id, { outcome: "no_answer" }, cfg);
    expect(late.status).toBe("closed");
    expect(late.lastOutcome).toBe("consent_withdrawn");
    const again = await saveCartLead(data);
    expect(again.lead?.status).toBe("open");
  });
});

describe("automation API access", () => {
  const request = (key?: string) =>
    new Request("http://localhost/api/recovery/leads/x", key ? { headers: { Authorization: `Bearer ${key}` } } : {});

  it("is absent until the key is configured", () => {
    const auth = authorizeRecovery(request("anything"));
    expect("response" in auth && auth.response.status).toBe(404);
  });

  it("needs the exact bearer key", () => {
    config();
    const missing = authorizeRecovery(request());
    expect("response" in missing && missing.response.status).toBe(401);
    const wrong = authorizeRecovery(request("test-recovery-kez"));
    expect("response" in wrong && wrong.response.status).toBe(401);
    expect("cfg" in authorizeRecovery(request("test-recovery-key"))).toBe(true);
  });

  it("builds checkout links without personal data", () => {
    const link = recoveryCheckoutLink([{ packId: "pack-50", qty: 1 }], "HELLO1234");
    expect(link).toMatch(/\/checkout\?items=pack-50%3A1&coupon=HELLO1234$/);
  });
});
