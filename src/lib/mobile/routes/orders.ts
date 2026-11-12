import "server-only";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import {
  addCommentAction,
  bulkOrdersAction,
  convertToCodAction,
  createOrderAction,
  markRecoverySentAction,
  recordRefundAction,
  sendToShiprocketAction,
  setOrderTagsAction,
  updateContactAction,
  updateNotesAction,
  updateShippingAction,
  updateStatusAction,
  verifyCodAction,
} from "@/app/admin/order-actions";
import { absoluteUrl, siteConfig } from "@/config/site";
import { AUDIT_ENTITY_LABELS } from "../../audit";
import { STOCK_REASONS } from "../../catalog/admin";
import { readCheckoutSettings } from "../../catalog/service";
import { TOPIC_LABELS } from "../../contact/service";
import { CUSTOMER_FILTERS, CUSTOMER_SORTS } from "../../customers/admin";
import { getDb } from "../../db";
import { packs } from "../../db/schema";
import { INDIAN_STATES } from "../../india";
import { getNavCounts } from "../../admin-nav-counts";
import { getHomeStats, getOrderDetail, listAbandonedCheckouts, listOrders } from "../../orders/admin";
import {
  BULK_ACTIONS,
  CANCEL_REASONS,
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDER_VIEWS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
} from "../../orders/labels";
import { priceLocked } from "../../orders/service";
import { adminOrderLimits } from "../../pricing";
import { getStoreSettings } from "../../settings";
import { VISITOR_FILTERS, getOrderVisit } from "../../visitors/reports";
import { codVerificationText, generalText, paymentReminderText, shippedText, waLink } from "../../whatsapp-templates";
import { runAction } from "../actions";
import { invalid, notFound } from "../http";
import type { Route } from "../router";

const page = (q: URLSearchParams) => z.coerce.number().int().min(1).max(10_000).catch(1).parse(q.get("page") ?? 1);
const str = (q: URLSearchParams, key: string) => q.get(key)?.slice(0, 120) || undefined;

/** Rupees as typed in the app ("549" or "549.50") → paise. */
const rupeesToPaise = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(String(v).trim() || "0");
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
  return Math.round(n * 100);
});

