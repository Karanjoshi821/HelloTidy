import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt, ne, notInArray } from "drizzle-orm";
import { siteConfig, absoluteUrl } from "@/config/site";
import { recordAudit } from "../audit";
import { loadStorefront } from "../catalog/service";
import { getDb, type Executor } from "../db";
import { isUniqueViolation } from "../db/errors";
import { cartLeads, discounts, orders, type CartLead } from "../db/schema";
import { recoveryConfig } from "../env";
import { formatPaise, paiseToRupees } from "../money";
import { quote, QuoteError, type CartLine } from "../pricing";
import type { CartLeadData } from "../validation";

/**
 * Cart-recovery calls. A customer who types their mobile number at checkout and
 * agrees to a call leaves a "cart lead". The store tells the automation (n8n),
 * which waits, asks this module whether the lead may still be called, and hands
 * it to the voice agent. The agent claims the lead, may issue a one-time
 * discount bound to the customer's number, and reports how the call went.
 */

export type RecoveryConfig = NonNullable<ReturnType<typeof recoveryConfig>>;

export const CALL_OUTCOMES = [
  "will_order",
  "interested_later",
  "callback_later",
  "declined",
  "opted_out",
  "wrong_number",
  "voicemail",
  "no_answer",
  "busy",
  "failed",
  "hung_up",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * Call again later, up to the attempt limit: nobody was reached, or the customer
 * asked for a call at another time (the agent promised one).
 */
const CALL_AGAIN: ReadonlySet<CallOutcome> = new Set(["no_answer", "busy", "failed", "voicemail", "callback_later"]);
/** Never call this number again. */
const STOP_FOR_GOOD: ReadonlySet<CallOutcome> = new Set(["opted_out", "wrong_number"]);

/** A lead older than this is never called: the moment has passed. */
const LEAD_TTL_HOURS = 48;
/** Saved carts are deleted after this (the privacy policy promises it). */
const RETENTION_DAYS = 90;
/** A claim this recent means a call is already ringing or under way. */
const CALL_LOCK_MINUTES = 10;

export type IneligibleReason =
  | "converted"
  | "already_called"
  | "opted_out"
  | "closed"
  | "max_attempts"
  | "expired"
  | "call_in_progress"
  | "quiet_hours";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function describeLines(lines: { name: string; count: number; qty: number }[]): string {
  return lines.map((l) => `${l.name} (${l.count} sponges) × ${l.qty}`).join(", ");
}

/** Checkout link that refills the cart and, with a code, applies it. Holds no personal data. */
export function recoveryCheckoutLink(lines: CartLine[], couponCode?: string | null): string {
  const items = lines.map((l) => `${l.packId}:${l.qty}`).join(",");
  const coupon = couponCode ? `&coupon=${encodeURIComponent(couponCode)}` : "";
  return absoluteUrl(`/checkout?items=${encodeURIComponent(items)}${coupon}`);
}

/** Hour of the day (0–23) in India. */
export function indiaHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(now),
  );
}

// ── Checkout side ────────────────────────────────────────────────────────

/**
 * Saves (or updates) the lead for this browser's checkout. Returns whether the
 * automation still needs to hear about it. Numbers that opted out are never stored again.
 */
export async function saveCartLead(
  data: CartLeadData,
  now = new Date(),
): Promise<{ lead: CartLead | null; shouldNotify: boolean }> {
  const db = await getDb();
  const catalog = await loadStorefront(db);
  let priced;
  try {
    priced = quote({ lines: data.lines, paymentMethod: "prepaid", catalog });
  } catch (error) {
    if (error instanceof QuoteError) return { lead: null, shouldNotify: false };
    throw error;
  }

  const [optedOut] = await db
    .select({ id: cartLeads.id })
    .from(cartLeads)
    .where(and(eq(cartLeads.phone, data.phone), eq(cartLeads.status, "opted_out")))
    .limit(1);
  if (optedOut) return { lead: null, shouldNotify: false };

  const values = {
    phone: data.phone,
    name: data.name,
    lines: priced.lines.map((l) => ({ packId: l.packId, qty: l.qty })),
    subtotal: priced.subtotal,
    itemsSummary: describeLines(priced.lines),
    consentAt: now,
  };

  const [existing] = await db.select().from(cartLeads).where(eq(cartLeads.clientKey, data.clientKey)).limit(1);
  if (existing) {
    const withdrawn = existing.status === "closed" && existing.lastOutcome === "consent_withdrawn";
    if (existing.status !== "open" && !withdrawn) return { lead: existing, shouldNotify: false };
    const [lead] = await db
      .update(cartLeads)
      .set(
        withdrawn
          ? // Re-ticked after unticking: a fresh start, so the automation hears about it again.
            { ...values, status: "open", lastOutcome: null, notifiedAt: null }
          : { ...values, consentAt: existing.consentAt },
      )
      .where(eq(cartLeads.id, existing.id))
      .returning();
    return { lead, shouldNotify: !lead.notifiedAt };
  }

  // Occasionally apply the retention period, like the rate limiter's cleanup.
  if (Math.random() < 0.02) await purgeOldCartLeads(now);

  const [created] = await db
    .insert(cartLeads)
    .values({ clientKey: data.clientKey, ...values })
    .onConflictDoNothing({ target: cartLeads.clientKey })
    .returning();
  if (created) return { lead: created, shouldNotify: true };
  // Two saves raced: the other one created it.
  const [raced] = await db.select().from(cartLeads).where(eq(cartLeads.clientKey, data.clientKey)).limit(1);
  return { lead: raced ?? null, shouldNotify: false };
}

