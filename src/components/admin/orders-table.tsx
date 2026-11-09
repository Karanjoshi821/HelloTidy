"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, PhoneCall, Printer } from "lucide-react";
import { bulkOrdersAction } from "@/app/admin/order-actions";
import type { ActionResult } from "@/lib/action-result";
import type { Order } from "@/lib/db/schema";
import { formatPaise } from "@/lib/money";
import { BULK_ACTIONS, type BulkAction } from "@/lib/orders/labels";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatDateTime } from "@/lib/utils";
import { PaymentBadge, StatusBadge, TagList } from "./status";
import { adminInput, adminSelect } from "./ui";

export type OrderRow = Pick<
  Order,
  | "id"
  | "orderNumber"
  | "customerName"
  | "phone"
  | "city"
  | "state"
  | "total"
  | "status"
  | "paymentMethod"
  | "paymentStatus"
  | "refundedAmount"
  | "codVerifiedAt"
  | "tags"
  | "source"
  | "createdAt"
> & { items: number };

/** Orders list with checkboxes and a bulk-action bar. Rows link to the order. */
export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | "">("");
  const { state, onSubmit, pending } = useFormAction<ActionResult>(async (prev, formData) => {
    const result = await bulkOrdersAction(prev, formData);
    if (result?.ok) setSelected(new Set());
    return result;
  }, null);

  const visibleIds = rows.map((r) => r.id);
  const allSelected = rows.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleIds));
  const ids = [...selected].filter((id) => visibleIds.includes(id));

  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="size-4 accent-brand"
            aria-label="Select all orders on this page"
          />
          {ids.length ? `${ids.length} selected` : "Select"}
        </label>
        <span className="ml-auto hidden text-xs font-semibold text-muted md:block">Total · placed</span>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((o) => {
          const unverified =
            o.paymentMethod === "cod" && !o.codVerifiedAt && ["confirmed", "processing"].includes(o.status);
          return (
            <li
              key={o.id}
              className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", selected.has(o.id) && "bg-brand-soft/40")}
            >
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggle(o.id)}
                className="mt-1 size-4 shrink-0 accent-brand"
                aria-label={`Select order ${o.orderNumber}`}
              />
              <Link href={`/admin/orders/${o.id}`} className="group min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm font-bold text-brand group-hover:underline">{o.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.customerName}</span>
                  <span className="text-sm font-bold">{formatPaise(o.total)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={o.status} />
                  <PaymentBadge method={o.paymentMethod} status={o.paymentStatus} refundedAmount={o.refundedAmount} />
                  {unverified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">
                      <PhoneCall className="size-3" aria-hidden="true" /> Verify
                    </span>
                  )}
                  {o.source === "admin" && <span className="text-xs font-semibold text-muted">Manual</span>}
                  <TagList tags={o.tags} />
                </div>
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                  <span>
                    {o.items} item{o.items === 1 ? "" : "s"} · {o.city}, {o.state} · {o.phone}
                  </span>
                  <span>{formatDateTime(o.createdAt)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {ids.length > 0 && (
        <form
          onSubmit={onSubmit}
          className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:px-5"
        >
          {ids.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-sm font-bold">{ids.length} selected</span>
          <select
            name="action"
            value={action}
            onChange={(e) => setAction(e.target.value as BulkAction | "")}
            className={cn(adminSelect, "w-auto min-w-44 flex-1 sm:flex-none")}
            aria-label="Bulk action"
            required
          >
            <option value="">Choose an action…</option>
            {Object.entries(BULK_ACTIONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {(action === "add_tag" || action === "remove_tag") && (
            <input
              name="tag"
              placeholder="Tag"
              maxLength={30}
              className={cn(adminInput, "w-36")}
              aria-label="Tag"
              required
            />
          )}
          <button
            type="submit"
            disabled={pending || !action}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Apply
          </button>
          <a
            href={`/admin/print/orders?ids=${ids.join(",")}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface"
          >
            <Printer className="size-4" /> Print slips
          </a>
          {state && (
            <p
              className={cn("w-full text-sm whitespace-pre-line", state.ok ? "text-success" : "text-danger")}
              role={state.ok ? "status" : "alert"}
            >
              {state.message}
            </p>
          )}
        </form>
      )}
      {ids.length === 0 && state && (
        <p
          className={cn("px-5 py-3 text-sm whitespace-pre-line", state.ok ? "text-success" : "text-danger")}
          role="status"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
