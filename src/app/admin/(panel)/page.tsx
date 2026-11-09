import type { Metadata } from "next";
import Link from "next/link";
import {
  CircleDashed,
  MessageSquare,
  Package,
  PackageCheck,
  PhoneCall,
  Plus,
  ShoppingCart,
  Truck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { BarChart, shortLabel } from "@/components/admin/bar-chart";
import { PaymentBadge, StatusBadge } from "@/components/admin/status";
import { Card, EmptyState, Notice, PageHeader, percentChange, StatCard } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { getLaunchChecklist, type ChecklistItem } from "@/lib/launch-checklist";
import { formatPaise } from "@/lib/money";
import { getHomeStats } from "@/lib/orders/admin";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function HomePage({ searchParams }: PageProps<"/admin">) {
  const user = await requireAdmin();
  const [stats, sp] = await Promise.all([getHomeStats(), searchParams]);
  const isOwner = user.role === "owner";

  const todos: { href: string; label: string; hint: string; n: number; icon: LucideIcon; urgent?: boolean }[] = [
    {
      href: "/admin/orders?status=to_verify",
      label: "COD orders to verify",
      hint: "Call or WhatsApp before shipping",
      n: stats.queue.toVerify,
      icon: PhoneCall,
    },
    {
      href: "/admin/orders?status=confirmed",
      label: "To pack",
      hint: "Confirmed orders",
      n: stats.queue.toPack,
      icon: Package,
    },
    {
      href: "/admin/orders?status=processing",
      label: "To ship",
      hint: "Packed, waiting for pickup",
      n: stats.queue.toShip,
      icon: PackageCheck,
    },
    {
      href: "/admin/orders?status=shipped",
      label: "Shipped over 7 days ago",
      hint: "Check with the courier",
      n: stats.queue.staleShipped,
      icon: Truck,
      urgent: true,
    },
    {
      href: "/admin/checkouts",
      label: "Abandoned checkouts",
      hint: "Last 7 days · send a reminder",
      n: stats.queue.abandoned,
      icon: ShoppingCart,
    },
    {
      href: "/admin/messages",
      label: "New messages",
      hint: "From the contact form",
      n: stats.newMessages,
      icon: MessageSquare,
    },
  ];
  const openTodos = todos.filter((t) => t.n > 0);
  const checklist = isOwner ? getLaunchChecklist({ stockTracked: stats.trackedPacks > 0 }) : [];
  const pending = checklist.filter((c) => !c.done);

  return (
    <div className="space-y-6">
      {sp.denied && <Notice tone="warn">That page is only available to the store owner.</Notice>}
      <PageHeader
        title={`Hi ${user.name.split(" ")[0]}`}
        description="Here's what needs doing today. Times are India time (IST)."
        actions={
          <Link href="/admin/orders/new" className={buttonClasses("primary", "sm")}>
            <Plus className="size-4" /> Create order
          </Link>
        }
      />

      {isOwner && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Sales today"
            value={formatPaise(stats.today.revenue)}
            hint={`${stats.today.orders} orders`}
          />
          <StatCard
            label="Last 7 days"
            value={formatPaise(stats.week.revenue)}
            hint={`${stats.week.orders} orders`}
            change={percentChange(stats.week.revenue, stats.prevWeek.revenue)}
          />
          <StatCard
            label="Last 30 days"
            value={formatPaise(stats.month.revenue)}
            hint={`${stats.month.orders} orders`}
            change={percentChange(stats.month.revenue, stats.prevMonth.revenue)}
          />
          <StatCard
            label="Average order (30 days)"
            value={formatPaise(stats.month.orders ? Math.round(stats.month.revenue / stats.month.orders) : 0)}
            hint="Net of refunds"
            href="/admin/analytics"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="To do" description={openTodos.length ? undefined : "You're all caught up."}>
            {openTodos.length === 0 ? (
              <p className="text-sm text-muted">New orders, returns and messages will show up here.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {openTodos.map((t) => (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 hover:border-brand",
                        t.urgent ? "border-warn/40 bg-warn-soft/40" : "border-line",
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-brand">
                        <t.icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{t.label}</span>
                        <span className="block truncate text-xs text-muted">{t.hint}</span>
                      </span>
                      <span className="text-xl font-extrabold">{t.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isOwner && pending.length > 0 && (
            <div className="lg:hidden">
              <SetupGuide checklist={checklist} />
            </div>
          )}

          {isOwner && (
            <Card
              title="Sales, last 14 days"
              description="Net of refunds; excludes unpaid, cancelled and returned orders."
            >
              <BarChart
                data={stats.series.map((d) => ({ label: d.day, short: shortLabel(d.day), value: d.revenue }))}
                format={formatPaise}
                caption="Daily sales for the last 14 days"
              />
            </Card>
          )}

          <Card
            title="Recent orders"
            actions={
              <Link href="/admin/orders" className="text-sm font-semibold text-brand hover:underline">
                View all
              </Link>
            }
            bodyClassName="p-0 sm:p-0"
          >
            {stats.recent.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders yet">
                They show up here the moment they come in.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {stats.recent.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                    >
                      <span className="font-mono text-sm font-semibold">{o.orderNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {o.customerName} <span className="text-muted">· {o.city}</span>
                      </span>
                      <span className="text-sm font-semibold">{formatPaise(o.total)}</span>
                      <span className="flex w-full flex-wrap items-center gap-2">
                        <StatusBadge status={o.status} />
                        <PaymentBadge
                          method={o.paymentMethod}
                          status={o.paymentStatus}
                          refundedAmount={o.refundedAmount}
                        />
                        <span className="ml-auto text-xs text-muted">{formatDateTime(o.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isOwner && pending.length > 0 && (
            <div className="hidden lg:block">
              <SetupGuide checklist={checklist} />
            </div>
          )}
          <Card
            title="Stock alerts"
            actions={
              <Link href="/admin/products" className="text-sm font-semibold text-brand hover:underline">
                Products
              </Link>
            }
          >
            {stats.lowStock.length === 0 ? (
              <p className="text-sm text-muted">
                {stats.trackedPacks
                  ? "All tracked packs are above their low-stock level."
                  : "Stock isn't tracked yet. Switch it on per pack in Products when your stock arrives."}
              </p>
            ) : (
              <ul className="space-y-2">
                {stats.lowStock.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/products/${p.id}`} className="flex items-center gap-2 text-sm hover:underline">
                      <TriangleAlert className={cn("size-4 shrink-0", p.stock <= 0 ? "text-danger" : "text-warn")} />
                      <span className="flex-1">{p.name}</span>
                      <span className={cn("font-bold", p.stock <= 0 ? "text-danger" : "text-warn")}>
                        {p.stock <= 0 ? (p.stock < 0 ? `Oversold (${p.stock})` : "Sold out") : `${p.stock} left`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Compact launch checklist: what's left before running ads. Details live in Settings. */
function SetupGuide({ checklist }: { checklist: ChecklistItem[] }) {
  const done = checklist.filter((c) => c.done).length;
  return (
    <Card
      title="Setup guide"
      description={`${done} of ${checklist.length} done`}
      actions={
        <Link href="/admin/settings" className="text-sm font-semibold text-brand hover:underline">
          Details
        </Link>
      }
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-success" style={{ width: `${(done / checklist.length) * 100}%` }} />
      </div>
      <ul className="space-y-2">
        {checklist
          .filter((c) => !c.done)
          .map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.required && (
                <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Required</span>
              )}
            </li>
          ))}
      </ul>
    </Card>
  );
}