/**
 * Deletes saved carts older than the retention period. A number that asked not
 * to be called keeps a bare row (number only), so it is never called again.
 */
export async function purgeOldCartLeads(now = new Date()): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  await db.delete(cartLeads).where(and(lt(cartLeads.createdAt, cutoff), ne(cartLeads.status, "opted_out")));
  await db
    .update(cartLeads)
    .set({ name: "", lines: [], subtotal: 0, itemsSummary: "", callSummary: null })
    .where(and(lt(cartLeads.createdAt, cutoff), eq(cartLeads.status, "opted_out"), ne(cartLeads.name, "")));
}

/** The customer unticked the call consent: don't call about this cart. */
export async function withdrawCartLead(clientKey: string): Promise<void> {
  const db = await getDb();
  await db
    .update(cartLeads)
    .set({ status: "closed", lastOutcome: "consent_withdrawn" })
    .where(and(eq(cartLeads.clientKey, clientKey), eq(cartLeads.status, "open")));
}

/**
 * Tells the automation about a new lead. The payload carries only the lead id:
 * n8n reads the details through the authenticated API when it is time to call.
 */
export async function sendCartLeadWebhook(lead: CartLead): Promise<void> {
  const cfg = recoveryConfig();
  if (!cfg?.webhookUrl) return;
  const res = await fetch(cfg.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "HelloTidy-Webhooks/1.0",
      // Keeps the old brand name: the live n8n workflow checks this exact header.
      ...(cfg.webhookToken ? { "X-Kivo-Token": cfg.webhookToken } : {}),
    },
    body: JSON.stringify({
      id: randomUUID(),
      type: "cart_lead.saved",
      createdAt: new Date().toISOString(),
      data: { leadId: lead.id },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Cart-lead webhook responded ${res.status}`);
  const db = await getDb();
  await db.update(cartLeads).set({ notifiedAt: new Date() }).where(eq(cartLeads.id, lead.id));
}

// ── Automation side (API) ────────────────────────────────────────────────

/** Marks the lead converted if the same number placed an order since the cart was saved. */
async function refreshConversion(db: Executor, lead: CartLead): Promise<CartLead> {
  if (lead.status === "converted") return lead;
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.phone, lead.phone),
        gte(orders.createdAt, lead.createdAt),
        notInArray(orders.status, ["cancelled", "pending_payment"]),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!order) return lead;
  const [updated] = await db
    .update(cartLeads)
    .set({ status: "converted", orderId: order.id })
    .where(eq(cartLeads.id, lead.id))
    .returning();
  return updated ?? lead;
}

export function ineligibleReason(lead: CartLead, cfg: RecoveryConfig, now = new Date()): IneligibleReason | null {
  switch (lead.status) {
    case "converted":
      return "converted";
    case "called":
      return "already_called";
    case "opted_out":
      return "opted_out";
    case "closed":
      return "closed";
  }
  if (lead.callAttempts >= cfg.maxCallAttempts) return "max_attempts";
  if (now.getTime() - lead.createdAt.getTime() > LEAD_TTL_HOURS * 3_600_000) return "expired";
  if (lead.lastCallAt && now.getTime() - lead.lastCallAt.getTime() < CALL_LOCK_MINUTES * 60_000) {
    return "call_in_progress";
  }
  const hour = indiaHour(now);
  if (hour < cfg.callHours.start || hour >= cfg.callHours.end) return "quiet_hours";
  return null;
}

export type LeadView = ReturnType<typeof toLeadView>;

/** Whether this number said "don't call" (or "wrong number") on any saved cart. */
async function numberOptedOut(db: Executor, phone: string): Promise<boolean> {
  const [row] = await db
    .select({ id: cartLeads.id })
    .from(cartLeads)
    .where(and(eq(cartLeads.phone, phone), eq(cartLeads.status, "opted_out")))
    .limit(1);
  return Boolean(row);
}

/** The lead's own rules, then the number-wide opt-out (the same person may have saved carts on two devices). */
async function callBlocker(
  db: Executor,
  lead: CartLead,
  cfg: RecoveryConfig,
  now: Date,
): Promise<IneligibleReason | null> {
  return ineligibleReason(lead, cfg, now) ?? ((await numberOptedOut(db, lead.phone)) ? "opted_out" : null);
}

function toLeadView(
  lead: CartLead,
  cfg: RecoveryConfig,
  reason: IneligibleReason | null,
  couponPercent: number | null,
) {
  return {
    id: lead.id,
    status: lead.status,
    eligible: reason === null,
    reason,
    name: lead.name,
    firstName: firstName(lead.name),
    phone: lead.phone,
    phoneE164: `+91${lead.phone}`,
    itemsSummary: lead.itemsSummary,
    subtotal: paiseToRupees(lead.subtotal),
    subtotalText: formatPaise(lead.subtotal),
    lines: lead.lines,
    callAttempts: lead.callAttempts,
    lastCallAt: lead.lastCallAt,
    lastOutcome: lead.lastOutcome,
    callSummary: lead.callSummary,
    couponCode: lead.couponCode,
    couponPercent,
    couponSent: lead.couponSentAt !== null,
    checkoutLink: recoveryCheckoutLink(lead.lines, lead.couponCode),
    maxDiscountPercent: cfg.maxDiscountPercent,
    createdAt: lead.createdAt,
    store: {
      name: siteConfig.name,
      delivery: siteConfig.shipping.delivery,
      freeDelivery: true,
      cashOnDelivery: true,
    },
  };
}

async function couponPercentOf(db: Executor, code: string | null): Promise<number | null> {
  if (!code) return null;
  const [d] = await db.select({ value: discounts.value }).from(discounts).where(eq(discounts.code, code)).limit(1);
  return d?.value ?? null;
}

function isUuid(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

/** Current state of a lead, and whether it may be called now. Read-only apart from noting a conversion. */
export async function getLeadView(id: string, cfg: RecoveryConfig, now = new Date()): Promise<LeadView | null> {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(cartLeads).where(eq(cartLeads.id, id)).limit(1);
  if (!row) return null;
  const lead = await refreshConversion(db, row);
  return toLeadView(lead, cfg, await callBlocker(db, lead, cfg, now), await couponPercentOf(db, lead.couponCode));
}

/**
 * Called by the voice agent just before dialling. Atomically re-checks the lead
 * and counts the attempt, so two automations can never call the same cart at once.
 */
export async function claimLeadForCall(id: string, cfg: RecoveryConfig, now = new Date()): Promise<LeadView | null> {
  if (!isUuid(id)) return null;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(cartLeads).where(eq(cartLeads.id, id)).limit(1).for("update");
    if (!row) return null;
    let lead = await refreshConversion(tx, row);
    const reason = await callBlocker(tx, lead, cfg, now);
    if (!reason) {
      [lead] = await tx
        .update(cartLeads)
        .set({ callAttempts: lead.callAttempts + 1, lastCallAt: now })
        .where(eq(cartLeads.id, id))
        .returning();
    }
    return toLeadView(lead, cfg, reason, await couponPercentOf(tx, lead.couponCode));
  });
}

export class RecoveryError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "RecoveryError";
  }
}

export type IssuedCoupon = {
  code: string;
  percent: number;
  expiresAt: Date;
  checkoutLink: string;
  /** Spelled out for the voice agent, e.g. "K I V O 4 8 2 1". */
  spoken: string;
};

/**
 * Issues the customer's one-time recovery code: percent off, capped at the
 * configured maximum, usable once, only by this mobile number, for a limited
 * time. Asking again returns the code already issued.
 */
export async function issueRecoveryCoupon(
  id: string,
  requestedPercent: number,
  cfg: RecoveryConfig,
  now = new Date(),
): Promise<IssuedCoupon> {
  if (!isUuid(id)) throw new RecoveryError("Lead not found.", 404);
  const percent = Math.min(Math.max(Math.round(requestedPercent), 1), cfg.maxDiscountPercent);
  const db = await getDb();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [found] = await tx.select().from(cartLeads).where(eq(cartLeads.id, id)).limit(1).for("update");
        if (!found) throw new RecoveryError("Lead not found.", 404);
        // The customer may have ordered since the lead was last read: no discount after the fact.
        const lead = await refreshConversion(tx, found);
        if (lead.status !== "open" && lead.status !== "called") {
          throw new RecoveryError(`This cart can't get a discount (${lead.status}).`);
        }
        if (lead.couponCode) {
          const [d] = await tx.select().from(discounts).where(eq(discounts.code, lead.couponCode)).limit(1);
          if (d) {
            return {
              code: d.code,
              percent: d.value,
              expiresAt: d.endsAt ?? now,
              checkoutLink: recoveryCheckoutLink(lead.lines, d.code),
              spoken: spell(d.code),
            };
          }
        }

        // Short and all digits after the prefix, so it is easy to read out on a call.
        const code = `HELLO${randomInt(1000, 10000)}`;
        const expiresAt = new Date(now.getTime() + cfg.couponHours * 3_600_000);
        const [row] = await tx
          .insert(discounts)
          .values({
            code,
            description: `${percent}% off for ${firstName(lead.name)}, from your call with ${siteConfig.name}`,
            type: "percent",
            value: percent,
            minOrder: 0,
            maxDiscount: null,
            startsAt: null,
            endsAt: expiresAt,
            usageLimit: 1,
            oncePerCustomer: true,
            customerPhone: lead.phone,
            active: true,
          })
          .returning({ id: discounts.id });
        await tx.update(cartLeads).set({ couponCode: code }).where(eq(cartLeads.id, lead.id));
        await recordAudit(tx, {
          actor: "voice-agent",
          action: "discount.created",
          entityType: "discount",
          entityId: row.id,
          summary: `Created ${code} on a cart-recovery call: ${percent}% off, once, only for +91 ${lead.phone}, until ${expiresAt.toISOString()}`,
        });
        return { code, percent, expiresAt, checkoutLink: recoveryCheckoutLink(lead.lines, code), spoken: spell(code) };
      });
    } catch (error) {
      // Another code already uses these digits: pick new ones.
      if (isUniqueViolation(error, "discounts_code_idx")) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a discount code");
}

