import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Plus } from "lucide-react";
import { updateCustomerAction } from "@/app/admin/settings-actions";
import { ActionForm } from "@/components/admin/action-form";
import { PaymentBadge, StatusBadge } from "@/components/admin/status";
import { adminInput, adminTextarea, Card, PageHeader, StatCard } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { requireAdmin } from "@/lib/auth/dal";
import { getCustomerDetail } from "@/lib/customers/admin";
import { formatPaise } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Customer" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  if (!detail) notFound();
  const { customer, orders, addresses, stats } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        title={customer.name}
        badges={
          <>
            {customer.codBlocked && <Badge tone="danger">COD blocked</Badge>}
            {stats.orders >= 2 && <Badge tone="success">Repeat buyer</Badge>}
          </>
        }
        description={`Customer since ${formatDate(customer.createdAt)}`}
        actions={
          <>
            <a href={`tel:+91${customer.phone}`} className={buttonClasses("outline", "sm")}>
              <Phone className="size-4" /> Call
            </a>
            <a
              href={`https://wa.me/91${customer.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("whatsapp", "sm")}
            >
              <WhatsAppIcon className="size-4" /> WhatsApp
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spent" value={formatPaise(stats.spent)} hint="Net of refunds" />
        <StatCard label="Orders" value={stats.orders} hint={`${stats.cod} COD · ${stats.prepaid} prepaid`} />
        <StatCard label="Average order" value={formatPaise(stats.averageOrder)} />
        <StatCard
          label="Returns (RTO)"
          value={stats.rto}
          hint={stats.delivered + stats.rto ? `${stats.rtoRate}% of finished deliveries` : "No finished deliveries yet"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card
          title="Orders"
          actions={
            <Link
              href="/admin/orders/new"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
            >
              <Plus className="size-4" /> New order
            </Link>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {orders.length === 0 ? (
            <p className="p-5 text-sm text-muted">No orders.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                  >
                    <span className="font-mono text-sm font-bold text-brand">{o.orderNumber}</span>
                    <StatusBadge status={o.status} />
                    <PaymentBadge method={o.paymentMethod} status={o.paymentStatus} refundedAmount={o.refundedAmount} />
                    <span className="ml-auto text-sm font-semibold">{formatPaise(o.total)}</span>
                    <span className="w-full text-xs text-muted">
                      {formatDateTime(o.createdAt)} · {o.city}
                      {o.couponCode ? ` · code ${o.couponCode}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Contact">
            <p className="text-sm">
              +91 {customer.phone}
              {customer.email && (
                <>
                  <br />
                  <a href={`mailto:${customer.email}`} className="text-muted hover:underline">
                    {customer.email}
                  </a>
                </>
              )}
            </p>
            {addresses.length > 0 && (
              <>
                <p className="mt-4 text-xs font-bold text-muted uppercase">Delivery addresses</p>
                <ul className="mt-1 space-y-2 text-sm">
                  {addresses.map((a, i) => (
                    <li key={i}>
                      {a.lines}
                      <br />
                      <span className="text-muted">
                        {a.city}, {a.state} — {a.pincode}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Edit customer">
            <ActionForm action={updateCustomerAction} className="grid gap-3">
              <input type="hidden" name="id" value={customer.id} />
              <label className="grid gap-1 text-sm font-semibold">
                Name
                <input name="name" defaultValue={customer.name} required maxLength={80} className={adminInput} />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={customer.email ?? ""}
                  maxLength={120}
                  className={adminInput}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Tags
                <input
                  name="tags"
                  key={customer.tags.join(",")}
                  defaultValue={customer.tags.join(", ")}
                  placeholder="e.g. vip, wholesale"
                  className={adminInput}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Notes
                <textarea
                  name="notes"
                  defaultValue={customer.notes ?? ""}
                  rows={3}
                  maxLength={2000}
                  className={adminTextarea}
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="codBlocked"
                  defaultChecked={customer.codBlocked}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span>
                  <span className="font-semibold">Block Cash on Delivery</span>
                  <span className="block text-muted">For repeat refusals: this number can only pay online.</span>
                </span>
              </label>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Save
              </button>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