export const orderRoutes: Route[] = [
  {
    // Labels and option lists the web admin hard-codes, so the app never drifts from it.
    method: "GET",
    path: "meta",
    access: "user",
    handler: async () => ({
      store: { name: siteConfig.name, url: siteConfig.url },
      settings: await getStoreSettings(),
      orders: {
        statuses: ORDER_STATUSES,
        statusLabels: STATUS_LABELS,
        transitions: STATUS_TRANSITIONS,
        cancelReasons: CANCEL_REASONS,
        views: ORDER_VIEWS,
        sorts: ORDER_SORTS,
        bulkActions: BULK_ACTIONS,
      },
      customers: { filters: CUSTOMER_FILTERS, sorts: CUSTOMER_SORTS },
      stockReasons: STOCK_REASONS,
      states: INDIAN_STATES,
      messageTopics: TOPIC_LABELS,
      visitorFilters: VISITOR_FILTERS,
      auditEntities: AUDIT_ENTITY_LABELS,
    }),
  },
  {
    method: "GET",
    path: "dashboard",
    access: "user",
    handler: async () => {
      const [stats, counts] = await Promise.all([getHomeStats(), getNavCounts()]);
      return { stats, counts };
    },
  },
  // ─── Orders ────────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "orders",
    access: "user",
    handler: ({ query }) =>
      listOrders({
        status: str(query, "status"),
        payment: str(query, "payment"),
        paymentStatus: str(query, "paymentStatus"),
        q: str(query, "q"),
        tag: str(query, "tag"),
        from: str(query, "from"),
        to: str(query, "to"),
        source: str(query, "source"),
        sort: str(query, "sort"),
        page: page(query),
      }),
  },
  {
    method: "GET",
    path: "orders/:id",
    access: "user",
    handler: async ({ params, auth }) => {
      const detail = await getOrderDetail(params.id);
      if (!detail) throw notFound("Order");
      const { order } = detail;
      const whatsapp: { key: string; label: string; url: string }[] = [];
      if (order.status === "pending_payment") {
        whatsapp.push({ key: "payment_reminder", label: "Payment reminder", url: waLink(order.phone, paymentReminderText(order, absoluteUrl(`/order/${order.publicToken}`))) });
      }
      if (order.paymentMethod === "cod" && (order.status === "confirmed" || order.status === "processing")) {
        whatsapp.push({ key: "cod_verification", label: "Confirm COD order", url: waLink(order.phone, codVerificationText(order)) });
      }
      if (order.status === "shipped") {
        whatsapp.push({ key: "shipped", label: "Shipped update", url: waLink(order.phone, shippedText(order, absoluteUrl("/track"))) });
      }
      whatsapp.push({ key: "general", label: "Message customer", url: waLink(order.phone, generalText(order)) });
      const visit = auth.user.role === "owner" ? await getOrderVisit(order).catch(() => null) : null;
      return {
        ...detail,
        transitions: STATUS_TRANSITIONS[order.status] ?? [],
        whatsapp,
        links: { customerPage: absoluteUrl(`/order/${order.publicToken}`), track: absoluteUrl("/track") },
        visit,
      };
    },
  },
  {
    method: "POST",
    path: "orders/:id/status",
    access: "user",
    handler: ({ params, body }) =>
      runAction(updateStatusAction, { orderId: params.id, status: body.status, from: body.from, reason: body.reason, restock: body.restock }),
  },
  { method: "POST", path: "orders/:id/cod", access: "user", handler: ({ params }) => runAction(convertToCodAction, { orderId: params.id }) },
  {
    method: "POST",
    path: "orders/:id/shipping",
    access: "user",
    handler: ({ params, body }) =>
      runAction(updateShippingAction, {
        orderId: params.id,
        courierName: body.courierName ?? "",
        awbCode: body.awbCode ?? "",
        trackingUrl: body.trackingUrl ?? "",
        intent: body.intent,
        from: body.from,
      }),
  },
  { method: "POST", path: "orders/:id/notes", access: "user", handler: ({ params, body }) => runAction(updateNotesAction, { orderId: params.id, notes: body.notes ?? "" }) },
  { method: "POST", path: "orders/:id/verify-cod", access: "user", handler: ({ params, body }) => runAction(verifyCodAction, { orderId: params.id, note: body.note ?? "" }) },
  { method: "POST", path: "orders/:id/comment", access: "user", handler: ({ params, body }) => runAction(addCommentAction, { orderId: params.id, message: body.message }) },
  {
    method: "POST",
    path: "orders/:id/tags",
    access: "user",
    handler: ({ params, body }) =>
      runAction(setOrderTagsAction, { orderId: params.id, tags: Array.isArray(body.tags) ? body.tags.join(", ") : (body.tags ?? "") }),
  },
  {
    method: "POST",
    path: "orders/:id/contact",
    access: "user",
    handler: ({ params, body }) =>
      runAction(updateContactAction, {
        orderId: params.id,
        customerName: body.customerName,
        phone: body.phone,
        email: body.email ?? "",
        address1: body.address1,
        address2: body.address2 ?? "",
        landmark: body.landmark ?? "",
        city: body.city,
        state: body.state,
        pincode: body.pincode,
      }),
  },
  { method: "POST", path: "orders/:id/shiprocket", access: "user", handler: ({ params }) => runAction(sendToShiprocketAction, { orderId: params.id }) },
  {
    method: "POST",
    path: "orders/:id/refund",
    access: "owner",
    handler: ({ params, body }) =>
      runAction(recordRefundAction, { orderId: params.id, amount: body.amount, reason: body.reason, reference: body.reference ?? "" }),
  },
  {
    method: "POST",
    path: "orders/:id/reminder-sent",
    access: "user",
    handler: async ({ params }) => {
      await markRecoverySentAction(params.id);
      return { ok: true, message: "Logged." };
    },
  },
  {
    method: "POST",
    path: "orders/bulk",
    access: "user",
    handler: ({ body }) => runAction(bulkOrdersAction, { ids: Array.isArray(body.ids) ? body.ids : [], action: body.action, tag: body.tag }),
  },
  {
    // Server-side total for the "Create order" form; the app sends it back as expectedTotal.
    method: "POST",
    path: "orders/quote",
    access: "user",
    handler: async ({ body, auth }) => {
      const parsed = z
        .object({
          lines: z.array(z.object({ packId: z.string().min(1).max(40), qty: z.number().int().min(1).max(100) })).min(1).max(10),
          payment: z.enum(["cod", "paid"]),
          manualDiscount: rupeesToPaise.optional(),
          waiveCodFee: z.boolean().optional(),
        })
        .safeParse(body);
      if (!parsed.success) throw invalid("Add at least one pack.");
      const { lines, payment, manualDiscount = 0, waiveCodFee = false } = parsed.data;
      if ((manualDiscount > 0 || waiveCodFee) && auth.user.role !== "owner") {
        throw invalid("Only the owner can give a discount or waive the COD charge.");
      }
      const db = await getDb();
      const rows = await db.select().from(packs).where(inArray(packs.id, lines.map((l) => l.packId)));
      const settings = await readCheckoutSettings(db);
      return priceLocked(rows, settings, {
        lines,
        paymentMethod: payment === "cod" ? "cod" : "prepaid",
        coupon: null,
        limits: adminOrderLimits,
        manualDiscount,
        waiveCodFee,
        includeHidden: true,
      });
    },
  },
  {
    method: "POST",
    path: "orders",
    access: "user",
    handler: ({ body }) =>
      runAction(createOrderAction, {
        key: body.key,
        lines: Array.isArray(body.lines) ? body.lines : [],
        customerName: body.customerName,
        phone: body.phone,
        email: body.email ?? "",
        address1: body.address1,
        address2: body.address2 ?? "",
        landmark: body.landmark ?? "",
        city: body.city,
        state: body.state,
        pincode: body.pincode,
        payment: body.payment,
        paymentReference: body.paymentReference ?? "",
        manualDiscount: body.manualDiscount ?? "",
        waiveCodFee: body.waiveCodFee,
        note: body.note ?? "",
        tags: Array.isArray(body.tags) ? body.tags.join(", ") : (body.tags ?? ""),
        expectedTotal: body.expectedTotal,
      }),
  },
  {
    method: "GET",
    path: "checkouts",
    access: "user",
    handler: ({ query }) => listAbandonedCheckouts(page(query)),
  },
];