function spell(code: string): string {
  return code.split("").join(" ");
}

/** Records how a call ended and moves the lead on. */
export async function recordCallResult(
  id: string,
  input: { outcome: CallOutcome; summary?: string; durationSec?: number },
  cfg: RecoveryConfig,
): Promise<CartLead> {
  if (!isUuid(id)) throw new RecoveryError("Lead not found.", 404);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(cartLeads).where(eq(cartLeads.id, id)).limit(1).for("update");
    if (!lead) throw new RecoveryError("Lead not found.", 404);

    const withdrawn = lead.status === "closed" && lead.lastOutcome === "consent_withdrawn";
    let status = lead.status;
    // The customer's "don't call" (or a wrong number) always wins, even after an order.
    if (STOP_FOR_GOOD.has(input.outcome)) status = "opted_out";
    // A late or repeated report can't reopen a lead that has finished.
    else if (lead.status === "converted" || lead.status === "opted_out" || withdrawn) status = lead.status;
    else if (CALL_AGAIN.has(input.outcome)) status = lead.callAttempts >= cfg.maxCallAttempts ? "closed" : "open";
    else status = "called";
    const summary = input.summary?.trim().slice(0, 500) || null;
    const [updated] = await tx
      .update(cartLeads)
      .set({
        status,
        // Keep "consent_withdrawn" so ticking the box again can reopen the cart.
        lastOutcome: withdrawn && status === "closed" ? lead.lastOutcome : input.outcome,
        callSummary: summary ?? lead.callSummary,
        // A finished attempt shouldn't block the next one for the call-lock window.
        ...(CALL_AGAIN.has(input.outcome) && status === "open" ? { lastCallAt: null } : {}),
      })
      .where(eq(cartLeads.id, id))
      .returning();
    if (status === "opted_out") {
      // The same number may have other saved carts (another phone or browser): none of them is called.
      await tx
        .update(cartLeads)
        .set({ status: "opted_out" })
        .where(and(eq(cartLeads.phone, lead.phone), ne(cartLeads.id, lead.id), ne(cartLeads.status, "opted_out")));
    }
    return updated;
  });
}

/** The automation sent the code to the customer (e.g. on WhatsApp). */
export async function markCouponSent(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const db = await getDb();
  const [row] = await db
    .update(cartLeads)
    .set({ couponSentAt: new Date() })
    .where(eq(cartLeads.id, id))
    .returning({ id: cartLeads.id });
  return Boolean(row);
}

/** Recent leads for the admin. */
export async function listRecentCartLeads(limit = 25): Promise<CartLead[]> {
  const db = await getDb();
  return db.select().from(cartLeads).orderBy(desc(cartLeads.createdAt)).limit(limit);
}
