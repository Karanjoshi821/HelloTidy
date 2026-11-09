"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { failure } from "@/lib/admin-actions";
import { requireAdmin, requireOwner } from "@/lib/auth/dal";
import { applyStockEffect } from "@/lib/catalog/invalidate";
import {
  checkboxField,
  firstIssue,
  formObject,
  formPhoneField,
  intField,
  optionalEmailField,
  optionalTextField,
  pincodeField,
  rupeesField,
  stateField,
  tagsField,
  textField,
  uuidField,
} from "@/lib/form";
import { notifyOrderConfirmed, notifyPaid } from "@/lib/notify";
import { sendOrderConfirmationEmail, sendShippedEmail } from "@/lib/notify/email";
import {
  addOrderComment,
  BULK_ACTIONS,
  bulkOrderAction,
  ORDER_STATUSES,
  recordRefund,
  setOrderTags,
  updateAdminNotes,
  updateOrderContact,
  updateOrderStatus,
  updateShipping,
  verifyCod,
  type BulkAction,
} from "@/lib/orders/admin";
import { createManualOrder } from "@/lib/orders/manual";
import { getOrderById, OrderError, PriceChangedError, recordOrderEvent } from "@/lib/orders/service";
import { switchToCodSafely } from "@/lib/payments/flow";
import { RazorpayError } from "@/lib/payments/razorpay";
import { normalizeTag } from "@/lib/tags";

const statusSchema = z.object({
  orderId: uuidField,
  status: z.enum(ORDER_STATUSES as [string, ...string[]]),
  /** The status the page showed; the change is refused if the order has moved on since. */
  from: z.enum(ORDER_STATUSES as [string, ...string[]]),
  reason: z.string().trim().max(200).optional(),
  restock: checkboxField,
});

async function notifyShipped(orderId: string) {
  const order = await getOrderById(orderId);
  if (order) await sendShippedEmail(order);
}

export async function updateStatusAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = statusSchema.safeParse({ ...formObject(formData), restock: formData.get("restock") });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { orderId, status, reason, restock } = parsed.data;
  const next = status as (typeof ORDER_STATUSES)[number];
  const from = parsed.data.from as (typeof ORDER_STATUSES)[number];
  if (next === "cancelled" && !reason) return { ok: false, message: "Choose a reason for cancelling." };
  try {
    // Restock is a checkbox on the cancel/return forms; other transitions don't touch stock.
    const effect = await updateOrderStatus(orderId, next, user.email, {
      reason,
      from,
      restock: next === "cancelled" || next === "rto" ? restock : undefined,
    });
    applyStockEffect(effect);
    if (next === "shipped") after(() => notifyShipped(orderId));
  } catch (error) {
    return failure(error, "Couldn't update the status.");
  }
  refresh();
  return { ok: true, message: "Status updated." };
}

/** For a customer who didn't finish paying online and agreed (on a call) to pay on delivery. */
export async function convertToCodAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = uuidField.safeParse(formData.get("orderId"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  try {
    const order = await getOrderById(id.data);
    if (!order) return { ok: false, message: "Order not found." };
    const result = await switchToCodSafely(order, user.email);
    refresh();
    if (result.outcome === "switched") {
      applyStockEffect(result.stock);
      after(() => notifyOrderConfirmed(result.order));
      return { ok: true, message: "Confirmed as Cash on Delivery." };
    }
    if (result.outcome === "paid_online") {
      const paid = result.paid;
      if (paid) {
        applyStockEffect(paid.stock);
        after(() => notifyPaid(paid));
      }
      return {
        ok: true,
        message: "The customer's online payment had already gone through, so it's confirmed as prepaid.",
      };
    }
    return { ok: false, message: "This order no longer needs payment." };
  } catch (error) {
    if (error instanceof RazorpayError) {
      return { ok: false, message: "Couldn't reach Razorpay to check for a payment. Try again." };
    }
    return failure(error, "Couldn't convert to COD.");
  }
}

const shippingSchema = z.object({
  orderId: uuidField,
  courierName: z.string().trim().max(60),
  awbCode: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9-]*$/, "Tracking number can only contain letters, numbers and dashes"),
  trackingUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/[^\s<>"']+$/.test(v), "Tracking link must start with https://"),
  intent: z.enum(["save", "ship"]).default("save"),
  from: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
});

