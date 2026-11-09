import type { OrderStatus } from "../db/schema";

/** Order vocabulary shared by the admin's server and client components. */

export const ORDER_STATUSES: OrderStatus[] = [
  "pending_payment",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "rto",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  processing: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rto: "Returned (RTO)",
};

/**
 * Allowed manual transitions in the admin panel. An unpaid online order can't
 * simply be "confirmed" (it would ship with no money collected): use
 * "Confirm as Cash on Delivery" instead, which re-prices it with the COD fee.
 */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["confirmed", "shipped", "cancelled"],
  shipped: ["delivered", "rto"],
  delivered: [],
  cancelled: [],
  rto: [],
};

export const CANCEL_REASONS = [
  "Customer asked to cancel",
  "Couldn't reach the customer",
  "Fake or test order",
  "Out of stock",
  "Payment not completed",
  "Address not serviceable",
  "Other",
] as const;

/** Tabs on the orders page: a status, or a work queue. */
export const ORDER_VIEWS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "to_verify", label: "COD to verify" },
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "pending_payment", label: "Awaiting payment" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rto", label: "Returned (RTO)" },
];

export const ORDER_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  total_desc: "Highest total",
  total_asc: "Lowest total",
} as const;

export const BULK_ACTIONS = {
  mark_packed: "Mark as packed",
  mark_shipped: "Mark as shipped",
  mark_delivered: "Mark as delivered",
  verify_cod: "Mark COD verified",
  cancel_unpaid: "Cancel unpaid checkouts",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
} as const;
export type BulkAction = keyof typeof BULK_ACTIONS;
