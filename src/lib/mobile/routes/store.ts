import "server-only";
import { z } from "zod";
import { setMessageStatusAction } from "@/app/admin/actions";
import { createDiscountAction, deleteDiscountAction, toggleDiscountAction, updateDiscountAction } from "@/app/admin/discount-actions";
import { adjustStockAction, createPackAction, deletePackAction, updatePackAction } from "@/app/admin/product-actions";
import {
  createStaffAction,
  resetStaffPasswordAction,
  updateCheckoutSettingsAction,
  updateCustomerAction,
  updateStaffAction,
} from "@/app/admin/settings-actions";
import { adminSearch } from "../../admin-search";
import { getSalesReport } from "../../analytics/reports";
import { listAudit } from "../../audit";
import { getStaff, listStaff } from "../../auth/staff";
import { getPackAdmin, listPacksAdmin } from "../../catalog/admin";
import { listContactMessages } from "../../contact/service";
import { getCustomerDetail, listCustomers } from "../../customers/admin";
import { parseIstRange } from "../../dates";
import { getDiscountAdmin, listDiscountsAdmin } from "../../discounts/admin";
import { getStoreSettings } from "../../settings";
import { getLiveVisitors, getTrafficOverview, getVisitorDetail, listVisitors } from "../../visitors/reports";
import { runAction } from "../actions";
import { notFound } from "../http";
import type { Route } from "../router";

const page = (q: URLSearchParams) => z.coerce.number().int().min(1).max(10_000).catch(1).parse(q.get("page") ?? 1);
const str = (q: URLSearchParams, key: string) => q.get(key)?.slice(0, 120) || undefined;

/** Pack fields exactly as the web form posts them (prices in rupees). */
function packFields(body: Record<string, unknown>) {
  return {
    name: body.name,
    sku: body.sku,
    count: body.count,
    price: body.price,
    mrp: body.mrp,
    badge: body.badge ?? "",
    blurb: body.blurb ?? "",
    weightGrams: body.weightGrams,
    position: body.position ?? 0,
    status: body.status,
    trackInventory: body.trackInventory,
    lowStockThreshold: body.lowStockThreshold ?? 0,
  };
}

/** Discount fields exactly as the web form posts them (amounts in rupees, dates as IST "YYYY-MM-DDTHH:mm"). */
function discountFields(body: Record<string, unknown>) {
  return {
    code: body.code,
    description: body.description,
    type: body.type,
    percent: body.percent ?? "",
    amount: body.amount ?? "",
    minOrder: body.minOrder ?? "",
    maxDiscount: body.maxDiscount ?? "",
    startsAt: body.startsAt ?? "",
    endsAt: body.endsAt ?? "",
    usageLimit: body.usageLimit ?? "",
    oncePerCustomer: body.oncePerCustomer,
    active: body.active,
  };
}