export async function updateShippingAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = shippingSchema.safeParse({
    orderId: formData.get("orderId"),
    courierName: formData.get("courierName") ?? "",
    awbCode: formData.get("awbCode") ?? "",
    trackingUrl: formData.get("trackingUrl") ?? "",
    intent: formData.get("intent") ?? undefined,
    from: formData.get("from") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { orderId, intent, from, ...shipping } = parsed.data;
  try {
    await updateShipping(orderId, shipping, user.email);
    if (intent === "ship") {
      await updateOrderStatus(orderId, "shipped", user.email, {
        from: from as (typeof ORDER_STATUSES)[number] | undefined,
      });
      after(() => notifyShipped(orderId));
    }
  } catch (error) {
    return failure(error, "Couldn't save shipping details.");
  }
  refresh();
  return { ok: true, message: intent === "ship" ? "Saved and marked as shipped." : "Shipping details saved." };
}

export async function updateNotesAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({ orderId: uuidField, notes: z.string().trim().max(2000, "Notes are too long.") })
    .safeParse({ orderId: formData.get("orderId"), notes: formData.get("notes") ?? "" });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await updateAdminNotes(parsed.data.orderId, parsed.data.notes, user.email);
  } catch (error) {
    return failure(error, "Couldn't save notes.");
  }
  refresh();
  return { ok: true, message: "Notes saved." };
}

export async function verifyCodAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({ orderId: uuidField, note: z.string().trim().max(200) })
    .safeParse({ orderId: formData.get("orderId"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await verifyCod(parsed.data.orderId, user.email, parsed.data.note || undefined);
  } catch (error) {
    return failure(error, "Couldn't save.");
  }
  refresh();
  return { ok: true, message: "Marked as verified." };
}

export async function addCommentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({ orderId: uuidField, message: textField("Comment", 1, 1000) })
    .safeParse({ orderId: formData.get("orderId"), message: formData.get("message") ?? "" });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await addOrderComment(parsed.data.orderId, parsed.data.message, user.email);
  } catch (error) {
    return failure(error, "Couldn't add the comment.");
  }
  refresh();
  return { ok: true, message: "Comment added." };
}

export async function setOrderTagsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({ orderId: uuidField, tags: tagsField })
    .safeParse({ orderId: formData.get("orderId"), tags: formData.get("tags") ?? "" });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await setOrderTags(parsed.data.orderId, parsed.data.tags, user.email);
  } catch (error) {
    return failure(error, "Couldn't save the tags.");
  }
  refresh();
  return { ok: true, message: "Tags saved." };
}

const contactSchema = z.object({
  orderId: uuidField,
  customerName: textField("Name", 2, 80),
  phone: formPhoneField,
  email: optionalEmailField,
  address1: textField("Address", 5, 200),
  address2: optionalTextField("Area", 200),
  landmark: optionalTextField("Landmark", 100),
  city: textField("City", 2, 80),
  state: stateField,
  pincode: pincodeField,
});

export async function updateContactAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = contactSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { orderId, ...input } = parsed.data;
  try {
    await updateOrderContact(orderId, input, user.email);
  } catch (error) {
    return failure(error, "Couldn't save the details.");
  }
  refresh();
  return { ok: true, message: "Customer details saved." };
}

