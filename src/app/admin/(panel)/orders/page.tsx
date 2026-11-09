import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Search, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { OrdersTable } from "@/components/admin/orders-table";
import {
  adminInput,
  adminSelect,
  EmptyState,
  listHref,
  PageHeader,
  Pagination,
  param,
  Tabs,
} from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { listOrders, ORDER_SORTS, ORDER_VIEWS } from "@/lib/orders/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

const FILTER_KEYS = ["payment", "paymentStatus", "source", "tag", "from", "to", "sort"] as const;

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const current = {
    status: param(sp.status),
    q: param(sp.q),
    payment: param(sp.payment),
    paymentStatus: param(sp.paymentStatus),
    source: param(sp.source),
    tag: param(sp.tag),
    from: param(sp.from),
    to: param(sp.to),
    sort: param(sp.sort),
  };
  const page = Number.parseInt(param(sp.page) ?? "1", 10) || 1;
  const { rows, total, pageCount } = await listOrders({ ...current, page });
  const activeFilters = FILTER_KEYS.filter((k) => current[k]).length;
  const exportQuery = new URLSearchParams(
    Object.entries(current).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        actions={
          <>
            {user.role === "owner" && (
              <a
                href={`/admin/export${exportQuery ? `?${exportQuery}` : ""}`}
                className={buttonClasses("outline", "sm")}
              >
                <Download className="size-4" /> Export CSV
              </a>
            )}
            <Link href="/admin/orders/new" className={buttonClasses("primary", "sm")}>
              <Plus className="size-4" /> Create order
            </Link>
          </>
        }
      />

      <Tabs
        label="Order views"
        items={ORDER_VIEWS.map((v) => ({
          href: listHref("/admin/orders", { ...current, status: undefined }, { status: v.key || undefined }),
          label: v.label,
          active: (current.status ?? "") === v.key,
        }))}
      />

      <div className="flex flex-wrap gap-2">
        <form className="relative min-w-0 flex-1 basis-64" action="/admin/orders" role="search">
          {Object.entries(current)
            .filter(([k, v]) => k !== "q" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            type="search"
            defaultValue={current.q}
            placeholder="Order no., name, phone, email or AWB"
            className={cn(adminInput, "pl-10")}
            aria-label="Search orders"
          />
        </form>
        <details className="relative">
          <summary
            className={cn(
              buttonClasses("outline", "sm", "h-11 sm:h-10"),
              activeFilters > 0 && "border-brand text-brand",
            )}
          >
            <SlidersHorizontal className="size-4" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </summary>
          <form
            action="/admin/orders"
            className="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-line"
          >
            {current.status && <input type="hidden" name="status" value={current.status} />}
            {current.q && <input type="hidden" name="q" value={current.q} />}
            <label className="grid gap-1 text-sm font-semibold">
              Payment method
              <select name="payment" defaultValue={current.payment ?? ""} className={adminSelect}>
                <option value="">Any</option>
                <option value="cod">Cash on Delivery</option>
                <option value="prepaid">Prepaid</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Payment status
              <select name="paymentStatus" defaultValue={current.paymentStatus ?? ""} className={adminSelect}>
                <option value="">Any</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="partially_refunded">Partly refunded</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Source
              <select name="source" defaultValue={current.source ?? ""} className={adminSelect}>
                <option value="">Any</option>
                <option value="web">Website checkout</option>
                <option value="admin">Created by staff</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Tag
              <input name="tag" defaultValue={current.tag} maxLength={30} className={adminInput} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm font-semibold">
                From
                <input type="date" name="from" defaultValue={current.from} className={adminInput} />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                To
                <input type="date" name="to" defaultValue={current.to} className={adminInput} />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-semibold">
              Sort
              <select name="sort" defaultValue={current.sort ?? "newest"} className={adminSelect}>
                {Object.entries(ORDER_SORTS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className={buttonClasses("primary", "sm", "flex-1")}>
                Apply filters
              </button>
              <Link
                href={listHref("/admin/orders", {}, { status: current.status, q: current.q })}
                className={buttonClasses("outline", "sm")}
              >
                Clear
              </Link>
            </div>
          </form>
        </details>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-card">
          <EmptyState
            icon={ShoppingBag}
            title={total === 0 && !current.q && !activeFilters && !current.status ? "No orders yet" : "No orders match"}
          >
            {current.q || activeFilters || current.status
              ? "Try a different search or clear the filters."
              : "Orders from the website, and the ones you create, show up here."}
          </EmptyState>
        </div>
      ) : (
        <OrdersTable rows={rows} />
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        noun={["order", "orders"]}
        href={(p) => listHref("/admin/orders", current, { page: p })}
      />
    </div>
  );
}