export const storeRoutes: Route[] = [
  // ─── Products (packs) ──────────────────────────────────────────────────────
  { method: "GET", path: "products", access: "user", handler: async () => ({ packs: await listPacksAdmin() }) },
  {
    method: "GET",
    path: "products/:id",
    access: "user",
    handler: async ({ params }) => {
      const pack = await getPackAdmin(params.id);
      if (!pack) throw notFound("Pack");
      return pack;
    },
  },
  { method: "POST", path: "products", access: "owner", handler: ({ body }) => runAction(createPackAction, { ...packFields(body), stock: body.stock ?? 0 }) },
  {
    method: "PATCH",
    path: "products/:id",
    access: "owner",
    handler: ({ params, body }) =>
      runAction(updatePackAction, {
        id: params.id,
        ...packFields(body),
        ...(body.stock !== undefined ? { stock: body.stock, stockExpected: body.stockExpected } : {}),
      }),
  },
  { method: "DELETE", path: "products/:id", access: "owner", handler: ({ params }) => runAction(deletePackAction, { id: params.id }) },
  {
    method: "POST",
    path: "products/:id/stock",
    access: "user",
    handler: ({ params, body }) =>
      runAction(adjustStockAction, { id: params.id, direction: body.direction, quantity: body.quantity, reason: body.reason, note: body.note ?? "" }),
  },
  // ─── Customers ─────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "customers",
    access: "user",
    handler: ({ query }) =>
      listCustomers({ q: str(query, "q"), filter: str(query, "filter"), tag: str(query, "tag"), sort: str(query, "sort"), page: page(query) }),
  },
  {
    method: "GET",
    path: "customers/:id",
    access: "user",
    handler: async ({ params }) => {
      const customer = await getCustomerDetail(params.id);
      if (!customer) throw notFound("Customer");
      return customer;
    },
  },
  {
    method: "PATCH",
    path: "customers/:id",
    access: "user",
    handler: ({ params, body }) =>
      runAction(updateCustomerAction, {
        id: params.id,
        name: body.name,
        email: body.email ?? "",
        notes: body.notes ?? "",
        tags: Array.isArray(body.tags) ? body.tags.join(", ") : (body.tags ?? ""),
        codBlocked: body.codBlocked,
      }),
  },
  // ─── Discounts (owner) ─────────────────────────────────────────────────────
  { method: "GET", path: "discounts", access: "owner", handler: async () => ({ discounts: await listDiscountsAdmin() }) },
  {
    method: "GET",
    path: "discounts/:id",
    access: "owner",
    handler: async ({ params }) => {
      const discount = await getDiscountAdmin(params.id);
      if (!discount) throw notFound("Discount");
      return discount;
    },
  },
  { method: "POST", path: "discounts", access: "owner", handler: ({ body }) => runAction(createDiscountAction, discountFields(body)) },
  { method: "PATCH", path: "discounts/:id", access: "owner", handler: ({ params, body }) => runAction(updateDiscountAction, { id: params.id, ...discountFields(body) }) },
  {
    method: "POST",
    path: "discounts/:id/toggle",
    access: "owner",
    handler: ({ params, body }) => runAction(toggleDiscountAction, { id: params.id, active: body.active ? "true" : "false" }),
  },
  { method: "DELETE", path: "discounts/:id", access: "owner", handler: ({ params }) => runAction(deleteDiscountAction, { id: params.id }) },
  // ─── Contact messages ──────────────────────────────────────────────────────
  {
    method: "GET",
    path: "messages",
    access: "user",
    handler: async ({ query }) => {
      const status = z.enum(["new", "handled", "all"]).catch("new").parse(query.get("status") ?? "new");
      return { messages: await listContactMessages(status) };
    },
  },
  {
    method: "POST",
    path: "messages/:id/status",
    access: "user",
    handler: async ({ params, body }) => {
      const status = z.enum(["new", "handled"]).parse(body.status);
      await runAction(setMessageStatusAction as never, { id: params.id, status });
      return { ok: true, message: status === "handled" ? "Marked as handled." : "Moved back to new." };
    },
  },
  // ─── Reports (owner) ───────────────────────────────────────────────────────
  {
    method: "GET",
    path: "analytics",
    access: "owner",
    handler: async ({ query }) => {
      const range = parseIstRange(str(query, "from"), str(query, "to"));
      return { range, report: await getSalesReport(range) };
    },
  },
  {
    method: "GET",
    path: "visitors",
    access: "owner",
    handler: async ({ query }) => {
      const range = parseIstRange(str(query, "from"), str(query, "to"), 7, 366);
      const [report, live] = await Promise.all([getTrafficOverview(range), getLiveVisitors()]);
      return { range, report, live };
    },
  },
  { method: "GET", path: "visitors/live", access: "owner", handler: async () => ({ live: await getLiveVisitors() }) },
  {
    // The web list has no page number in its result; the app's infinite scroll needs one.
    method: "GET",
    path: "visitors/list",
    access: "owner",
    handler: async ({ query }) => {
      const p = page(query);
      return { ...(await listVisitors({ filter: str(query, "filter"), page: p })), page: p };
    },
  },
  {
    method: "GET",
    path: "visitors/:id",
    access: "owner",
    handler: async ({ params }) => {
      const visitor = await getVisitorDetail(params.id);
      if (!visitor) throw notFound("Visitor");
      return visitor;
    },
  },
  // ─── Search ────────────────────────────────────────────────────────────────
  { method: "GET", path: "search", access: "user", handler: ({ query }) => adminSearch(query.get("q")?.slice(0, 80) ?? "") },
  // ─── Settings, staff, activity (owner) ─────────────────────────────────────
  { method: "GET", path: "settings", access: "owner", handler: async () => ({ settings: await getStoreSettings() }) },
  {
    method: "PATCH",
    path: "settings",
    access: "owner",
    handler: ({ body }) => runAction(updateCheckoutSettingsAction, { codFee: body.codFee, codMaxOrderValue: body.codMaxOrderValue }),
  },
  { method: "GET", path: "staff", access: "owner", handler: async () => ({ staff: await listStaff() }) },
  {
    method: "GET",
    path: "staff/:id",
    access: "owner",
    handler: async ({ params }) => {
      const member = await getStaff(params.id);
      if (!member) throw notFound("Staff member");
      return member;
    },
  },
  { method: "POST", path: "staff", access: "owner", handler: ({ body }) => runAction(createStaffAction, { name: body.name, email: body.email, role: body.role }) },
  {
    method: "PATCH",
    path: "staff/:id",
    access: "owner",
    handler: ({ params, body }) => runAction(updateStaffAction, { id: params.id, name: body.name, role: body.role, active: body.active }),
  },
  { method: "POST", path: "staff/:id/reset", access: "owner", handler: ({ params }) => runAction(resetStaffPasswordAction, { id: params.id }) },
  {
    method: "GET",
    path: "activity",
    access: "owner",
    handler: ({ query }) => listAudit({ page: page(query), entityType: str(query, "entityType"), entityId: str(query, "entityId") }),
  },
];
