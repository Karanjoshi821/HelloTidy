import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { PaymentBadge, StatusBadge } from "@/components/admin/status";
import { adminInput, Card, PageHeader, param } from "@/components/admin/ui";
import { Badge } from "@/components/ui/layout";
import { adminSearch } from "@/lib/admin-search";
import { requireAdmin } from "@/lib/auth/dal";
import { formatPaise } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function SearchPage({ searchParams }: PageProps<"/admin/search">) {
  const user = await requireAdmin();
  const q = param((await searchParams).q)?.trim() ?? "";
  const results = q ? await adminSearch(q) : null;
  const total = results
    ? results.orders.length +
      results.customers.length +
      results.packs.length +
      (user.role === "owner" ? results.discounts.length : 0)
    : 0;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Search" />
      <form action="/admin/search" role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          type="search"
          defaultValue={q}
          autoFocus
          placeholder="Order number, name, phone, email, AWB, SKU or discount code"
          className={cn(adminInput, "pl-10")}
          aria-label="Search the admin"
        />
      </form>

      {q && q.length < 2 && <p className="text-sm text-muted">Type at least 2 characters.</p>}
      {results && total === 0 && <p className="text-sm text-muted">Nothing found for “{q}”.</p>}

      {results && results.orders.length > 0 && (
        <Section title="Orders">
          {results.orders.map((o) => (
            <Row key={o.id} href={`/admin/orders/${o.id}`}>
              <span className="font-mono font-bold text-brand">{o.orderNumber}</span>
              <span className="min-w-0 flex-1 truncate">{o.customerName}</span>
              <StatusBadge status={o.status} />
              <PaymentBadge method={o.paymentMethod} status={o.paymentStatus} />
              <span className="font-semibold">{formatPaise(o.total)}</span>
              <span className="w-full text-xs text-muted">{formatDateTime(o.createdAt)}</span>
            </Row>
          ))}
        </Section>
      )}
      {results && results.customers.length > 0 && (
        <Section title="Customers">
          {results.customers.map((c) => (
            <Row key={c.id} href={`/admin/customers/${c.id}`}>
              <span className="font-bold">{c.name}</span>
              <span className="text-muted">
                +91 {c.phone}
                {c.email ? ` · ${c.email}` : ""}
              </span>
            </Row>
          ))}
        </Section>
      )}
      {results && results.packs.length > 0 && (
        <Section title="Products">
          {results.packs.map((p) => (
            <Row key={p.id} href={`/admin/products/${encodeURIComponent(p.id)}`}>
              <span className="font-bold">{p.name}</span>
              <span className="font-mono text-xs text-muted">{p.sku}</span>
              {p.status === "hidden" && <Badge tone="neutral">Hidden</Badge>}
            </Row>
          ))}
        </Section>
      )}
      {results && user.role === "owner" && results.discounts.length > 0 && (
        <Section title="Discounts">
          {results.discounts.map((d) => (
            <Row key={d.id} href={`/admin/discounts/${d.id}`}>
              <span className="font-mono font-bold">{d.code}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{d.description}</span>
              {!d.active && <Badge tone="neutral">Disabled</Badge>}
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title} bodyClassName="p-0 sm:p-0">
      <ul className="divide-y divide-line border-t border-line">{children}</ul>
    </Card>
  );
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-surface sm:px-5"
      >
        {children}
      </Link>
    </li>
  );
}
