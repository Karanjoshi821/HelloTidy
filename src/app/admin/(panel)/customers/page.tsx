import type { Metadata } from "next";
import Link from "next/link";
import { Download, Search, Users } from "lucide-react";
import { TagList } from "@/components/admin/status";
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
import { Badge } from "@/components/ui/layout";
import { requireAdmin } from "@/lib/auth/dal";
import { CUSTOMER_FILTERS, CUSTOMER_SORTS, listCustomers } from "@/lib/customers/admin";
import { formatPaise } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const current = { q: param(sp.q), filter: param(sp.filter), tag: param(sp.tag), sort: param(sp.sort) };
  const page = Number.parseInt(param(sp.page) ?? "1", 10) || 1;
  const { rows, total, pageCount } = await listCustomers({ ...current, page });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description="Everyone who has checked out, by mobile number. Totals exclude unpaid, cancelled and returned orders."
        actions={
          user.role === "owner" && (
            <a href="/admin/export/customers" className={buttonClasses("outline", "sm")}>
              <Download className="size-4" /> Export CSV
            </a>
          )
        }
      />
      <Tabs
        label="Customer filters"
        items={Object.entries(CUSTOMER_FILTERS).map(([key, label]) => ({
          href: listHref(
            "/admin/customers",
            { ...current, filter: undefined },
            { filter: key === "all" ? undefined : key },
          ),
          label,
          active: (current.filter ?? "all") === key,
        }))}
      />
      <form className="flex flex-wrap gap-2" action="/admin/customers" role="search">
        {current.filter && <input type="hidden" name="filter" value={current.filter} />}
        {current.tag && <input type="hidden" name="tag" value={current.tag} />}
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            type="search"
            defaultValue={current.q}
            placeholder="Name, phone or email"
            className={cn(adminInput, "pl-10")}
            aria-label="Search customers"
          />
        </div>
        <select
          name="sort"
          defaultValue={current.sort ?? "recent"}
          className={cn(adminSelect, "w-auto")}
          aria-label="Sort"
        >
          {Object.entries(CUSTOMER_SORTS).map(([key, label]) => (
            <option key={key} value={key}>
              Sort: {label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClasses("secondary", "sm", "h-11 sm:h-10")}>
          Go
        </button>
      </form>
      {current.tag && (
        <p className="text-sm">
          Tagged <strong>{current.tag}</strong> ·{" "}
          <Link href={listHref("/admin/customers", current, { tag: undefined })} className="text-brand underline">
            clear
          </Link>
        </p>
      )}

      <div className="rounded-2xl bg-white shadow-card">
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={current.q || current.filter || current.tag ? "No customers match" : "No customers yet"}
          >
            Customers appear here after their first checkout.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/customers/${c.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                >
                  <span className="min-w-0 flex-1 basis-52">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{c.name}</span>
                      {c.codBlocked && <Badge tone="danger">COD blocked</Badge>}
                      {c.rto > 0 && <Badge tone="warn">{c.rto} RTO</Badge>}
                      <TagList tags={c.tags} />
                    </span>
                    <span className="block text-xs text-muted">
                      +91 {c.phone}
                      {c.email ? ` · ${c.email}` : ""}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="font-bold">{formatPaise(c.spent)}</span>
                    <span className="text-muted">
                      {" "}
                      · {c.orders} order{c.orders === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="w-full text-xs text-muted sm:w-32 sm:text-right">
                    {c.lastOrderAt ? `Last order ${formatDate(c.lastOrderAt)}` : "No completed order"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        noun={["customer", "customers"]}
        href={(p) => listHref("/admin/customers", current, { page: p })}
      />
    </div>
  );
}