export async function recordRefundAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = z
    .object({
      orderId: uuidField,
      amount: rupeesField("Refund amount", { min: 1, max: 1_000_000 }),
      reason: textField("Reason", 2, 200),
      reference: optionalTextField("Reference", 100),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { orderId, ...input } = parsed.data;
  try {
    const { fullyRefunded } = await recordRefund(orderId, input, user.email);
    refresh();
    return { ok: true, message: fullyRefunded ? "Refund recorded. The order is fully refunded." : "Refund recorded." };
  } catch (error) {
    return failure(error, "Couldn't record the refund.");
  }
}

export async function bulkOrdersAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({
      ids: z.array(uuidField).min(1, "Select at least one order.").max(100, "Select at most 100 orders at a time."),
      action: z.enum(Object.keys(BULK_ACTIONS) as [BulkAction, ...BulkAction[]], "Choose an action."),
      tag: z.string().optional(),
    })
    .safeParse(formObject(formData, ["ids"]));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { ids, action } = parsed.data;
  const tag = normalizeTag(parsed.data.tag);
  if ((action === "add_tag" || action === "remove_tag") && !tag) {
    return { ok: false, message: "Type one tag (letters, numbers, spaces, - or _)." };
  }
  try {
    const result = await bulkOrderAction(ids, action, user.email, { tag: tag ?? undefined });
    applyStockEffect(result.stock);
    refresh();
    const lines = [`${BULK_ACTIONS[action]}: ${result.done} updated.`];
    if (result.skipped.length) {
      lines.push(
        `${result.skipped.length} skipped: ${result.skipped
          .slice(0, 8)
          .map((s) => `${s.orderNumber} (${s.reason})`)
          .join(", ")}${result.skipped.length > 8 ? "…" : ""}`,
      );
    }
    return { ok: result.done > 0, message: lines.join("\n") };
  } catch (error) {
    return failure(error, "Couldn't update the orders.");
  }
}

const manualOrderSchema = z
  .object({
    key: uuidField,
    lines: z
      .array(z.object({ packId: z.string().min(1).max(40), qty: z.number().int().min(1).max(100) }))
      .min(1, "Add at least one pack.")
      .max(10),
    customerName: textField("Name", 2, 80),
    phone: formPhoneField,
    email: optionalEmailField,
    address1: textField("Address", 5, 200),
    address2: optionalTextField("Area", 200),
    landmark: optionalTextField("Landmark", 100),
    city: textField("City", 2, 80),
    state: stateField,
    pincode: pincodeField,
    payment: z.enum(["cod", "paid"], "Choose how the customer pays."),
    paymentReference: optionalTextField("Payment reference", 100),
    manualDiscount: z.union([z.literal("").transform(() => 0), rupeesField("Discount", { max: 1_000_000 })]),
    waiveCodFee: checkboxField,
    note: optionalTextField("Note", 1000),
    tags: tagsField,
    expectedTotal: intField("Total", 0, 100_000_000),
  })
  .refine((v) => v.payment === "cod" || v.paymentReference, {
    message: "Enter the UPI / bank reference for a paid order.",
    path: ["paymentReference"],
  });

/** Creates an order for a phone or WhatsApp customer ("Create order"). */
export async function createOrderAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, message: "Add at least one pack." };
  }
  const parsed = manualOrderSchema.safeParse({
    ...formObject(formData),
    lines,
    waiveCodFee: formData.get("waiveCodFee"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  // Discounts are the owner's call (prices are owner-only); staff take orders at list price.
  if ((parsed.data.manualDiscount > 0 || parsed.data.waiveCodFee) && user.role !== "owner") {
    return { ok: false, message: "Only the owner can give a discount or waive the COD charge." };
  }

  let orderId: string;
  try {
    const { order, created, stock } = await createManualOrder(parsed.data, user.email);
    applyStockEffect(stock);
    if (created && order.email) after(() => sendOrderConfirmationEmail(order));
    orderId = order.id;
  } catch (error) {
    if (error instanceof PriceChangedError) {
      return {
        ok: false,
        message: "Prices or the COD charge changed while you were filling this in. Check the total and submit again.",
      };
    }
    return failure(error, "Couldn't create the order.");
  }
  redirect(`/admin/orders/${orderId}?created=1`);
}

/** Logs that a payment reminder went out on WhatsApp (the button opens WhatsApp itself). */
export async function markRecoverySentAction(orderId: string): Promise<void> {
  const user = await requireAdmin();
  const id = uuidField.safeParse(orderId);
  if (!id.success) return;
  const order = await getOrderById(id.data);
  if (!order || order.status !== "pending_payment") return;
  try {
    await recordOrderEvent(order.id, "recovery_sent", "Payment reminder sent on WhatsApp", user.email);
  } catch (error) {
    if (!(error instanceof OrderError)) console.error("[admin] recovery log", error);
  }
  refresh();
}
